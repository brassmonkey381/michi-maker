# Free PRO trials & over-cap reclaim

> **STATUS: SHIPPED AND APPLIED IN BOTH APPS.**
>
> - **michi** — migration `20260721120000_pro_trials_and_reclaim.sql`, applied at go-live
>   (2026-07-22, deliberately after the test-data cleanup so no test-mode entitlement could hand
>   out a trial or trip a reclaim grace). Nightly `pg_cron` job `reclaim-over-cap` at `17 3 * * *`.
> - **tcgscan** — migration `20260723120000_tcgscan_trials_and_collection_reclaim.sql`, applied
>   2026-07-23. Same design over **collections** instead of binders, with one significant extra
>   problem to solve (local-first sync). Nightly job at `37 3 * * *`. See **Porting it to tcgscan**
>   at the end of this doc.
>
> Names drifted slightly from the sketches below: the shipped michi migration is one file (not the
> two filenames quoted in the SQL blocks), and it also carries `reclaim_all_over_cap()` — the
> no-keep-list variant the cron job calls.
>
> **Neither app's reclaim path has been exercised end to end with a real lapsed subscription.** It
> is sandbox-verified (see the test plan at the bottom), not production-observed.

A **14-day, no-card PRO trial**, one per real account, offered at high-intent moments. Pairs with
`docs/PAYMENTS.md` (how tiers/entitlements work) and `docs/GO-LIVE-BILLING.md` (the checkout cutover).

## Decision & rationale

- **Mechanism: entitlement grant, NOT a Stripe trial.** The trial is an ordinary `tier_pro`
  entitlement row with `source='trial'` and a 14-day `expires_at`. Everything downstream —
  `resolveTier`, `hasFullPrint`, caps, the print allowance — already keys on entitlement rows and
  their `expires_at`, so nothing about tier resolution changes. Fits the accepted **freemium,
  no-card-on-file** integration decision; no Stripe subscription, no card, **zero involuntary
  charges → zero trial-conversion chargebacks**.
- **Duration: 14 days.** Long enough to curate a binder worth printing and to bump the Free caps;
  short enough to keep urgency. (7 is too short for the print arc; 30 dissolves urgency.)
- **Timing: triggered, not blanket-at-signup.** Offer it where a Free user hits the wall — 4th
  binder, 17th page, 101st artwork, or the Print button — reusing the existing `UpgradePerk` /
  locked-box surfaces. A signup-time grant wastes the "state you'd lose" mechanic because nothing's
  been built yet.
- **Trial PRO, never VIP.** Trial the entry tier, convert to PRO, upsell VIP later.

The conversion engine is **loss aversion at expiry**: a lapsed trial user who built 8 binders now
exceeds Free's 3. Rather than keep the excess visible forever (which is itself a loophole — see
below), they get a **warned 3-day grace, then the excess is archived** (locked, recoverable on
subscribe). "5 binders lock in 3 days unless you subscribe" is far stronger than a silent cap, and
it closes the abuse vector. See **Over-cap reclaim** below.

### Over-cap reclaim on downgrade (closes the "keep exploring for free" loophole)

**The loophole:** if an expired trial (or a cancelled subscription) leaves 8 binders merely
view-only, the user keeps 8 binders' worth of curation space forever — deleting and rebuilding pages
within them to keep exploring, i.e. most of PRO's value for free after one trial. (The existing
`addPage` guard blocks *growing* an over-cap binder, but not churning content inside it.)

**The fix — reclaim excess down to the tier cap, after a warned grace.** This is a general
**downgrade** mechanic (trial expiry *and* subscription cancel/lapse both land a user over cap on
Free); trials are just the first driver.

- **Soft-archive, not hard-delete.** Add `binders.archived_at timestamptz` (null = live). Archived
  binders are hidden from every grid and non-interactive — which removes the exploration value and
  kills the loophole — but the data is preserved. This is deliberately NOT destruction: it is
  recoverable, and "5 binders locked — subscribe to unlock" is a standing upsell. (Hard-deletion, if
  ever wanted, is a separate much-later policy, e.g. archived > 90 days; default is keep.)
- **3-day grace, deadline DERIVED (no scheduler needed for the clock).** The reference instant is
  the lapsed tier row's `expires_at`; `reclaim_deadline = that + 3 days`. Server-derivable and
  identical for a trial or a cancellation — no stamp table.
- **User agency during grace.** The warning lets the user (a) **subscribe** → keep everything and
  cancel the reclaim; or (b) **choose which N to keep**; the rest archive at grace end. Default if
  they pick nothing: keep the `cap` most-recently-`updated_at` binders (their active work), archive
  the rest.
- **Auto-restore.** When the cap rises again (they subscribe/upgrade), un-archive up to the new cap,
  newest-first, and tell them ("PRO restored — your 5 locked binders are back").

**Enforcement.** The client renders the warning + keep-picker and calls a `SECURITY DEFINER`
`reclaim_over_cap(keep_ids uuid[])` RPC that validates ownership + that the user is genuinely over
cap with an expired grace, then sets `archived_at` on the excess (idempotent). For robustness
against a tampered client, a **scheduled reclaim** (Supabase `pg_cron`, nightly) runs the same
default archival for anyone past grace — recommended as the authoritative enforcer; the RPC is what
makes the in-app "choose which to keep / subscribe now" flow instant. (No-cron fallback: run the
default reclaim lazily on load. The abuse needs the user *in* the app, which is exactly when the lazy
check fires.)

**Pages are NOT reclaimed (v1).** Archiving whole excess binders already removes the page-churn
value (an archived binder can't be explored). Within a KEPT binder, over-cap pages stay but can't
grow (existing `addPage` guard), so no perpetual exploration. Page-level reclaim is more destructive
and granular — deferred unless it proves necessary.

**Schema + RPCs.**

```sql
-- supabase/migrations/20260721130000_binder_archive_and_reclaim.sql
alter table public.binders add column archived_at timestamptz;  -- null = live
create index binders_user_live_idx on public.binders (user_id) where archived_at is null;

-- The FREE binder cap, mirrored from tiers.ts TIER_LIMITS.free.binders (Deno/SQL can't import it —
-- same discipline as PRINTS_PER_MONTH in the webhook; change both together).
create or replace function public.free_binder_cap() returns integer
  language sql immutable as $$ select 3 $$;

-- Archive the caller's over-cap excess, keeping keep_ids. Security definer; enforces server-side
-- that the caller (a) has NO active paid/trial tier, (b) is past their 3-day reclaim grace, and
-- (c) isn't keeping more than the Free cap. Idempotent.
create or replace function public.reclaim_over_cap(keep_ids uuid[])
returns integer                                   -- how many were archived
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); grace_end timestamptz; n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  -- No reclaim while an entitlement is active (paid OR trial still running).
  if exists (select 1 from public.entitlements e
             where e.user_id = uid and e.product in ('tier_pro','tier_vip')
               and (e.expires_at is null or e.expires_at > now())) then
    raise exception 'still entitled' using errcode = 'P0001';
  end if;

  -- Grace = latest lapsed tier row's expiry + 3 days. Null (never subscribed/trialed) → no grace gate.
  select max(e.expires_at) + interval '3 days' into grace_end
    from public.entitlements e
   where e.user_id = uid and e.product in ('tier_pro','tier_vip');
  if grace_end is not null and now() < grace_end then
    raise exception 'still in grace' using errcode = 'P0001';
  end if;

  if array_length(keep_ids, 1) > public.free_binder_cap() then
    raise exception 'keep list exceeds the free cap' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(keep_ids) k
             where not exists (select 1 from public.binders b where b.id = k and b.user_id = uid)) then
    raise exception 'keep list contains a binder that is not yours' using errcode = 'P0001';
  end if;

  update public.binders set archived_at = now()
   where user_id = uid and archived_at is null and id <> all(keep_ids);
  get diagnostics n = row_count;
  return n;
end; $$;

-- Bring archived binders back, newest-first, up to the current cap headroom. Called on subscribe
-- (the client polls tier then calls this) and safe to call anytime. Returns how many were restored.
create or replace function public.restore_archived_binders(cap integer)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); live_count integer; n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select count(*) into live_count from public.binders where user_id = uid and archived_at is null;
  update public.binders set archived_at = null
   where id in (
     select id from public.binders
      where user_id = uid and archived_at is not null
      order by updated_at desc
      limit greatest(0, cap - live_count)
   );
  get diagnostics n = row_count; return n;
end; $$;

revoke all on function public.reclaim_over_cap(uuid[]), public.restore_archived_binders(integer) from public;
grant execute on function public.reclaim_over_cap(uuid[]), public.restore_archived_binders(integer) to authenticated;
```

The store's binder read filters `archived_at is null` for the grid + all cap counts; a small
`useArchivedBinders()` count feeds the "N locked — subscribe to unlock" upsell. `restore_archived_binders`
is passed the caller's *new* cap (`Infinity` → a large int for VIP) so the client, which owns the cap
matrix, stays the source of the number.

### The warnings (the owner's explicit ask)

1. **Late in the trial, if already over cap** — fold into the day-11 "3 days of PRO left" banner:
   "You have 8 binders. Subscribe before your trial ends to keep them, or 5 will lock 3 days after."
2. **During the reclaim grace (0–3 days after expiry)** — a persistent, unmissable banner with a
   live countdown: "Your PRO trial ended. Free keeps 3 binders; you have 8. In 2 days, 5 will be
   locked unless you subscribe. [Subscribe] [Choose which to keep]."
3. **At grace end** — "5 binders locked. Subscribe anytime to unlock them."

## Data model

The trial writes a normal `tier_pro` entitlement row so resolution is unchanged. A **dedicated
`pro_trials` ledger** is the source of truth for "has this account trialed?", because a later Stripe
subscription upserts the `tier_pro` row (overwriting `source` → `'stripe'`) and would erase a
trial marker stored only on the entitlement.

```sql
-- supabase/migrations/20260721120000_pro_trials.sql

-- One free 14-day PRO trial per real account. The trial itself is a normal tier_pro entitlement
-- row (source='trial') so tier/print/caps work unchanged; THIS table is the dedup ledger that
-- survives a later subscription upsert overwriting that entitlement row.
create table public.pro_trials (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.pro_trials is
  'One-per-account free PRO trial ledger. Written only by start_pro_trial() (security definer).';

alter table public.pro_trials enable row level security;

-- Owner reads their own row (to render "trial active / N days left / used"). NO client writes —
-- same discipline as entitlements: only the security-definer RPC below grants.
create policy "Users can read their own trial" on public.pro_trials
  for select to authenticated using (auth.uid() = user_id);
```

The trial's entitlement row deliberately leaves `interval` and `period_start` **null** → the print
meter resolves the `calendar` window (`printWindow.ts`) → **1 included print** for the trial term.
That single print is the hook, and it self-caps abuse (one client-generated PDF, near-zero marginal
cost). Whatever they print is archived as a purchased VERSION (`pdfSnapshot`), so it stays
re-downloadable forever even after the trial ends.

## Server: the only entry point

A `SECURITY DEFINER` RPC is the sole writer — it can touch `entitlements` / `pro_trials` despite
their no-client-write policies, and it enforces every eligibility rule atomically.

```sql
create or replace function public.start_pro_trial()
returns timestamptz               -- the trial's expires_at
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid        := auth.uid();
  is_anon    boolean     := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  trial_end  timestamptz := now() + interval '14 days';
begin
  -- Real accounts only. Guests (anonymous) never trial — they'd lose it on the guest→account
  -- transition, and it's the obvious abuse vector.
  if uid is null or is_anon then
    raise exception 'trial requires a signed-in account' using errcode = '42501';
  end if;

  -- One per account, ever.
  if exists (select 1 from public.pro_trials t where t.user_id = uid) then
    raise exception 'trial already used' using errcode = 'P0001';
  end if;

  -- Never hand a trial to someone who already holds — or once held — a real paid tier.
  -- (Acquisition, not win-back. See "Open decisions".)
  if exists (
    select 1 from public.entitlements e
    where e.user_id = uid
      and e.product in ('tier_pro','tier_vip')
      and e.source <> 'trial'
  ) then
    raise exception 'account is not trial-eligible' using errcode = 'P0001';
  end if;

  insert into public.pro_trials (user_id, expires_at) values (uid, trial_end);

  -- The grant. interval / period_start left null on purpose → calendar print window (1 print).
  insert into public.entitlements (user_id, product, source, expires_at, granted_at)
  values (uid, 'tier_pro', 'trial', trial_end, now())
  on conflict (user_id, product) do update
    set source = 'trial', expires_at = excluded.expires_at, granted_at = now();

  return trial_end;
end;
$$;

revoke all on function public.start_pro_trial() from public;
grant execute on function public.start_pro_trial() to authenticated;
```

No edge function needed — this is pure DB, no Stripe. (Edge functions stay for the paid path.)

## Client

**`src/data/trial.ts`** — the read + the call:

```ts
export type TrialState = 'eligible' | 'active' | 'used' | 'ineligible';
export interface TrialStatus { state: TrialState; expiresAt: string | null; }

// Reads pro_trials (own row) + the caller's tier. Client-side view for CTA display only —
// start_pro_trial() is the real gate.
export async function fetchTrialStatus(isPaidOrEverPaid: boolean): Promise<TrialStatus>;

// Calls the RPC; on success the caller polls useTier().refresh() (the new tier_pro row is
// readable immediately, no webhook lag). Throws with the RPC's message on refusal.
export async function startProTrial(): Promise<{ expiresAt: string }>;
```

**`src/hooks/use-trial.ts`** — `useTrial()` → `{ status, loading, start, refresh }`, keyed to the
uid like `useTier`. `start()` calls the RPC then `useTier().refresh()`.

**CTA surfaces** (trial-aware). Extend `UpgradePerk` with optional trial affordance rather than
forking it: when `trialEligible`, the primary action becomes **"Start free 14-day PRO trial"**
(calls `start()`), and the copy adapts by `TrialState`:

| State | Primary CTA | Note |
| --- | --- | --- |
| `eligible` | **Start free 14-day PRO trial** | "No card. Full PRO for 14 days." |
| `active` | (none here) | a `TrialBanner` shows "N days of PRO left" |
| `used` (ended) | **Upgrade to PRO** (current behavior) | "Your PRO trial ended — subscribe to keep it" |
| `ineligible` | **Upgrade to PRO** | current behavior |

Wire the trial CTA into the surfaces that already show the wall: the binder/page/artwork at-limit
banners (`index.tsx`, `my-binders`, `BinderScreen`, `SliceStudio`), the **print sheet locked box**
(the highest-intent surface — print is the marquee PRO value), and a self-serve button on
`/subscriptions`.

**`TrialBanner`** — a slim app-wide banner while `state === 'active'` and ≤3 days remain:
"3 days of PRO left — keep your binders and prints." Dismissible per-session; links to
`/subscriptions`.

## Gating: launch trials WITH checkout

Gate the trial offer on **`CHECKOUT_OPEN`** (`trialOffered = CHECKOUT_OPEN && status.state === 'eligible'`).
Trials don't need checkout to *run*, but a trial that ends while checkout is closed strands the user
with no way to convert. Launching them together guarantees every expiring trial has a subscribe path.
(If we ever want a pre-launch momentum build, add a separate `TRIALS_OPEN` flag — but default to
tying them.)

## Trial → paid handoff (already clean)

When a trial user subscribes, `payments-webhook`'s `checkout.session.completed` → `upsertSubscriptionGrant`
upserts `tier_pro` with `source='stripe'` + real `expires_at`/`interval`/`period_start`, cleanly
replacing the trial entitlement row. `pro_trials` persists (marks it used). Buying VIP instead writes
a `tier_vip` row that wins resolution regardless of the leftover (soon-expiring) trial-pro row. No
double-grant, no special-casing.

## Abuse guardrails (all server-enforced)

- **One per account, ever** — `pro_trials` PK + the existence check.
- **Real accounts only** — anonymous/guest refused in the RPC.
- **No win-back trials** — anyone who ever held a non-trial tier row is refused.
- **Value self-caps** — the trial's included print is 1 (calendar window); print is a
  client-generated PDF with near-zero marginal cost, so the worst case is one free fill-sheet.

## Decisions (owner, 2026-07-21)

- **No win-back** — trials are acquisition-only; anyone who ever held a non-trial tier is refused
  (the `source <> 'trial'` guard, as written).
- **Trials launch WITH go-live** — gated on `CHECKOUT_OPEN`, so no trial expires without a subscribe
  path.
- **PRO only** — never VIP.

Still open:
- **Duration A/B**: ship 14; revisit 7 vs 14 with real conversion data (one constant in the RPC +
  copy).

## Test plan

- RPC unit/integration (impersonated JWTs, the `docs`-established pattern): fresh account grants +
  returns expiry; second call refuses ("already used"); anonymous refused; account with a
  `source='stripe'` tier_pro (active or expired) refused.
- `resolveTier` reads the trial row as `pro` while active, `free` after expiry (extend
  `tiers` tests with a `source='trial'` row — pure, no DB).
- Print during trial: 1 included print via the calendar window; a second attempt shows
  out-of-credits; the printed version stays re-downloadable after expiry.
- Handoff: trial → Checkout subscribe overwrites the row to `source='stripe'`; `pro_trials` remains.
- **Reclaim grace**: over-cap trial user right after expiry is still in grace → `reclaim_over_cap`
  raises `still in grace`; the warning banner shows the correct countdown and excess count.
- **Reclaim runs**: past grace, `reclaim_over_cap(keep_ids)` archives exactly the excess, respects
  the keep list, refuses a keep list > Free cap or containing a non-owned binder, refuses while any
  tier is active, and is idempotent on re-call.
- **Archived binders are inert**: excluded from the grid, from `binderCount`/cap checks, and from
  the editor; only surfaced as the "N locked" upsell count.
- **Restore**: `restore_archived_binders(cap)` after subscribing un-archives newest-first up to the
  new headroom and no further; VIP (large cap) restores all.
- **Default reclaim** (scheduled/lazy, no keep list): keeps the `cap` most-recently-updated binders.

---

## Porting it to tcgscan (2026-07-23)

Owner call: *"the same exact upgrade paths as michi-maker — same plan drop fallbacks, same cap
enforcement logic."* Migration `20260723120000_tcgscan_trials_and_collection_reclaim.sql`, applied.
The unit of reclaim is a **collection** rather than a binder; everything else mirrors the design
above. Owner decisions taken during scoping:

- **Archived collections do NOT count as cards you own.**
- **tcgscan gets its own 14-day trial**, on a **separate ledger** (`tcgscan_pro_trials`) so
  trialing michi doesn't burn the tcgscan trial and vice versa.
- **The keep-picker is required**, with the same date-based fallback when the user picks nothing.

Server objects: `collections.archived_at` · `free_collection_cap()` ·
`start_tcgscan_pro_trial()` · `reclaim_over_cap_collections(text[])` ·
`reclaim_all_over_cap_collections()` · `restore_archived_collections(int)` · cron `37 3 * * *`.
Note the keep list is **`text[]`**, not `uuid[]` — tcgscan's client mints `col-…` ids.

### The part that isn't a port: local-first sync

michi's store reads binders from the server. **tcgscan is local-first** with a three-way merge
(LOCAL / REMOTE / MIRROR, `src/lib/sync-merge.ts`), and `diffTable` **derives deletes from
absence**. So the michi approach — hide archived rows at the read layer — would have had the client
push those rows as DELETEs, cascading `portfolio_entries` and destroying the very data the archive
was meant to preserve. The trap only surfaces on a second device, which is why it is worth writing
down.

The fix is to make `archived_at` a **server-owned field**:

- present in `fetchRemote`'s select,
- **deliberately absent** from `pushDelta`'s upserts,
- and forced to the remote value by a dedicated `mergeCollections` step that runs after the generic
  merge.

Last-writer-wins is *wrong* for this one field: a device that edited offline carries a newer
`updated_at`, wins the merge, and would silently un-archive what the nightly job just locked.
Archived rows therefore stay in the local store and are hidden at the read layer only
(`isLive()` / `collections()` / `archived()` in `src/lib/portfolio.ts`), with `normalize()` keeping
the active collection visible. Four regression tests cover this directly — including "an archived
collection is never pushed as a DELETE" (12/12 in `scripts/sync-merge.test.ts`).

### The cross-app consequence

`user_cards` is a rollup michi reads (`docs/TCGSCAN-PORTFOLIO.md`), maintained by a **delta trigger**
on `portfolio_entries`. Honouring "archived doesn't count as owned" meant rewriting
`sync_user_cards_from_portfolio()` to ignore entries in archived collections — necessary not just at
archive time but for **every later mutation**, since otherwise the bulk delta applied at archive
gets double-counted when an entry subsequently changes. Verified in a rolled-back sandbox:
5 cards → archive two collections → 2 → restore → 5.

### Client

`src/lib/trial.ts` · `src/hooks/use-trial.ts` (`EntitlementRow` gained `source`) ·
`KeepCollectionsModal.tsx` (defaults to keeping the most-recently-updated `cap`; copy says
**"locked, not deleted"**) · `ProStatusBanner.tsx` (michi's three-warning ladder + auto-restore,
mounted in `_layout.tsx`) · `TrialCta.tsx`.

**Known gap:** `TrialCta` is mounted only on `/plans` in tcgscan, whereas michi puts the trial offer
at every wall a Free user hits — which is the whole point of "triggered, not blanket". Worth
closing.

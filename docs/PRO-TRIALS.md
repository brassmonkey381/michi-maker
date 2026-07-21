# Free PRO trials — spec

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

The conversion engine is **loss aversion at expiry** (verified safe): cap guards block *creation*
only and never delete binders (`store/binders.tsx` `duplicateBinder`/`addPage`/`duplicatePage`), so
a lapsed trial user keeps their (say) 8 binders visible but can't add a 9th or edit past Free caps —
pressure that lands exactly when they next reach for something PRO enabled.

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

## Open decisions

1. **Win-back**: current spec refuses trials to churned ex-subscribers (acquisition-only). If
   win-back trials are wanted later, relax the `source <> 'trial'` guard to a time-based rule.
2. **Duration A/B**: ship 14; revisit 7 vs 14 with real conversion data (duration is one constant in
   the RPC + copy).
3. **Pre-launch trials**: default is to gate on `CHECKOUT_OPEN`. Flip only with a conscious
   `TRIALS_OPEN` flag and messaging for "subscribe opens soon".

## Test plan

- RPC unit/integration (impersonated JWTs, the `docs`-established pattern): fresh account grants +
  returns expiry; second call refuses ("already used"); anonymous refused; account with a
  `source='stripe'` tier_pro (active or expired) refused.
- `resolveTier` reads the trial row as `pro` while active, `free` after expiry (extend
  `tiers` tests with a `source='trial'` row — pure, no DB).
- Print during trial: 1 included print via the calendar window; a second attempt shows
  out-of-credits; the printed version stays re-downloadable after expiry.
- Lapse: with `LIMITS_ENFORCED`, an over-cap trial user post-expiry keeps binders visible, is
  blocked from creating a new one, and sees the `used`-state CTA.
- Handoff: trial → Checkout subscribe overwrites the row to `source='stripe'`; `pro_trials` remains.

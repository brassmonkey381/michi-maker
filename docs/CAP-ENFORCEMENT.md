# Tier cap enforcement — the server-side boundary

How free/PRO/VIP caps are enforced across **both** apps. The shared backend
(`piikwvntldytjejxmcla`) holds the schema for michi-maker *and* tcgscan-app, so this document
covers both; the client-side halves live in `src/data/tiers.ts` (michi) and `src/lib/tiers.ts`
(tcgscan).

Written during the 2026-07-23 enforcement rollout.

## The model

**The database is the enforcement boundary. The clients are the UX.**

Before this rollout, every numeric cap in both apps existed only in client JavaScript while RLS
asserted ownership and nothing else. A patched web bundle, a direct PostgREST call with the
publishable key, or tcgscan's own sync (`pushDelta` upserts whatever the local store holds) wrote
past any cap unchallenged. The `entitlements` ledger was never the weak point — it has no client
write policy, and grants come only from the signature-verified payments webhook or the trial
RPCs — but everything *downstream* of reading it was.

Client checks stay, and stay necessary: they are what turns a refusal into an upgrade prompt
instead of a raw Postgres error. They are no longer what protects revenue.

## Server-side pieces

| Piece | What it does |
|---|---|
| `michi_tier(uid)` / `tcgscan_tier(uid)` | Resolve `free`/`pro`/`vip` from `entitlements`, mirroring each app's `resolveTier()`. Entitlements only — see the guest note below. |
| `michi_effective_tier(uid)` / `tcgscan_effective_tier(uid)` | Adds the `guest` case from the `is_anonymous` JWT claim. |
| `*_cap(uid)` functions | `michi_binder_cap`, `michi_page_cap`, `michi_slice_cap`, `tcgscan_collection_cap`, `tcgscan_card_cap`. `uncapped()` (1,000,000) stands in for `Infinity` so callers can always do arithmetic. |
| Insert-time triggers | `binders`, `binder_pages`, `saved_slices`, `collections`, `portfolio_entries`. Refusals raise SQLSTATE `P0001` with a `tier_cap_exceeded:<limit>` message prefix. |
| `staff_accounts` | Allowlist exempt from caps. Service-role writes only — **no client policies at all**, so membership cannot be self-granted. |
| Nightly `pg_cron` reclaimers | Pre-existing. Archive over-cap binders/collections after a downgrade + 3-day grace. |

## Four things that are easy to get wrong

**Upserts.** Both apps sync with `upsert`, which is `INSERT ... ON CONFLICT DO UPDATE`, and a
`BEFORE INSERT` trigger fires *before* conflict resolution. A naive trigger would stop a user who
is already at or over cap from re-syncing their **own existing rows** — every device sync would
raise. Each trigger therefore checks whether the id already exists and lets it through if so:
re-stating an existing row is not a new allocation.

**Guests are `authenticated`.** Anonymous Supabase sessions hold the same role as signed-in free
users and are indistinguishable at the row level, so guest caps must come from the `is_anonymous`
claim — the same mechanism `start_pro_trial()` uses to refuse anonymous trials.

**Privileged writes are not user allocations.** The payments webhook, the cron reclaimers, and
manual SQL run as `service_role`/`postgres` and bypass every cap.

**Cards are counted, not lots.** `tcgscan_card_cap` compares against `sum(quantity)` for the
collection, matching what the UI displays. Counting rows meant a 250-lot free collection could
hold 24,750 cards while displaying "24750 cards" against a "250 card" cap. This also makes a
quantity *increase* a cap-relevant action, which is why the trigger fires on
`update of quantity` and not only on insert.

## Why hard enforcement was safe to switch on

Measured against production on 2026-07-23, across all 574 accounts, exactly three were over any
free cap — `official@michi-maker.com` (19 binders, the public showcase account) and the two owner
accounts. Nobody was over the slice or portfolio-entry caps. So there was no customer
grandfathering problem to solve: the showcase account went on the staff allowlist, existing rows
were left untouched, and enforcement applies to new allocations from here on.

Re-run the check before changing any cap number:

```sql
select count(*) from (
  select owner_id from public.binders
   where archived_at is null and coalesce(is_demo,false) = false
   group by owner_id having count(*) > public.free_binder_cap()
) over_cap;
```

## Known gaps (not yet closed)

- **The meters are still advisory.** `print_events` and `scan_events` are client-written with
  swallowed errors — a client that simply never inserts has an infinite meter. Making them
  authoritative means moving record-and-check into a security-definer RPC that does both
  atomically.
- **Never-subscribed accounts are never reclaimed.** The nightly reclaimers select only from
  `entitlements`, so an account that has never held a tier is not in the candidate set. With
  insert-time caps in place this matters much less — the only way to get over cap is data that
  predates enforcement.
- **`binder_pdf_snapshots` has no entitlement predicate**, so a forged row unlocks free
  re-downloads. Low marginal cost while PDFs are generated client-side; real if print-on-demand
  ships.
- **`binder_slots` are unbounded server-side.** `rows`/`cols` are capped at 6 by a CHECK, but
  nothing verifies a slot fits inside its page's grid, and no cap counts cards per binder.
- **Cap numbers are mirrored by hand** in three places: each app's `tiers.ts`, the SQL cap
  functions here, and `PRINTS_PER_MONTH` in the payments webhook (Deno can't import from the
  app). Change them together; consolidating is a tracked follow-up.

## Client-side contract

When a write is refused, the client sees a PostgREST error with SQLSTATE `P0001` and a message
starting `tier_cap_exceeded:` followed by the limit name (`binders`, `pagesPerBinder`,
`artUploads`, `collections`, `cardsPerCollection`). Clients should pattern-match that prefix and
route to the existing upgrade prompt rather than surfacing a database error. Reaching this path
at all means the client's own gate was missing or bypassed — worth logging, not just handling.

On iOS, remember that no purchase surface may be shown (`tcgscan-app/src/lib/store-policy.ts`):
a capped iOS user gets copy that states the limit and that plans are managed on the web, with no
price and no link that reads as a purchase path.

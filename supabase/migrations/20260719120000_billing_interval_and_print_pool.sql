-- Billing interval + term anchor on entitlements, and the ANNUAL PRINT POOL unlock.
--
-- Two problems this fixes:
--
-- 1. The ledger could not tell a yearly subscriber from a monthly one. Both `michi_pro_yearly`
--    and `michi_pro_monthly` collapse to the same `tier_pro` product, so nothing downstream
--    could offer a yearly-only feature. `interval` records which one was actually bought
--    (from the Stripe PRICE's recurring.interval — authoritative, unlike the lookup-key
--    naming convention).
--
-- 2. Included prints were counted per CALENDAR month (printRepo.countPrintsThisMonth), which
--    is not the window anyone is billed on: subscribe on the 28th and you get two allocations
--    in four days. `period_start` anchors the meter to the real billing term so the window can
--    be sliced from the subscription anniversary instead (see src/data/printWindow.ts).
--
-- Both columns are nullable and backwards compatible: every existing row (one-time unlocks,
-- manual grants) keeps NULL and falls back to the old calendar-month behaviour.

alter table public.entitlements
  add column if not exists interval text,
  add column if not exists period_start timestamptz;

comment on column public.entitlements.interval is
  'Billing interval of the subscription that granted this row: ''month'' | ''year''. NULL for one-time / lifetime / manually granted rows. Written from the Stripe price''s recurring.interval by payments-webhook (service role only).';

comment on column public.entitlements.period_start is
  'Start of the CURRENT billing term. Moved forward by the payment webhook on every renewal, in lockstep with expires_at. NULL = no billing term (lifetime / manual grant), in which case print metering falls back to the calendar month.';

-- ── The annual print pool ─────────────────────────────────────────────────────────────────
--
-- A yearly subscriber has already paid for the whole year's prints (PRO 1/mo = 12, VIP 5/mo
-- = 60). By default we still release them a month at a time so the meter reads the same for
-- everyone; unlocking the pool releases the full year's allocation at once.
--
-- IRREVERSIBLE BY CONSTRUCTION (owner decision 2026-07-19). The row is keyed to the billing
-- term it unlocks and there are NO update or delete policies, so:
--   - it cannot be toggled back off mid-term (there is no honest answer to "what is my monthly
--     allowance now?" after someone has burned 8 of 12), and
--   - a renewal writes a NEW period_start, which simply has no unlock row — the pool resets
--     to monthly release automatically, with no cleanup job.
create table public.print_pool_unlocks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The entitlement term this unlock applies to. Must match entitlements.period_start exactly.
  period_start timestamptz not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

comment on table public.print_pool_unlocks is
  'One row per (user, billing term) that has released its FULL YEAR of included prints at once instead of one month at a time. Yearly subscribers only (enforced in the INSERT policy). Irreversible within a term: no update/delete policies, and renewals get a new period_start with no row.';

alter table public.print_pool_unlocks enable row level security;

create policy "Users can read their own pool unlocks"
  on public.print_pool_unlocks for select
  to authenticated
  using (auth.uid() = user_id);

-- The eligibility check lives IN the policy rather than in client code: a user can only unlock
-- a term they actually hold, on a YEARLY michi subscription that is still active. A client that
-- forges the request just fails the check. (The cross-app `tcgscan_pro` is deliberately absent —
-- it is not a michi tier and carries no print allocation.)
--
-- SECOND CONDITION — "spend one first" (owner decision 2026-07-19). Releasing a whole year of
-- prints to an account that has never printed anything is the chargeback shape we care about:
-- subscribe, drain 60 prints, dispute. Requiring at least one recorded print IN THIS TERM means
-- every pool unlock is preceded by the user actually generating and (presumably) liking a sheet.
-- Scoped to the current term rather than "ever" so a renewal re-proves it — a renewing
-- subscriber only needs their first print of the new year, which they were going to take anyway.
--
-- Honest caveat: print_events is CLIENT-reported (see 20260716220000), so this proves intent,
-- not fulfilment. It is a friction gate, not a security boundary. That is the right weight for
-- it while prints are client-generated PDFs with near-zero marginal cost; revisit if
-- print-on-demand ships and a pool unlock starts carrying real fulfilment liability.
create policy "Yearly subscribers can unlock their own annual pool"
  on public.print_pool_unlocks for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.entitlements e
      where e.user_id = auth.uid()
        and e.product in ('tier_pro', 'tier_vip')
        and e.interval = 'year'
        and e.period_start = print_pool_unlocks.period_start
        and (e.expires_at is null or e.expires_at > now())
    )
    and exists (
      select 1
      from public.print_events p
      where p.user_id = auth.uid()
        and p.created_at >= print_pool_unlocks.period_start
    )
  );

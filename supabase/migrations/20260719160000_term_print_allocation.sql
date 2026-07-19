-- Per-term print allocation, so a MID-TERM UPGRADE is paid out proportionally.
--
-- The annual pool used to be a flat `includedPrintsPerMonth × 12` derived from whatever tier the
-- user holds right now. That is correct for someone who bought a yearly plan on day one, and
-- badly wrong for someone who upgrades late in a term: 11 months into PRO, a ~$5 prorated upgrade
-- to VIP yearly would have released the FULL VIP pool, i.e. a year of prints for the price of a
-- month. Advertising prorated upgrades (which we now do) would have taught people to do exactly
-- that.
--
-- The rule (owner, 2026-07-19): you keep your OLD rate for the months you already served, and get
-- the NEW rate for the months still to come.
--
--     allocation = oldRate × monthsElapsed + newRate × monthsRemaining
--
-- Worked example, upgrading to VIP yearly 8 months into a PRO year (PRO 1/mo, VIP 3/mo):
--     full PRO year (12) + 4 months of VIP (12) − the 4 PRO months being replaced (4) = 20
--     which is the same as 1×8 + 3×4 = 20.
-- A fresh subscriber is just the monthsElapsed = 0 case, so this column is always populated for a
-- yearly term rather than being an upgrade-only special case.
--
-- NULL means "no stored allocation" and the client falls back to rate × 12 — true for monthly
-- terms (which have no pool at all), for manual grants, and for rows written before this ran.

alter table public.entitlements
  add column if not exists term_print_allocation int;

comment on column public.entitlements.term_print_allocation is
  'Included prints for the WHOLE current term, used as the annual pool total. Computed by payments-webhook as oldRate*monthsElapsed + newRate*monthsRemaining so mid-term upgrades are prorated rather than granting a full fresh year. NULL = fall back to includedPrintsPerMonth*12 (monthly terms, manual grants, pre-migration rows).';

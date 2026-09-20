-- ═══════════════════════════════════════════════════════════
-- michi-maker Founder: the public "N of 100" counter
-- ═══════════════════════════════════════════════════════════
-- A Founder membership is a `tier_pro` row with NO expiry and interval 'lifetime' (written by
-- payments-webhook for a paid Founder checkout, or granted by hand). The plans page shows how many
-- exist out of 100. THE NUMBER IS A COUNT OF REAL ROWS AND NOTHING ELSE: no constant is added, no
-- floor is applied. A counter that says more than the ledger holds is an invented-scarcity claim.
--
-- The count is public (a guest sees the plans page), so it is a SECURITY DEFINER function that
-- returns one integer; the entitlements table itself stays owner-read-only.
create or replace function public.michi_founder_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.entitlements
   where product = 'tier_pro' and expires_at is null and interval = 'lifetime';
$$;
comment on function public.michi_founder_count() is
  'How many michi-maker Founder (lifetime PRO) memberships exist. Public. A pure count of ledger rows.';
revoke all on function public.michi_founder_count() from public;
grant execute on function public.michi_founder_count() to anon, authenticated;

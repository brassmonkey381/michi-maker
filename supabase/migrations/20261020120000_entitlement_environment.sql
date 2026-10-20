-- Which store environment granted an entitlement row, so a sandbox purchase stops reading as money.
--
-- revenuecat-webhook grants on SANDBOX events on purpose: App Review buys in the sandbox, and a
-- reviewer who pays and sees nothing unlock is a rejection. But the row it wrote was identical to
-- a real sale, so /studio Money and the morning email showed "1 paying" for a TCGScan Lifetime
-- PRO on 2026-10-20, before TCGScan had ever been released on the App Store.
--
--   environment  'production' | 'sandbox', stamped by revenuecat-webhook from RevenueCat's
--                `environment` field at every grant and renewal. NULL = not recorded (Stripe
--                rows, manual grants, and Apple rows written before this migration). NULL is
--                read as production: an old row is hidden only when someone marks it sandbox.
--
-- Access is unchanged: tcgscan_tier(uid), the app's tcgscanLevel and every gate key on product +
-- expires_at and never read this column. A sandbox buyer keeps the tier; only the Money readers
-- (admin_money_ledger below, and analytics-studio config/events.json) leave sandbox rows out.

alter table public.entitlements
  add column if not exists environment text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entitlements_environment_check') then
    alter table public.entitlements
      add constraint entitlements_environment_check check (environment in ('production', 'sandbox'));
  end if;
end $$;

comment on column public.entitlements.environment is
  'Store environment that granted this row: production or sandbox (RevenueCat environment). NULL = not recorded, read as production. Money readers skip sandbox; access checks ignore this column.';

-- Same function as 20261018160000_studio_money_dropoffs_health.sql, plus one line: sandbox rows out.
create or replace function public.admin_money_ledger()
returns table (
  kind text, app text, user_id uuid, username text,
  product text, source text, granted_at timestamptz, expires_at timestamptz,
  "interval" text, unit_amount_minor integer, currency text, cancelled_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with ours as (
    select t as id from public.test_account_ids() t
    union select id from public.profiles where is_admin
  )
  select 'entitlement'::text as kind,
         case when e.product like 'tcgscan_%' then 'tcgscan' else 'michi' end as app,
         e.user_id, pr.username, e.product, e.source, e.granted_at, e.expires_at,
         e."interval", e.unit_amount_minor, e.currency, e.cancelled_at
  from public.entitlements e
  left join public.profiles pr on pr.id = e.user_id
  where public.is_admin()
    and coalesce(e.source, '') <> 'trial'
    and coalesce(e.environment, 'production') <> 'sandbox'
    and not exists (select 1 from ours o where o.id = e.user_id)
  union all
  select 'free_trial', 'michi', t.user_id, pr.username, 'tier_pro', 'trial', t.started_at, t.expires_at,
         null, null, null, null
  from public.pro_trials t
  left join public.profiles pr on pr.id = t.user_id
  where public.is_admin()
    and not exists (select 1 from ours o where o.id = t.user_id)
  union all
  select 'free_trial', 'tcgscan', t.user_id, pr.username, 'tcgscan_pro', 'trial', t.started_at, t.expires_at,
         null, null, null, null
  from public.tcgscan_pro_trials t
  left join public.profiles pr on pr.id = t.user_id
  where public.is_admin()
    and not exists (select 1 from ours o where o.id = t.user_id);
$$;
revoke all on function public.admin_money_ledger() from public;
revoke execute on function public.admin_money_ledger() from anon;
grant execute on function public.admin_money_ledger() to authenticated;

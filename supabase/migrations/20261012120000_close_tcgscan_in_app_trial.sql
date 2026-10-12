-- The one-press, no-card TCGScan PRO trial is closed (owner, 2026-10-12), as michi's was on
-- 2026-10-11 (20261011120000_close_in_app_trial.sql).
--
-- The web and Android apps stop offering it (tcgscan-app hooks/use-trial), and the iOS app never
-- did (Apple's in-app purchase sells it there). This makes the server agree, so a direct RPC call
-- cannot grant what no app offers. The only way to try TCGScan PRO free is now Stripe Checkout with
-- a card on file (stripe-checkout TRIAL_FAMILY.tcgscan), recorded in the same tcgscan_pro_trials
-- ledger by payments-webhook, so free days are handed out once per account across both doors.
-- Trials already running are untouched and run to their end.

create or replace function public.start_tcgscan_pro_trial(p_surface text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.analytics_events (user_id, app, name, props, session_id)
    values (
      auth.uid(), 'tcgscan', 'trial.refused_closed',
      case when p_surface is not null then jsonb_build_object('surface', p_surface) else '{}'::jsonb end,
      null
    );
  exception when others then
    null;
  end;
  raise exception 'free trials are no longer offered' using errcode = 'P0001';
end;
$$;

comment on function public.start_tcgscan_pro_trial(text) is
  'CLOSED 2026-10-12: refuses every caller. TCGScan PRO is tried free through Stripe Checkout (stripe-checkout).';

-- The one-press, no-card PRO trial is closed (owner, 2026-10-11).
--
-- The client stops offering it (TRIALS_OPEN=0), and this makes the server agree: start_pro_trial
-- now refuses every caller, so a direct RPC call cannot grant what the app no longer offers. The
-- pro_trials ledger, the entitlement rows of trials already running, and the carry-onto-checkout
-- logic that honours a live trial are all untouched: a trial in progress runs to its end.
--
-- RE-OPENING is this function's previous body (20260824120000, as rewritten by 20260920125000 to
-- read public.trial_days()), which can be restored from pg_get_functiondef in git history. Any
-- future trial is expected to live inside Stripe Checkout with a card on file instead.

create or replace function public.start_pro_trial(p_surface text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  -- Telemetry first and isolated, so the refusal is still counted: a closed offer that people keep
  -- reaching for is a number worth having.
  begin
    insert into public.analytics_events (user_id, app, name, props, session_id)
    values (
      auth.uid(), 'michi', 'trial.refused_closed',
      case when p_surface is not null then jsonb_build_object('surface', p_surface) else '{}'::jsonb end,
      null
    );
  exception when others then
    null;
  end;
  raise exception 'free trials are no longer offered' using errcode = 'P0001';
end;
$$;

comment on function public.start_pro_trial(text) is
  'CLOSED 2026-10-11: refuses every caller. The in-app no-card trial is withdrawn; see docs/PRO-TRIALS.md.';

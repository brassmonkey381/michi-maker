-- Emit `trial.start` server-side, inside the same transaction that grants the trial.
--
-- Until now the event was fired by the client (TrialCta) right after the RPC resolved. But
-- `track()` drops events while its module-local `cachedUser` is still null — the startup window
-- between supabase-js having a valid session and the auth store landing the identity. A hand-run
-- owner trial on 2026-08-08 granted the entitlement but produced no `trial.start` at all (see
-- ../ANALYTICS-TRIAL-START-DROPPED.md). Writing it from the RPC makes it un-droppable: it commits
-- with the grant, so a zero can never mean "we couldn't see it" for a trial that actually happened.
--
-- Both trial RPCs get a `p_surface` param (a client fact the RPC can't know) so the studio can
-- still join `pro.offer_shown` -> `trial.start`. The analytics insert is wrapped in its own
-- BEGIN/EXCEPTION block: the trial is the transaction's point, and a telemetry failure must never
-- roll back a granted trial. `session_id` is inserted null — the RPC has no session, and null means
-- "not captured", which is true; do not synthesise one.
--
-- Adding a parameter (even with a default) makes a NEW function signature, so the old zero-arg
-- overloads are dropped first rather than left to shadow the new ones.

-- ── michi: start_pro_trial(p_surface) ───────────────────────────────────────────────────────
drop function if exists public.start_pro_trial();
create or replace function public.start_pro_trial(p_surface text default null)
returns timestamptz                                   -- the trial's expires_at
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid        := auth.uid();
  is_anon   boolean     := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  trial_end timestamptz := now() + interval '14 days';
begin
  -- Real accounts only. Guests would lose it on the guest->account transition, and it's the
  -- obvious abuse vector.
  if uid is null or is_anon then
    raise exception 'trial requires a signed-in account' using errcode = '42501';
  end if;

  -- One per account, ever.
  if exists (select 1 from public.pro_trials t where t.user_id = uid) then
    raise exception 'trial already used' using errcode = 'P0001';
  end if;

  -- No win-back: never hand a trial to someone who already holds — or once held — a real
  -- (non-trial) paid tier. (Owner decision 2026-07-21.)
  if exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.product in ('tier_pro','tier_vip') and e.source <> 'trial'
  ) then
    raise exception 'account is not trial-eligible' using errcode = 'P0001';
  end if;

  insert into public.pro_trials (user_id, expires_at) values (uid, trial_end);

  -- interval / period_start left null on purpose -> the print meter's `calendar` window,
  -- i.e. 1 included print for the trial term (PRO's includedPrintsPerMonth).
  insert into public.entitlements (user_id, product, source, expires_at, granted_at)
  values (uid, 'tier_pro', 'trial', trial_end, now())
  on conflict (user_id, product) do update
    set source = 'trial', expires_at = excluded.expires_at, granted_at = now();

  -- Telemetry, isolated so a failure here can never abort the grant above.
  begin
    insert into public.analytics_events (user_id, app, name, props, session_id)
    values (
      uid, 'michi', 'trial.start',
      case when p_surface is not null then jsonb_build_object('surface', p_surface) else '{}'::jsonb end,
      null
    );
  exception when others then
    null;  -- swallow: the trial is what this transaction is for; its telemetry is not.
  end;

  return trial_end;
end; $$;
revoke all on function public.start_pro_trial(text) from public;
grant execute on function public.start_pro_trial(text) to authenticated;

-- ── tcgscan: start_tcgscan_pro_trial(p_surface) ─────────────────────────────────────────────
drop function if exists public.start_tcgscan_pro_trial();
create or replace function public.start_tcgscan_pro_trial(p_surface text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid        := auth.uid();
  is_anon   boolean     := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  trial_end timestamptz := now() + interval '14 days';
begin
  if uid is null or is_anon then
    raise exception 'trial requires a signed-in account' using errcode = '42501';
  end if;
  if exists (select 1 from public.tcgscan_pro_trials t where t.user_id = uid) then
    raise exception 'trial already used' using errcode = 'P0001';
  end if;
  -- No win-back: anyone who ever held a real (non-trial) tcgscan tier is ineligible.
  if exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.product in ('tcgscan_pro','tcgscan_vip') and e.source <> 'trial'
  ) then
    raise exception 'account is not trial-eligible' using errcode = 'P0001';
  end if;

  insert into public.tcgscan_pro_trials (user_id, expires_at) values (uid, trial_end);

  insert into public.entitlements (user_id, product, source, expires_at, granted_at)
  values (uid, 'tcgscan_pro', 'trial', trial_end, now())
  on conflict (user_id, product) do update
    set source = 'trial', expires_at = excluded.expires_at, granted_at = now();

  -- Telemetry, isolated so a failure here can never abort the grant above.
  begin
    insert into public.analytics_events (user_id, app, name, props, session_id)
    values (
      uid, 'tcgscan', 'trial.start',
      case when p_surface is not null then jsonb_build_object('surface', p_surface) else '{}'::jsonb end,
      null
    );
  exception when others then
    null;  -- swallow: the trial is what this transaction is for; its telemetry is not.
  end;

  return trial_end;
end; $$;
revoke all on function public.start_tcgscan_pro_trial(text) from public;
grant execute on function public.start_tcgscan_pro_trial(text) to authenticated;

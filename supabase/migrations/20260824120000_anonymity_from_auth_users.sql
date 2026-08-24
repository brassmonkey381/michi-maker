-- Decide "is this caller a guest?" from auth.users, not from the access token's claim.
--
-- THE BUG. A guest upgrade (`supabase.auth.updateUser({ email, password })` on an anonymous
-- session) attaches the email to the SAME uid and flips `auth.users.is_anonymous` to false. It
-- does NOT issue a new access token. The token the browser is still holding was minted during
-- signInAnonymously and carries `is_anonymous: true` — and it keeps carrying it until the token
-- expires and refreshes, up to an hour later.
--
-- Every guard in this schema read that claim, so for that hour a brand-new paying-capable account
-- was treated as a guest:
--   * start_pro_trial / start_tcgscan_pro_trial -> "trial requires a signed-in account" while
--     signed in. Reported live on 2026-08-24 by @brassmonkey382, whose account was created at
--     17:28:03 (anonymous), confirmed at 17:28:48, and whose only session shows refreshed_at null.
--   * binder_likes insert  -> cannot like a binder.
--   * profile_upvotes insert -> cannot upvote a profile.
--   * michi_effective_tier / tcgscan_effective_tier -> 'guest', so the insert-time page, slice and
--     card caps applied GUEST limits to someone who had just made an account.
--
-- THE FIX. `auth.users.is_anonymous` is the truth and cannot go stale; a token can only lag it,
-- and only ever in the "still says guest" direction (an account cannot un-upgrade). So
-- request_is_anonymous() now reads the row, falling back to the claim only when there is no uid
-- at all — which is how the cron calls the tier functions, and must keep behaving as before.
--
-- Doing it here rather than only in the clients fixes every token already issued, with no deploy
-- and no wait. The clients are being fixed too (they now refreshSession() straight after an
-- upgrade), because their own `user.is_anonymous` UI state deserves to be honest as well; this
-- migration is what makes the server stop believing a stale claim in the first place.

-- ── the one place anonymity is decided ──────────────────────────────────────────────────────
-- SECURITY DEFINER because `authenticated` cannot read auth.users, and RLS policy expressions
-- run as the querying role. It takes no arguments and looks only at auth.uid(), so it can tell
-- you nothing about anyone but yourself.
create or replace function public.request_is_anonymous()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select au.is_anonymous from auth.users au where au.id = auth.uid()),
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );
$$;
revoke all on function public.request_is_anonymous() from public;
grant execute on function public.request_is_anonymous() to authenticated;

-- ── trials ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.start_pro_trial(p_surface text default null)
returns timestamptz                                   -- the trial's expires_at
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid        := auth.uid();
  trial_end timestamptz := now() + interval '14 days';
begin
  -- Real accounts only. Guests would lose it on the guest->account transition, and it's the
  -- obvious abuse vector. Read from auth.users: the JWT claim lags an upgrade by up to an hour.
  if uid is null or public.request_is_anonymous() then
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

create or replace function public.start_tcgscan_pro_trial(p_surface text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid        := auth.uid();
  trial_end timestamptz := now() + interval '14 days';
begin
  if uid is null or public.request_is_anonymous() then
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

-- ── community writes ────────────────────────────────────────────────────────────────────────
-- Same rule, same reason: a real account that upgraded three minutes ago is a real account.
-- Wrapped in (select ...) so the planner hoists it to an InitPlan and evaluates it once.
drop policy if exists "Real accounts can like public binders" on public.binder_likes;
create policy "Real accounts can like public binders"
  on public.binder_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.request_is_anonymous()) = false
    and exists (
      select 1 from public.binders b
      join public.profiles p on p.id = b.owner_id
      where b.id = binder_likes.binder_id
        and b.is_public
        and coalesce(p.is_public, true)
        and b.owner_id <> (select auth.uid())
    )
  );

drop policy if exists "Real accounts can upvote public profiles" on public.profile_upvotes;
create policy "Real accounts can upvote public profiles"
  on public.profile_upvotes for insert to authenticated
  with check (
    voter_id = (select auth.uid())
    and (select public.request_is_anonymous()) = false
    and profile_id <> (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = profile_upvotes.profile_id and coalesce(p.is_public, true)
    )
  );

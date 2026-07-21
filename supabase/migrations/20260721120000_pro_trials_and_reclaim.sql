-- Free PRO trials + over-cap reclaim on downgrade. See docs/PRO-TRIALS.md.
--
-- Trial: a normal `tier_pro` entitlement row (source='trial', 14-day expires_at) so tier
-- resolution / print / caps all work unchanged. A dedicated `pro_trials` ledger is the
-- source of truth for "has this account trialed?", because a later Stripe subscription
-- upserts the tier_pro row (source -> 'stripe') and would erase a marker stored only there.
--
-- Reclaim: after a downgrade to Free (trial expiry OR subscription cancel/lapse) a warned
-- 3-day grace passes, then the excess binders over the Free cap are SOFT-ARCHIVED (archived_at
-- set) — recoverable on subscribe, not destroyed. Strictly downgrade-driven: a user who never
-- held a paid/trial tier is never reclaimed (their over-cap binders predate enforcement and are
-- a separate grandfathering question, not this feature).
--
-- All writes here are server-side only (security-definer functions); the tables keep the same
-- no-client-write discipline as `entitlements`.

-- ── pro_trials ledger ──────────────────────────────────────────────────────────────────────
create table public.pro_trials (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.pro_trials is
  'One-per-account free PRO trial ledger. Written only by start_pro_trial() (security definer).';

alter table public.pro_trials enable row level security;

-- Owner reads their own row (to render "trial active / N days left / used"). NO client writes.
create policy "Users can read their own trial" on public.pro_trials
  for select to authenticated using (auth.uid() = user_id);

-- ── binders.archived_at (soft-archive) ─────────────────────────────────────────────────────
alter table public.binders add column archived_at timestamptz;  -- null = live
comment on column public.binders.archived_at is
  'Soft-archive: non-null hides the binder from the owner (over-cap reclaim). Restored on upgrade.';

-- The live-binder reads and the reclaim/restore queries all filter on archived_at is null.
create index binders_owner_live_idx on public.binders (owner_id) where archived_at is null;

-- ── the Free binder cap, mirrored from tiers.ts ────────────────────────────────────────────
-- SQL can't import TIER_LIMITS.free.binders — same discipline as PRINTS_PER_MONTH in the
-- webhook. If the Free cap changes in tiers.ts, change it here too.
create or replace function public.free_binder_cap() returns integer
  language sql immutable as $$ select 3 $$;

-- ── start_pro_trial() ──────────────────────────────────────────────────────────────────────
-- The sole trial entry point. Grants a 14-day tier_pro entitlement + records the trial,
-- atomically, refusing anons, prior trialers, and anyone who ever held a real paid tier.
create or replace function public.start_pro_trial()
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

  return trial_end;
end; $$;

-- ── reclaim_over_cap(keep_ids) — user-initiated, in-app "choose which to keep" ──────────────
-- Archives the caller's over-cap excess, keeping keep_ids. Enforces SERVER-SIDE that the caller
-- (a) has NO active paid/trial tier, (b) DID hold a tier that lapsed (downgrade-only), (c) is
-- past the 3-day grace, and (d) isn't keeping more than the Free cap. Idempotent.
create or replace function public.reclaim_over_cap(keep_ids uuid[])
returns integer                                       -- how many were archived
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); grace_end timestamptz; n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  -- No reclaim while ANY tier entitlement is active (paid OR trial still running).
  if exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.product in ('tier_pro','tier_vip')
      and (e.expires_at is null or e.expires_at > now())
  ) then
    raise exception 'still entitled' using errcode = 'P0001';
  end if;

  -- Grace = latest lapsed tier row's expiry + 3 days. Downgrade-only: a user who never held a
  -- tier has no grace row and is NOT reclaim-eligible.
  select max(e.expires_at) + interval '3 days' into grace_end
    from public.entitlements e
   where e.user_id = uid and e.product in ('tier_pro','tier_vip');
  if grace_end is null then raise exception 'nothing to reclaim' using errcode = 'P0001'; end if;
  if now() < grace_end then raise exception 'still in grace' using errcode = 'P0001'; end if;

  if coalesce(array_length(keep_ids, 1), 0) > public.free_binder_cap() then
    raise exception 'keep list exceeds the free cap' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(keep_ids) k
    where not exists (select 1 from public.binders b where b.id = k and b.owner_id = uid)
  ) then
    raise exception 'keep list contains a binder that is not yours' using errcode = 'P0001';
  end if;

  update public.binders set archived_at = now()
   where owner_id = uid and archived_at is null and coalesce(is_demo, false) = false
     and id <> all(keep_ids);
  get diagnostics n = row_count;
  return n;
end; $$;

-- ── reclaim_all_over_cap() — the authoritative scheduled enforcer ───────────────────────────
-- Set-based: for every DOWNGRADE user (all tier rows lapsed) past the 3-day grace, archive all
-- but their newest `free_binder_cap()` live binders. Never touches never-subscribed users
-- (no tier rows -> not eligible) or their demo binders. Idempotent — safe to run nightly.
create or replace function public.reclaim_all_over_cap() returns integer
language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  with eligible as (
    select e.user_id
      from public.entitlements e
     where e.product in ('tier_pro','tier_vip')
     group by e.user_id
    having bool_and(e.expires_at is not null and e.expires_at <= now())   -- none active/lifetime
       and max(e.expires_at) + interval '3 days' < now()                  -- grace passed
  ),
  ranked as (
    select b.id,
           row_number() over (partition by b.owner_id order by b.updated_at desc) as rn
      from public.binders b
      join eligible el on el.user_id = b.owner_id
     where b.archived_at is null and coalesce(b.is_demo, false) = false
  ),
  archived as (
    update public.binders set archived_at = now()
     where id in (select id from ranked where rn > public.free_binder_cap())
    returning 1
  )
  select count(*) into total from archived;
  return total;
end; $$;

-- ── restore_archived_binders(cap) — bring binders back on upgrade ───────────────────────────
-- Un-archive the caller's binders newest-first, up to the headroom under `cap` (the client owns
-- the tier cap matrix, so it passes the number; Infinity -> a large int for VIP). Safe anytime.
create or replace function public.restore_archived_binders(cap integer)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); live_count integer; n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select count(*) into live_count
    from public.binders
   where owner_id = uid and archived_at is null and coalesce(is_demo, false) = false;
  update public.binders set archived_at = null
   where id in (
     select id from public.binders
      where owner_id = uid and archived_at is not null and coalesce(is_demo, false) = false
      order by updated_at desc
      limit greatest(0, cap - live_count)
   );
  get diagnostics n = row_count;
  return n;
end; $$;

-- ── grants ─────────────────────────────────────────────────────────────────────────────────
revoke all on function public.start_pro_trial() from public;
revoke all on function public.reclaim_over_cap(uuid[]) from public;
revoke all on function public.restore_archived_binders(integer) from public;
-- reclaim_all_over_cap is the cron's; not granted to any client role.
grant execute on function public.start_pro_trial() to authenticated;
grant execute on function public.reclaim_over_cap(uuid[]) to authenticated;
grant execute on function public.restore_archived_binders(integer) to authenticated;

-- ── nightly scheduled reclaim (pg_cron) ────────────────────────────────────────────────────
-- Authoritative enforcer, robust against a tampered client. Requires pg_cron enabled on the
-- project (Dashboard -> Database -> Extensions -> pg_cron). Guarded so the migration still
-- applies if the extension isn't enabled yet — enable it, then re-run this DO block.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('reclaim-over-cap', '17 3 * * *', $j$ select public.reclaim_all_over_cap(); $j$);
  else
    raise notice 'pg_cron not enabled — scheduled reclaim NOT installed. Enable pg_cron and re-run the schedule.';
  end if;
end $$;

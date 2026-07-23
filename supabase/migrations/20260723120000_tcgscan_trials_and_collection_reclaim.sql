-- TCGScan: free PRO trials + over-cap COLLECTION reclaim on downgrade.
--
-- The tcgscan mirror of 20260721120000 (michi trials + binder reclaim). Same mechanic, same
-- 3-day grace, same soft-archive-not-delete promise — retargeted at `collections`, and with two
-- differences that matter:
--
--   1. COLLECTION IDS ARE `text`, not uuid. tcgscan rows are client-generated (offline-first),
--      so every signature here takes text[] where michi's takes uuid[].
--
--   2. ARCHIVING MUST WITHDRAW THE CARDS FROM `user_cards`. tcgscan's portfolio_entries feed the
--      shared user_cards rollup by trigger, and MICHI reads that rollup for its collection-aware
--      browse and build-a-binder features. Owner decision 2026-07-23: an archived collection does
--      NOT count as cards you own. So the trigger below learns to ignore entries in archived
--      collections, and archive/restore apply the bulk deltas. Without this a locked collection
--      would keep inflating portfolio value and keep marking cards "owned" in the other app.
--
-- Everything is server-side only; the client never writes archived_at (see tcgscan lib/sync).

-- ── tcgscan_pro_trials ledger ──────────────────────────────────────────────────────────────
-- Separate table from michi's pro_trials on purpose: the two apps' trials are independent
-- offers, one per account EACH, and a shared table would make trialing michi burn the tcgscan
-- trial. Same discipline: no client writes, the security-definer RPC is the only writer.
create table public.tcgscan_pro_trials (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.tcgscan_pro_trials is
  'One-per-account free TCGScan PRO trial ledger. Written only by start_tcgscan_pro_trial().';

alter table public.tcgscan_pro_trials enable row level security;

create policy "Users can read their own tcgscan trial" on public.tcgscan_pro_trials
  for select to authenticated using (auth.uid() = user_id);

-- ── collections.archived_at (soft-archive) ─────────────────────────────────────────────────
alter table public.collections add column archived_at timestamptz;  -- null = live
comment on column public.collections.archived_at is
  'Soft-archive: non-null hides the collection from its owner (over-cap reclaim) and withdraws '
  'its cards from the shared user_cards rollup. SERVER-OWNED — the client never pushes this.';

create index collections_owner_live_idx on public.collections (user_id) where archived_at is null;

-- ── the Free collection cap, mirrored from tcgscan lib/tiers.ts ─────────────────────────────
-- SQL can't import TIER_LIMITS.free.collections — same discipline (and same drift risk) as
-- michi's free_binder_cap(). If the Free cap changes in tiers.ts, change it here too.
create or replace function public.free_collection_cap() returns integer
  language sql immutable as $$ select 3 $$;

-- ── user_cards rollup becomes archive-aware ────────────────────────────────────────────────
-- An entry inside an archived collection contributes NOTHING. Making the trigger itself skip
-- those rows (rather than only adjusting on archive) keeps the rollup correct for every later
-- mutation too: editing or deleting an entry in an archived collection must stay a no-op, or the
-- bulk delta applied at archive time would be double-counted.
create or replace function public.sync_user_cards_from_portfolio()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  old_live boolean := false;
  new_live boolean := false;
begin
  if tg_op <> 'INSERT' then
    select c.archived_at is null into old_live
      from public.collections c where c.id = old.collection_id;
    old_live := coalesce(old_live, true);   -- no collection row (yet) → treat as live
  end if;
  if tg_op <> 'DELETE' then
    select c.archived_at is null into new_live
      from public.collections c where c.id = new.collection_id;
    new_live := coalesce(new_live, true);
  end if;

  if tg_op = 'INSERT' then
    if new_live then
      perform public.apply_user_card_delta(new.user_id, new.card_id, new.quantity);
    end if;
  elsif tg_op = 'DELETE' then
    if old_live then
      perform public.apply_user_card_delta(old.user_id, old.card_id, -old.quantity);
    end if;
  else
    -- Withdraw the old contribution (if it counted) and apply the new one (if it counts).
    if old_live then
      perform public.apply_user_card_delta(old.user_id, old.card_id, -old.quantity);
    end if;
    if new_live then
      perform public.apply_user_card_delta(new.user_id, new.card_id, new.quantity);
    end if;
  end if;
  return null;
end;
$function$;

-- Apply the bulk user_cards delta for a set of collections being archived (sign -1) or
-- restored (+1). Internal helper for the reclaim/restore functions below.
create or replace function public.apply_collection_card_deltas(
  p_user_id uuid,
  p_collection_ids text[],
  p_sign integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select e.card_id, sum(e.quantity)::integer as qty
      from public.portfolio_entries e
     where e.user_id = p_user_id and e.collection_id = any(p_collection_ids)
     group by e.card_id
  loop
    perform public.apply_user_card_delta(p_user_id, r.card_id, p_sign * r.qty);
  end loop;
end; $$;

-- ── start_tcgscan_pro_trial() ──────────────────────────────────────────────────────────────
-- Mirrors start_pro_trial(): 14 days, real accounts only, one per account ever, no win-back.
create or replace function public.start_tcgscan_pro_trial()
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

  return trial_end;
end; $$;

-- ── reclaim_over_cap_collections(keep_ids) — the in-app "choose which to keep" ──────────────
-- Archives the caller's over-cap excess, keeping keep_ids. Enforces server-side that the caller
-- (a) has NO active tcgscan tier (paid or trial), (b) DID hold one that lapsed (downgrade-only),
-- (c) is past the 3-day grace, (d) isn't keeping more than the Free cap, and (e) owns every id.
create or replace function public.reclaim_over_cap_collections(keep_ids text[])
returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); grace_end timestamptz; doomed text[]; n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  if exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.product in ('tcgscan_pro','tcgscan_vip')
      and (e.expires_at is null or e.expires_at > now())
  ) then
    raise exception 'still entitled' using errcode = 'P0001';
  end if;

  select max(e.expires_at) + interval '3 days' into grace_end
    from public.entitlements e
   where e.user_id = uid and e.product in ('tcgscan_pro','tcgscan_vip');
  if grace_end is null then raise exception 'nothing to reclaim' using errcode = 'P0001'; end if;
  if now() < grace_end then raise exception 'still in grace' using errcode = 'P0001'; end if;

  if coalesce(array_length(keep_ids, 1), 0) > public.free_collection_cap() then
    raise exception 'keep list exceeds the free cap' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(keep_ids) k
    where not exists (select 1 from public.collections c where c.id = k and c.user_id = uid)
  ) then
    raise exception 'keep list contains a collection that is not yours' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(c.id), '{}') into doomed
    from public.collections c
   where c.user_id = uid and c.archived_at is null and c.id <> all(keep_ids);

  if array_length(doomed, 1) is null then return 0; end if;

  -- Withdraw their cards from the shared rollup BEFORE flipping the flag: once archived_at is
  -- set the trigger treats those entries as non-counting, and the bulk delta would be skipped.
  perform public.apply_collection_card_deltas(uid, doomed, -1);

  update public.collections
     set archived_at = now(),
         -- Bump updated_at so the change is unambiguous to any device comparing timestamps.
         updated_at = now()
   where id = any(doomed);
  get diagnostics n = row_count;
  return n;
end; $$;

-- ── reclaim_all_over_cap_collections() — the nightly enforcer ───────────────────────────────
-- Set-based default reclaim: for every DOWNGRADE user past grace, archive all but their newest
-- `free_collection_cap()` live collections (same "keep the most recently updated" default as
-- michi). Idempotent. Loops per user so the rollup deltas stay correct.
create or replace function public.reclaim_all_over_cap_collections() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; doomed text[]; total integer := 0; n integer;
begin
  for r in
    select e.user_id
      from public.entitlements e
     where e.product in ('tcgscan_pro','tcgscan_vip')
     group by e.user_id
    having bool_and(e.expires_at is not null and e.expires_at <= now())
       and max(e.expires_at) + interval '3 days' < now()
  loop
    select coalesce(array_agg(id), '{}') into doomed from (
      select c.id,
             row_number() over (partition by c.user_id order by c.updated_at desc) as rn
        from public.collections c
       where c.user_id = r.user_id and c.archived_at is null
    ) ranked where rn > public.free_collection_cap();

    if array_length(doomed, 1) is not null then
      perform public.apply_collection_card_deltas(r.user_id, doomed, -1);
      update public.collections set archived_at = now(), updated_at = now()
       where id = any(doomed);
      get diagnostics n = row_count;
      total := total + n;
    end if;
  end loop;
  return total;
end; $$;

-- ── restore_archived_collections(cap) — bring them back on upgrade ──────────────────────────
create or replace function public.restore_archived_collections(cap integer)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); live_count integer; revived text[]; n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select count(*) into live_count
    from public.collections where user_id = uid and archived_at is null;

  select coalesce(array_agg(id), '{}') into revived from (
    select c.id from public.collections c
     where c.user_id = uid and c.archived_at is not null
     order by c.updated_at desc
     limit greatest(0, cap - live_count)
  ) pick;

  if array_length(revived, 1) is null then return 0; end if;

  update public.collections set archived_at = null, updated_at = now() where id = any(revived);
  get diagnostics n = row_count;
  -- Flag cleared first, so the entries count again; then add their cards back to the rollup.
  perform public.apply_collection_card_deltas(uid, revived, 1);
  return n;
end; $$;

-- ── grants ─────────────────────────────────────────────────────────────────────────────────
revoke all on function public.start_tcgscan_pro_trial() from public;
revoke all on function public.reclaim_over_cap_collections(text[]) from public;
revoke all on function public.restore_archived_collections(integer) from public;
revoke all on function public.apply_collection_card_deltas(uuid, text[], integer) from public;
-- reclaim_all_over_cap_collections + apply_collection_card_deltas are internal (cron / definer).
grant execute on function public.start_tcgscan_pro_trial() to authenticated;
grant execute on function public.reclaim_over_cap_collections(text[]) to authenticated;
grant execute on function public.restore_archived_collections(integer) to authenticated;

-- ── nightly scheduled reclaim (pg_cron) ────────────────────────────────────────────────────
-- Runs 20 minutes after michi's so the two never contend for the same rows/locks.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'reclaim-over-cap-collections', '37 3 * * *',
      $j$ select public.reclaim_all_over_cap_collections(); $j$
    );
  else
    raise notice 'pg_cron not enabled — scheduled collection reclaim NOT installed.';
  end if;
end $$;

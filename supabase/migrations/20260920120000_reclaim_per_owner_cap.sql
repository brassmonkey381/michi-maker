-- ═══════════════════════════════════════════════════════════
-- Over-cap reclaim reads EACH OWNER'S Free cap, not one number for everyone
-- ═══════════════════════════════════════════════════════════
-- The four reclaim functions ranked every lapsed account against `free_binder_cap()` /
-- `free_collection_cap()`: one number for the whole table. That was true while there was one Free
-- tier. The tier rework (tcgscan-app docs/TIER-REWORK.md, owner 2026-09-20) lowers Free for NEW
-- accounts and lets accounts that already exist keep the caps they signed up under. With two Free
-- cap sets and one number in the reclaim, the nightly job would archive a long-standing account's
-- third binder the night the new cap landed: a legitimate binder hidden from its owner because a
-- price page changed. This migration removes that possibility BEFORE any cap number moves.
--
-- `free_binder_cap_for(uid)` / `free_collection_cap_for(uid)` answer "what is the Free cap FOR THIS
-- ACCOUNT". Today they return exactly what the old helpers returned, so this migration is
-- BEHAVIOUR-PRESERVING: same accounts eligible, same binders kept, same count archived. The legacy
-- rule arrives later as a change to these two functions only, and every reclaim path inherits it.
--
-- Everything else about reclaim is untouched: downgrade-only eligibility, the 3-day grace, newest
-- kept first, demo binders and never-subscribed accounts never touched, the rollup deltas applied
-- before a collection is flagged. `create or replace` keeps the existing grants.

create or replace function public.free_binder_cap_for(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('michi', 'binders', 'free');
$$;

create or replace function public.free_collection_cap_for(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select public.cap_value('tcgscan', 'collections', 'free');
$$;

comment on function public.free_binder_cap_for(uuid) is
  'The FREE binder cap that applies to this account. The over-cap reclaim ranks each owner against '
  'this, never against one table-wide number, so accounts on different Free cap sets are each '
  'held to their own.';
comment on function public.free_collection_cap_for(uuid) is
  'The FREE collection cap that applies to this account. See free_binder_cap_for.';

revoke all on function public.free_binder_cap_for(uuid)     from public;
revoke all on function public.free_collection_cap_for(uuid) from public;

-- ── michi: user-initiated ────────────────────────────────────────────────────────────────────
create or replace function public.reclaim_over_cap(keep_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); grace_end timestamptz; n integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  if exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.product in ('tier_pro','tier_vip')
      and (e.expires_at is null or e.expires_at > now())
  ) then
    raise exception 'still entitled' using errcode = 'P0001';
  end if;

  select max(e.expires_at) + interval '3 days' into grace_end
    from public.entitlements e
   where e.user_id = uid and e.product in ('tier_pro','tier_vip');
  if grace_end is null then raise exception 'nothing to reclaim' using errcode = 'P0001'; end if;
  if now() < grace_end then raise exception 'still in grace' using errcode = 'P0001'; end if;

  if coalesce(array_length(keep_ids, 1), 0) > public.free_binder_cap_for(uid) then
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

-- ── michi: the nightly enforcer ──────────────────────────────────────────────────────────────
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
    select b.id, b.owner_id,
           row_number() over (partition by b.owner_id order by b.updated_at desc) as rn
      from public.binders b
      join eligible el on el.user_id = b.owner_id
     where b.archived_at is null and coalesce(b.is_demo, false) = false
  ),
  archived as (
    update public.binders set archived_at = now()
     where id in (select r.id from ranked r where r.rn > public.free_binder_cap_for(r.owner_id))
    returning 1
  )
  select count(*) into total from archived;
  return total;
end; $$;

-- ── tcgscan: user-initiated ──────────────────────────────────────────────────────────────────
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

  if coalesce(array_length(keep_ids, 1), 0) > public.free_collection_cap_for(uid) then
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

  perform public.apply_collection_card_deltas(uid, doomed, -1);

  update public.collections
     set archived_at = now(),
         updated_at = now()
   where id = any(doomed);
  get diagnostics n = row_count;
  return n;
end; $$;

-- ── tcgscan: the nightly enforcer ────────────────────────────────────────────────────────────
create or replace function public.reclaim_all_over_cap_collections() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; doomed text[]; total integer := 0; n integer; keep integer;
begin
  for r in
    select e.user_id
      from public.entitlements e
     where e.product in ('tcgscan_pro','tcgscan_vip')
     group by e.user_id
    having bool_and(e.expires_at is not null and e.expires_at <= now())
       and max(e.expires_at) + interval '3 days' < now()
  loop
    keep := public.free_collection_cap_for(r.user_id);
    select coalesce(array_agg(id), '{}') into doomed from (
      select c.id,
             row_number() over (partition by c.user_id order by c.updated_at desc) as rn
        from public.collections c
       where c.user_id = r.user_id and c.archived_at is null
    ) ranked where rn > keep;

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

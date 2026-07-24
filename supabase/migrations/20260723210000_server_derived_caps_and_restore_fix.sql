-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Server-derived tier caps + close the restore_archived_* hole
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Both restore RPCs took the cap as a CLIENT-SUPPLIED integer with no entitlement check:
--
--     restore_archived_binders(1000000)      -- any authenticated caller
--     restore_archived_collections(1000000)
--
-- ...un-archived everything the nightly reclaim had just locked, which made the whole reclaim
-- mechanism a formality (cron vs. one RPC call). This migration derives the cap server-side
-- from the entitlements ledger and keeps the client argument only as an UPPER bound, so honest
-- clients (which pass their real tier cap) behave exactly as before while a forged large value
-- is clamped to what the caller actually pays for.
--
-- The tier/cap functions added here are also the foundation the insert-time cap triggers will
-- build on — one server-side definition of "what tier is this user", mirroring resolveTier()
-- in michi's src/data/tiers.ts and tcgscan-app's src/lib/tiers.ts.
--
-- NOTE (drift): the cap NUMBERS still mirror TIER_LIMITS by hand, same discipline as
-- free_binder_cap() / free_collection_cap() / PRINTS_PER_MONTH in the webhook. Change them
-- together. Consolidating the three copies is a follow-up.

-- ── tier resolution ────────────────────────────────────────────────────────────────────────
-- Entitlements-only: returns 'free' | 'pro' | 'vip'. Anonymous callers ('guest') are NOT
-- detected here, because these take a uid and are also called for other users by the cron —
-- auth.jwt() is only meaningful in a request context. Callers that must distinguish a guest
-- use the is_anonymous claim, exactly as start_pro_trial() does.

create or replace function public.michi_tier(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.entitlements e
                  where e.user_id = p_user_id and e.product = 'tier_vip'
                    and (e.expires_at is null or e.expires_at > now())) then 'vip'
    when exists (select 1 from public.entitlements e
                  where e.user_id = p_user_id and e.product = 'tier_pro'
                    and (e.expires_at is null or e.expires_at > now())) then 'pro'
    else 'free'
  end;
$$;

create or replace function public.tcgscan_tier(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.entitlements e
                  where e.user_id = p_user_id and e.product = 'tcgscan_vip'
                    and (e.expires_at is null or e.expires_at > now())) then 'vip'
    when exists (select 1 from public.entitlements e
                  where e.user_id = p_user_id and e.product = 'tcgscan_pro'
                    and (e.expires_at is null or e.expires_at > now())) then 'pro'
    else 'free'
  end;
$$;

-- ── caps per tier (mirrors TIER_LIMITS; Infinity -> UNCAPPED) ───────────────────────────────
-- A sentinel rather than a nullable, so callers can always do arithmetic with the result.
create or replace function public.uncapped() returns integer
  language sql immutable as $$ select 1000000 $$;

create or replace function public.michi_binder_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.michi_tier(p_user_id)
           when 'vip' then public.uncapped()
           when 'pro' then 12
           else public.free_binder_cap()
         end;
$$;

create or replace function public.tcgscan_collection_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.tcgscan_tier(p_user_id)
           when 'vip' then public.uncapped()
           when 'pro' then 12
           else public.free_collection_cap()
         end;
$$;

-- ── restore_archived_binders(cap) — cap is now an upper bound, not the authority ────────────
create or replace function public.restore_archived_binders(cap integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid          uuid := auth.uid();
  server_cap   integer;
  effective    integer;
  live_count   integer;
  n            integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  server_cap := public.michi_binder_cap(uid);
  -- Honest clients pass their real tier cap and are unaffected; a forged value is clamped.
  effective  := least(coalesce(cap, server_cap), server_cap);

  select count(*) into live_count
    from public.binders
   where owner_id = uid and archived_at is null and coalesce(is_demo, false) = false;

  update public.binders set archived_at = null
   where id in (
     select id from public.binders
      where owner_id = uid and archived_at is not null and coalesce(is_demo, false) = false
      order by updated_at desc
      limit greatest(0, effective - live_count)
   );
  get diagnostics n = row_count;
  return n;
end; $$;

-- ── restore_archived_collections(cap) — same treatment ──────────────────────────────────────
create or replace function public.restore_archived_collections(cap integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid         uuid := auth.uid();
  server_cap  integer;
  effective   integer;
  live_count  integer;
  revived     text[];
  n           integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  server_cap := public.tcgscan_collection_cap(uid);
  effective  := least(coalesce(cap, server_cap), server_cap);

  select count(*) into live_count
    from public.collections where user_id = uid and archived_at is null;

  select coalesce(array_agg(id), '{}') into revived from (
    select c.id from public.collections c
     where c.user_id = uid and c.archived_at is not null
     order by c.updated_at desc
     limit greatest(0, effective - live_count)
  ) pick;

  if array_length(revived, 1) is null then return 0; end if;

  update public.collections set archived_at = null, updated_at = now() where id = any(revived);
  get diagnostics n = row_count;
  -- Flag cleared first, so the entries count again; then add their cards back to the rollup.
  perform public.apply_collection_card_deltas(uid, revived, 1);
  return n;
end; $$;

-- ── grants ─────────────────────────────────────────────────────────────────────────────────
-- The tier/cap helpers are read-only and only ever report on a uid the caller already knows;
-- they are granted so future RLS policies and triggers can call them as the invoking user.
revoke all on function public.michi_tier(uuid)              from public;
revoke all on function public.tcgscan_tier(uuid)            from public;
revoke all on function public.michi_binder_cap(uuid)        from public;
revoke all on function public.tcgscan_collection_cap(uuid)  from public;
revoke all on function public.uncapped()                    from public;
revoke all on function public.restore_archived_binders(integer)     from public;
revoke all on function public.restore_archived_collections(integer) from public;

grant execute on function public.michi_tier(uuid)              to authenticated;
grant execute on function public.tcgscan_tier(uuid)            to authenticated;
grant execute on function public.michi_binder_cap(uuid)        to authenticated;
grant execute on function public.tcgscan_collection_cap(uuid)  to authenticated;
grant execute on function public.uncapped()                    to authenticated;
grant execute on function public.restore_archived_binders(integer)     to authenticated;
grant execute on function public.restore_archived_collections(integer) to authenticated;

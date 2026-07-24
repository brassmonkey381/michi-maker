-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Insert-time tier caps — the server-side enforcement boundary
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Until now EVERY numeric cap in both apps lived only in client JavaScript, while RLS asserted
-- ownership and nothing else. A patched bundle, a direct PostgREST call, or tcgscan's own sync
-- (`pushDelta` upserts whatever the local store holds) wrote past any cap unchallenged.
--
-- These triggers make the caps real. They are the enforcement boundary; the clients' own checks
-- remain, and remain necessary — they are what turns a refusal into an upgrade prompt instead of
-- a raw Postgres error.
--
-- ── Design notes (the non-obvious parts) ───────────────────────────────────────────────────
--
-- UPSERTS. Both apps sync with `upsert`, which is INSERT ... ON CONFLICT DO UPDATE, and a
-- BEFORE INSERT trigger fires *before* conflict detection. Without care, a user who is already
-- over cap (or simply at it) could not re-sync their OWN EXISTING rows — every device sync would
-- raise. So each trigger first asks "does this id already exist?" and lets it through if so:
-- re-stating an existing row is never a new allocation. This is what makes the rollout safe for
-- the accounts already over cap.
--
-- GUESTS. Anonymous Supabase sessions hold the `authenticated` role and are indistinguishable
-- from free accounts at the row level, so guest caps are resolved from the is_anonymous JWT
-- claim, the same way start_pro_trial() does.
--
-- PRIVILEGED WRITES. The payments webhook, the cron reclaimers and manual SQL run as
-- service_role/postgres and bypass every cap — they are not user allocations.
--
-- STAFF. `official@michi-maker.com` holds 19 showcase binders against a free cap of 3. Rather
-- than grandfathering (there are no other over-cap accounts — verified against production on
-- 2026-07-23), staff accounts are exempt by allowlist.
--
-- ERRORS. Refusals raise SQLSTATE P0001 with a `tier_cap_exceeded:<limit>` message prefix so a
-- client can pattern-match it onto the existing upgrade prompt rather than showing a DB error.
--
-- NOTE (drift): cap NUMBERS still mirror TIER_LIMITS in michi's src/data/tiers.ts and tcgscan's
-- src/lib/tiers.ts by hand. Change them together. Consolidation is a tracked follow-up.

-- ── who is exempt ──────────────────────────────────────────────────────────────────────────

create table if not exists public.staff_accounts (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.staff_accounts is
  'Accounts exempt from tier caps (showcase/support). Service-role writes only — there are '
  'deliberately NO client policies, so membership cannot be self-granted.';

alter table public.staff_accounts enable row level security;
-- No policies: unreachable from `anon`/`authenticated` by construction.

insert into public.staff_accounts (user_id, note)
select id, 'michi-maker showcase account (public example binders)'
  from auth.users where email = 'official@michi-maker.com'
on conflict (user_id) do nothing;

create or replace function public.is_staff(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_accounts s where s.user_id = p_user_id);
$$;

-- True for service_role / postgres / admin connections: not a user allocation, never capped.
create or replace function public.is_privileged_write()
returns boolean language sql stable set search_path = public as $$
  select coalesce(auth.role(), current_user) in ('service_role', 'postgres', 'supabase_admin');
$$;

create or replace function public.request_is_anonymous()
returns boolean language sql stable set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- ── effective tiers (entitlements + the guest distinction) ──────────────────────────────────

create or replace function public.michi_effective_tier(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.request_is_anonymous() then 'guest'
              else public.michi_tier(p_user_id) end;
$$;

create or replace function public.tcgscan_effective_tier(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.request_is_anonymous() then 'guest'
              else public.tcgscan_tier(p_user_id) end;
$$;

-- ── caps (mirror TIER_LIMITS; Infinity -> uncapped()) ───────────────────────────────────────

create or replace function public.michi_binder_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.michi_effective_tier(p_user_id)
           when 'vip' then public.uncapped() when 'pro' then 12
           when 'guest' then 1 else public.free_binder_cap() end;
$$;

create or replace function public.michi_page_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.michi_effective_tier(p_user_id)
           when 'vip' then public.uncapped() when 'pro' then 40
           when 'guest' then 6 else 16 end;
$$;

create or replace function public.michi_slice_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.michi_effective_tier(p_user_id)
           when 'vip' then public.uncapped() when 'pro' then 1000
           when 'guest' then 10 else 100 end;
$$;

create or replace function public.tcgscan_collection_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.tcgscan_effective_tier(p_user_id)
           when 'vip' then public.uncapped() when 'pro' then 12
           when 'guest' then 1 else public.free_collection_cap() end;
$$;

-- Counts CARDS (sum of quantity), not lots — matches what the UI displays and what the tier
-- table advertises. A 250-lot collection of quantity-99 entries is 24,750 cards, not 250.
create or replace function public.tcgscan_card_cap(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case public.tcgscan_effective_tier(p_user_id)
           when 'vip' then public.uncapped() when 'pro' then 1000
           when 'guest' then 60 else 250 end;
$$;

-- ── triggers ───────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_binder_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer; live integer;
begin
  if public.is_privileged_write() then return new; end if;
  if coalesce(new.is_demo, false) or new.archived_at is not null then return new; end if;
  if exists (select 1 from public.binders b where b.id = new.id) then return new; end if;
  if public.is_staff(new.owner_id) then return new; end if;

  cap := public.michi_binder_cap(new.owner_id);
  select count(*) into live from public.binders b
   where b.owner_id = new.owner_id and b.archived_at is null
     and coalesce(b.is_demo, false) = false;

  if live >= cap then
    raise exception 'tier_cap_exceeded:binders (% of %)', live, cap using errcode = 'P0001';
  end if;
  return new;
end; $$;

create or replace function public.enforce_binder_page_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; demo boolean; cap integer; live integer;
begin
  if public.is_privileged_write() then return new; end if;
  if exists (select 1 from public.binder_pages p where p.id = new.id) then return new; end if;

  select b.owner_id, coalesce(b.is_demo, false) into owner, demo
    from public.binders b where b.id = new.binder_id;
  if owner is null or demo then return new; end if;
  if public.is_staff(owner) then return new; end if;

  cap := public.michi_page_cap(owner);
  select count(*) into live from public.binder_pages p where p.binder_id = new.binder_id;

  if live >= cap then
    raise exception 'tier_cap_exceeded:pagesPerBinder (% of %)', live, cap using errcode = 'P0001';
  end if;
  return new;
end; $$;

create or replace function public.enforce_slice_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer; live integer;
begin
  if public.is_privileged_write() then return new; end if;
  if new.deleted_at is not null then return new; end if;
  if exists (select 1 from public.saved_slices s where s.id = new.id) then return new; end if;
  if public.is_staff(new.owner_id) then return new; end if;

  cap := public.michi_slice_cap(new.owner_id);
  select count(*) into live from public.saved_slices s
   where s.owner_id = new.owner_id and s.deleted_at is null;

  if live >= cap then
    raise exception 'tier_cap_exceeded:artUploads (% of %)', live, cap using errcode = 'P0001';
  end if;
  return new;
end; $$;

create or replace function public.enforce_collection_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer; live integer;
begin
  if public.is_privileged_write() then return new; end if;
  if new.archived_at is not null then return new; end if;
  if exists (select 1 from public.collections c where c.id = new.id) then return new; end if;
  if public.is_staff(new.user_id) then return new; end if;

  cap := public.tcgscan_collection_cap(new.user_id);
  select count(*) into live from public.collections c
   where c.user_id = new.user_id and c.archived_at is null;

  if live >= cap then
    raise exception 'tier_cap_exceeded:collections (% of %)', live, cap using errcode = 'P0001';
  end if;
  return new;
end; $$;

-- Cards per collection, enforced on INSERT and on any quantity INCREASE (raising a lot from 1
-- to 500 is a cap-relevant allocation, and was previously unchecked on both client and server).
create or replace function public.enforce_card_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer; total integer; addition integer;
begin
  if public.is_privileged_write() then return new; end if;
  if public.is_staff(new.user_id) then return new; end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from public.portfolio_entries e where e.id = new.id) then return new; end if;
    addition := greatest(coalesce(new.quantity, 1), 0);
    select coalesce(sum(e.quantity), 0) into total from public.portfolio_entries e
     where e.collection_id = new.collection_id;
  else
    addition := greatest(coalesce(new.quantity, 1) - coalesce(old.quantity, 1), 0);
    if addition = 0 then return new; end if;          -- shrinking or unchanged: always allowed
    select coalesce(sum(e.quantity), 0) into total from public.portfolio_entries e
     where e.collection_id = new.collection_id;
  end if;

  cap := public.tcgscan_card_cap(new.user_id);
  if total + addition > cap then
    raise exception 'tier_cap_exceeded:cardsPerCollection (% of %)', total + addition, cap
      using errcode = 'P0001';
  end if;
  return new;
end; $$;

drop trigger if exists binders_enforce_cap          on public.binders;
drop trigger if exists binder_pages_enforce_cap     on public.binder_pages;
drop trigger if exists saved_slices_enforce_cap     on public.saved_slices;
drop trigger if exists collections_enforce_cap      on public.collections;
drop trigger if exists portfolio_entries_enforce_cap on public.portfolio_entries;

create trigger binders_enforce_cap
  before insert on public.binders
  for each row execute function public.enforce_binder_cap();

create trigger binder_pages_enforce_cap
  before insert on public.binder_pages
  for each row execute function public.enforce_binder_page_cap();

create trigger saved_slices_enforce_cap
  before insert on public.saved_slices
  for each row execute function public.enforce_slice_cap();

create trigger collections_enforce_cap
  before insert on public.collections
  for each row execute function public.enforce_collection_cap();

create trigger portfolio_entries_enforce_cap
  before insert or update of quantity on public.portfolio_entries
  for each row execute function public.enforce_card_cap();

-- ── grants ─────────────────────────────────────────────────────────────────────────────────
revoke all on function public.is_staff(uuid)                  from public;
revoke all on function public.is_privileged_write()           from public;
revoke all on function public.request_is_anonymous()          from public;
revoke all on function public.michi_effective_tier(uuid)      from public;
revoke all on function public.tcgscan_effective_tier(uuid)    from public;
revoke all on function public.michi_page_cap(uuid)            from public;
revoke all on function public.michi_slice_cap(uuid)           from public;
revoke all on function public.tcgscan_card_cap(uuid)          from public;

grant execute on function public.michi_effective_tier(uuid)   to authenticated;
grant execute on function public.tcgscan_effective_tier(uuid) to authenticated;
grant execute on function public.michi_page_cap(uuid)         to authenticated;
grant execute on function public.michi_slice_cap(uuid)        to authenticated;
grant execute on function public.tcgscan_card_cap(uuid)       to authenticated;
-- is_staff / is_privileged_write / request_is_anonymous stay internal to the trigger functions.

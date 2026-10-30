-- Binders that sit outside the owner's binder cap.
--
-- 2026-10-30: until 56e656f the account sheet opened on "Sign in" for guests, so a guest's Google
-- tap minted a NEW auth user instead of linking onto the anonymous one, and the guest's binder
-- stayed behind on a uid nobody could reach. 33 such binders are re-homed onto the accounts their
-- owners created seconds later (scripts/zz-rehome-orphans.mjs). The owner's rule: a returned binder
-- must not eat into that person's Free cap, which most of them had already filled by rebuilding.
--
-- Only a privileged write may set the flag: a client could otherwise insert cap_exempt = true and
-- step around the cap. The guard trigger silently keeps the old value (false on insert).

alter table public.binders
  add column if not exists cap_exempt boolean not null default false;

comment on column public.binders.cap_exempt is
  'Outside the owner''s binder cap (re-homed guest binders). Settable by privileged writes only.';

create or replace function public.binders_guard_cap_exempt()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.is_privileged_write() then return new; end if;
  if tg_op = 'INSERT' then
    new.cap_exempt := false;
  else
    new.cap_exempt := old.cap_exempt;
  end if;
  return new;
end; $$;

drop trigger if exists binders_guard_cap_exempt on public.binders;
create trigger binders_guard_cap_exempt
  before insert or update on public.binders
  for each row execute function public.binders_guard_cap_exempt();

-- The cap counts live, non-demo, non-exempt binders.
create or replace function public.enforce_binder_cap()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare cap integer; live integer;
begin
  if public.is_privileged_write() then return new; end if;
  if coalesce(new.is_demo, false) or new.archived_at is not null then return new; end if;
  if exists (select 1 from public.binders b where b.id = new.id) then return new; end if;
  if public.is_staff(new.owner_id) then return new; end if;

  cap := public.michi_binder_cap(new.owner_id);
  select count(*) into live from public.binders b
   where b.owner_id = new.owner_id and b.archived_at is null
     and coalesce(b.is_demo, false) = false
     and not b.cap_exempt;

  if live >= cap then
    raise exception 'tier_cap_exceeded:binders (% of %)', live, cap using errcode = 'P0001';
  end if;
  return new;
end; $$;

create or replace function public.restore_archived_binders(cap integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid          uuid := auth.uid();
  server_cap   integer;
  effective    integer;
  live_count   integer;
  n            integer;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;

  server_cap := public.michi_binder_cap(uid);
  effective  := least(coalesce(cap, server_cap), server_cap);

  select count(*) into live_count
    from public.binders
   where owner_id = uid and archived_at is null and coalesce(is_demo, false) = false
     and not cap_exempt;

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

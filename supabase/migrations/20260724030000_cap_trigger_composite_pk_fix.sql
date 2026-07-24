-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Cap triggers: scope the "row already exists" check to the OWNER
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- `collections` and `portfolio_entries` are keyed `(user_id, id)`, not `(id)` — tcgscan ids are
-- client-generated and only unique per user (see 20260714225442_tcgscan_composite_pks).
--
-- The cap triggers exempt an insert whose row already exists, so that a device re-syncing its
-- own rows never trips the cap (a BEFORE INSERT trigger fires before ON CONFLICT resolution).
-- That check matched on `id` alone, which under a composite key means ANOTHER user's row with
-- the same id would exempt the insert — a cap bypass for anyone who can guess or observe an id.
-- Both checks now match the full key.
--
-- Found by probing the live triggers right after applying them: the probe's own upsert failed
-- with "no unique or exclusion constraint matching the ON CONFLICT specification", which is what
-- surfaced the composite key.

create or replace function public.enforce_collection_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer; live integer;
begin
  if public.is_privileged_write() then return new; end if;
  if new.archived_at is not null then return new; end if;
  if exists (select 1 from public.collections c
              where c.id = new.id and c.user_id = new.user_id) then return new; end if;
  if public.is_staff(new.user_id) then return new; end if;

  cap := public.tcgscan_collection_cap(new.user_id);
  select count(*) into live from public.collections c
   where c.user_id = new.user_id and c.archived_at is null;

  if live >= cap then
    raise exception 'tier_cap_exceeded:collections (% of %)', live, cap using errcode = 'P0001';
  end if;
  return new;
end; $$;

create or replace function public.enforce_card_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap integer; total integer; addition integer;
begin
  if public.is_privileged_write() then return new; end if;
  if public.is_staff(new.user_id) then return new; end if;
  if exists (select 1 from public.collections c
              where c.id = new.collection_id and c.user_id = new.user_id
                and c.archived_at is not null) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from public.portfolio_entries e
                where e.id = new.id and e.user_id = new.user_id) then return new; end if;
    addition := greatest(coalesce(new.quantity, 1), 0);
    select coalesce(sum(e.quantity), 0) into total from public.portfolio_entries e
     where e.collection_id = new.collection_id and e.user_id = new.user_id;
  else
    addition := greatest(coalesce(new.quantity, 1) - coalesce(old.quantity, 1), 0);
    if addition = 0 then return new; end if;
    select coalesce(sum(e.quantity), 0) into total from public.portfolio_entries e
     where e.collection_id = new.collection_id and e.user_id = new.user_id;
  end if;

  cap := public.tcgscan_card_cap(new.user_id);
  if total + addition > cap then
    raise exception 'tier_cap_exceeded:cardsPerCollection (% of %)', total + addition, cap
      using errcode = 'P0001';
  end if;
  return new;
end; $$;

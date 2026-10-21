-- THE TRAY: a card that is in a binder but on no page (owner, 2026-10-21: "a scratch work dock /
-- tray"). Cards taken off a page while rearranging, and the cards an Arrange template displaces
-- from a full page, wait here and go back into any pocket on any page.
--
-- A TRAY CARD IS A SLOT WITH NO PAGE. The same binder_slots row moves between a page and the
-- tray by UPDATE, so it keeps its id, its source_entry_id claim stamp and its from_collection
-- flag; a separate tray table would mean delete-and-insert on every move and a second place for
-- those stamps to go wrong (binder_slots.source_entry_id has cost two days already). page_id
-- becomes nullable and binder_id names the binder for exactly the rows that have no page:
--
--   page row:  page_id set,  binder_id null     (every row that existed before this migration)
--   tray row:  page_id null, binder_id set      row_index 0, col_index = position in the tray
--
-- The cell rule unique (page_id, row_index, col_index) ignores rows whose page_id is null, so the
-- tray needs no cell bookkeeping of its own. Every reader that joins through binder_pages (public
-- viewing, discover, the shelf's face page, puzzle sync, the share image) leaves tray rows out by
-- construction, which is right: the tray is the owner's scratch space, never shown to anyone else.
--
-- What has to learn the second path: the four owner policies, the two triggers that find a slot's
-- binder through its page, the over-placement demotion, and reseat_slots (so a whole Arrange,
-- displaced cards included, is still one transaction).

alter table public.binder_slots alter column page_id drop not null;

alter table public.binder_slots
  add column if not exists binder_id uuid references public.binders(id) on delete cascade;

comment on column public.binder_slots.binder_id is
  'Set only on a TRAY row (page_id null): the binder this card waits in. Page rows leave it null.';

create index if not exists binder_slots_binder_id_idx
  on public.binder_slots (binder_id) where binder_id is not null;

alter table public.binder_slots drop constraint if exists binder_slots_page_or_tray;
alter table public.binder_slots
  add constraint binder_slots_page_or_tray check ((page_id is null) <> (binder_id is null));

-- ---------------------------------------------------------------------------------------------
-- Policies: the owner reaches a tray row through binder_id; nobody else reaches it at all.
-- ---------------------------------------------------------------------------------------------

drop policy if exists "Slots of owned binders are viewable" on public.binder_slots;
create policy "Slots of owned binders are viewable"
  on public.binder_slots for select to authenticated
  using (
    exists (select 1 from public.binder_pages p join public.binders b on b.id = p.binder_id
             where p.id = binder_slots.page_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.binders b
                where b.id = binder_slots.binder_id and b.owner_id = (select auth.uid()))
  );

drop policy if exists "Owners can insert slots" on public.binder_slots;
create policy "Owners can insert slots"
  on public.binder_slots for insert to authenticated
  with check (
    exists (select 1 from public.binder_pages p join public.binders b on b.id = p.binder_id
             where p.id = binder_slots.page_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.binders b
                where b.id = binder_slots.binder_id and b.owner_id = (select auth.uid()))
  );

drop policy if exists "Owners can update slots" on public.binder_slots;
create policy "Owners can update slots"
  on public.binder_slots for update to authenticated
  using (
    exists (select 1 from public.binder_pages p join public.binders b on b.id = p.binder_id
             where p.id = binder_slots.page_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.binders b
                where b.id = binder_slots.binder_id and b.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.binder_pages p join public.binders b on b.id = p.binder_id
             where p.id = binder_slots.page_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.binders b
                where b.id = binder_slots.binder_id and b.owner_id = (select auth.uid()))
  );

drop policy if exists "Owners can delete slots" on public.binder_slots;
create policy "Owners can delete slots"
  on public.binder_slots for delete to authenticated
  using (
    exists (select 1 from public.binder_pages p join public.binders b on b.id = p.binder_id
             where p.id = binder_slots.page_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.binders b
                where b.id = binder_slots.binder_id and b.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------------------------
-- Triggers that find the binder through the page learn the tray path.
-- ---------------------------------------------------------------------------------------------

-- Preview freshness (20260826160000): a tray move still counts as an edit of the binder.
create or replace function public.touch_binder_from_slot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.binders b
     set updated_at = now()
   where b.id in (
     select p.binder_id from public.binder_pages p where p.id = coalesce(new.page_id, old.page_id)
     union
     select coalesce(new.binder_id, old.binder_id)
   );
  return coalesce(new, old);
end;
$$;

-- Contest lock (20260903190000): a locked finalist's tray is locked too.
create or replace function public.contest_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    record;
  v_json   jsonb;
  v_binder uuid;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if (select auth.uid()) is null then
    return v_row;
  end if;

  if not exists (select 1 from public.contest_finalists where locked) then
    return v_row;
  end if;

  v_json := to_jsonb(v_row);
  if tg_table_name = 'binders' then
    v_binder := (v_json ->> 'id')::uuid;
  elsif tg_table_name = 'binder_pages' then
    v_binder := (v_json ->> 'binder_id')::uuid;
  elsif tg_table_name = 'binder_slots' then
    -- A tray row names its binder directly; a page row goes through its page.
    v_binder := (v_json ->> 'binder_id')::uuid;
    if v_binder is null then
      select pg.binder_id into v_binder
      from public.binder_pages pg
      where pg.id = (v_json ->> 'page_id')::uuid;
    end if;
  end if;

  if v_binder is null then
    return v_row;
  end if;

  if exists (
    select 1 from public.contest_finalists f
    where f.binder_id = v_binder and f.locked
  ) then
    raise exception 'This binder is a locked contest finalist and cannot be edited.'
      using errcode = '42501';
  end if;

  return v_row;
end;
$$;

-- Over-placement demotion (20260831150000): a tray card still holds the copy it claims, so it is
-- counted as placed and can be demoted like any other pocket.
create or replace function public.demote_unowned_placements(p_user_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  n integer;
  total integer := 0;
begin
  if p_user_id is null then return 0; end if;
  for r in
    select s.card_id, count(*)::int as placed,
           coalesce((select sum(uc.quantity)::int from public.user_cards uc
                      where uc.owner_id = p_user_id and uc.card_id = s.card_id), 0)
           + coalesce((select sum(pe.quantity)::int
                         from public.portfolio_entries pe
                         join public.collections c
                           on c.user_id = pe.user_id and c.id = pe.collection_id
                        where pe.user_id = p_user_id and pe.card_id = s.card_id
                          and c.archived_at is not null), 0) as owned
      from public.binder_slots s
      left join public.binder_pages p on p.id = s.page_id
      join public.binders b on b.id = coalesce(p.binder_id, s.binder_id)
     where b.owner_id = p_user_id and s.from_collection and s.card_id is not null
     group by s.card_id
  loop
    if r.placed > r.owned then
      update public.binder_slots
         set from_collection = false, source_entry_id = null, updated_at = now()
       where id in (
         select s2.id
           from public.binder_slots s2
           left join public.binder_pages p2 on p2.id = s2.page_id
           join public.binders b2 on b2.id = coalesce(p2.binder_id, s2.binder_id)
          where b2.owner_id = p_user_id and s2.card_id = r.card_id and s2.from_collection
          order by (s2.source_entry_id is not null
                    and exists (select 1 from public.portfolio_entries pe
                                 where pe.user_id = b2.owner_id
                                   and pe.id = s2.source_entry_id)) asc,
                   s2.created_at desc, s2.id desc
          limit (r.placed - r.owned)
       );
      get diagnostics n = row_count;
      total := total + n;
    end if;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- reseat_slots (20261021120000) moves pockets to and from the tray in the same transaction as
-- the rest of an Arrange. A move names EITHER page_id (with its cell) OR binder_id (with its
-- tray position in col_index); the check constraint refuses a move that names both or neither.
-- ---------------------------------------------------------------------------------------------

create or replace function public.reseat_slots(p_moves jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_wanted integer;
  v_moved integer;
begin
  select count(*) into v_wanted from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb));
  if v_wanted = 0 then
    return 0;
  end if;

  update public.binder_slots s
     set page_id = m.page_id, binder_id = m.binder_id, row_index = m.row_index, col_index = m.col_index
    from jsonb_to_recordset(p_moves) as m(id uuid, page_id uuid, binder_id uuid, row_index integer, col_index integer)
   where s.id = m.id;

  get diagnostics v_moved = row_count;
  if v_moved <> v_wanted then
    raise exception 'reseat: % of % pockets are not on the server', v_wanted - v_moved, v_wanted
      using errcode = 'P0002';
  end if;
  return v_moved;
end;
$$;

comment on function public.reseat_slots(jsonb) is
  'Arrange and the tray: move many pockets in one transaction. p_moves = [{id, page_id, row_index, col_index}] for a cell, or [{id, binder_id, row_index: 0, col_index: <tray position>}] for the tray. Raises if any pocket is not updatable.';

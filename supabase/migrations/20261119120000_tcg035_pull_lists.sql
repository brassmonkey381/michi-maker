-- TCG-035 PULL LISTS: a bulk "Move to binder" that waits for the person to find each card.
--
-- Brian's design (2026-11-19): pick cards for a binder (Michi "Pull these cards" on a binder built
-- from the collection, or a BiBo multi-select "Move to binder"), BiBo lists every chosen copy with
-- its exact spot in walking order, he finds and checks each one, and the collection moves ONLY when
-- he commits. Partial commits are allowed: checked copies move, unchecked ones stay on the list.
-- One undo reverses one commit.
--
-- OWNED BY BiBo (tcgscan-app), stored here because every table in the shared user-data project is
-- migrated from michi-maker (AGENTS.md rule 4). Michi writes lists and reads their status; BiBo
-- owns the checklist, the commit and the undo.
--
-- WHY THE MOVE IS AN RPC. BiBo is local-first and syncs by updated_at, but "one step" here spans
-- portfolio_entries (the copies and every card behind them in each source stack) AND binder_slots
-- (Michi's pockets now point at the exact copies). Only a server transaction makes those land
-- together or not at all. Every row written gets updated_at = greatest(now(), previous + 1 ms), so
-- each device's last-write-wins merge takes the server's version on its next pull.
--
-- STACK ORDER IS PHYSICAL (tcgscan-app src/lib/stack-ops.ts). A copy pulled from a stack leaves a
-- gap that the cards behind it close: the pile is renumbered 1..n in the order the app displays it
-- (storage_pos, then scanned_at with null first, then id), which can only remove gaps, never
-- reorder. Binders keep every pocket address when a card leaves (same rule as the app), so only
-- 'stack' and 'other' units are renumbered.
--
-- A LOT IS NOT A COPY. portfolio_entries rows carry quantity. Pulling one card out of a lot of
-- three splits it: a new row (id gen_random_uuid()::text, every field copied, quantity 1) moves and
-- the original keeps two. The item records the moved row in moved_entry_id, and the Michi pocket
-- is stamped with it.
--
-- UNDO restores the snapshot of every row the commit wrote, but only where that row has not been
-- edited since (its updated_at is still the stamp the commit wrote). A row changed in between is
-- reported as a conflict and left alone, so an undo can never overwrite later work.

-- ── A Michi binder as a BiBo storage unit ─────────────────────────────────────────────────────
alter table public.storage_units add column if not exists michi_binder_id uuid;
comment on column public.storage_units.michi_binder_id is
  'TCG-035: the michi binders.id this BiBo binder unit stands for. Soft pointer (no FK), same doctrine '
  'as binder_slots.source_entry_id. Set by commit_pull_list when it creates the unit on first commit.';
create index if not exists storage_units_michi_binder_idx
  on public.storage_units (user_id, michi_binder_id) where michi_binder_id is not null;

-- ── Lists ─────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.pull_lists (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection_id    text not null,
  michi_binder_id  uuid,
  target_unit_id   text,
  source           text not null default 'bibo' check (source in ('michi', 'bibo')),
  status           text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (michi_binder_id is not null or target_unit_id is not null)
);
create index if not exists pull_lists_user_idx on public.pull_lists (user_id, status);

create table if not exists public.pull_list_items (
  id              uuid primary key default gen_random_uuid(),
  list_id         uuid not null references public.pull_lists (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id        text not null,
  card_id         text not null,
  michi_slot_id   uuid,
  target_page     integer,
  target_pos      integer,
  target_rows     integer,
  target_cols     integer,
  checked_at      timestamptz,
  moved_at        timestamptz,
  moved_entry_id  text,
  commit_id       uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pull_list_items_list_idx on public.pull_list_items (list_id);

create table if not exists public.pull_list_commits (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.pull_lists (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  stamp       timestamptz not null default now(),
  snapshot    jsonb not null default '[]'::jsonb,
  undone_at   timestamptz
);
create index if not exists pull_list_commits_list_idx on public.pull_list_commits (list_id);

alter table public.pull_lists enable row level security;
alter table public.pull_list_items enable row level security;
alter table public.pull_list_commits enable row level security;

drop policy if exists "own pull_lists" on public.pull_lists;
create policy "own pull_lists" on public.pull_lists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own pull_list_items" on public.pull_list_items;
create policy "own pull_list_items" on public.pull_list_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Commits are written only by the RPCs (security definer); the owner may read them.
drop policy if exists "read own pull_list_commits" on public.pull_list_commits;
create policy "read own pull_list_commits" on public.pull_list_commits for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Commit ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.commit_pull_list(p_list_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_list     public.pull_lists;
  v_unit     text;
  v_now      timestamptz := clock_timestamp();
  v_commit   uuid := gen_random_uuid();
  v_snap     jsonb := '[]'::jsonb;
  v_item     public.pull_list_items;
  v_entry    public.portfolio_entries;
  v_src      public.storage_units;
  v_moving   text;
  v_stamp    timestamptz;
  v_sources  text[] := '{}';
  v_moved    integer := 0;
  v_skipped  jsonb := '[]'::jsonb;
  v_rows     integer;
  v_cols     integer;
  v_title    text;
  v_r        record;
  v_s        text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_list from public.pull_lists where id = p_list_id and user_id = v_uid for update;
  if not found then raise exception 'pull list not found'; end if;
  if v_list.status <> 'open' then raise exception 'pull list is %', v_list.status; end if;

  -- THE TARGET UNIT. A BiBo list names one; a Michi list names a michi binder, whose BiBo unit is
  -- found by michi_binder_id or created here on the first commit (grid from its first page).
  v_unit := v_list.target_unit_id;
  if v_unit is null then
    select id into v_unit from public.storage_units
      where user_id = v_uid and michi_binder_id = v_list.michi_binder_id and collection_id = v_list.collection_id
      order by created_at limit 1;
    if v_unit is null then
      select b.title into v_title from public.binders b where b.id = v_list.michi_binder_id and b.owner_id = v_uid;
      if not found then raise exception 'michi binder not found'; end if;
      select p.rows, p.cols into v_rows, v_cols from public.binder_pages p
        where p.binder_id = v_list.michi_binder_id order by p.position limit 1;
      v_unit := gen_random_uuid()::text;
      insert into public.storage_units (id, user_id, collection_id, name, kind, grid_rows, grid_cols, michi_binder_id, created_at, updated_at)
        values (v_unit, v_uid, v_list.collection_id, coalesce(v_title, 'Binder'), 'binder', v_rows, v_cols, v_list.michi_binder_id, v_now, v_now);
      v_snap := v_snap || jsonb_build_array(jsonb_build_object('t', 'unit_created', 'id', v_unit, 'stamp', v_now));
    end if;
    update public.pull_lists set target_unit_id = v_unit, updated_at = v_now where id = p_list_id;
  else
    perform 1 from public.storage_units where user_id = v_uid and id = v_unit and kind = 'binder';
    if not found then raise exception 'target binder not found'; end if;
  end if;

  for v_item in
    select * from public.pull_list_items
      where list_id = p_list_id and user_id = v_uid and checked_at is not null and moved_at is null
      order by created_at, id
      for update
  loop
    select * into v_entry from public.portfolio_entries
      where id = v_item.entry_id and user_id = v_uid for update;
    if not found or v_entry.item_kind = 'sealed' then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('item', v_item.id, 'reason', case when found then 'sealed' else 'gone' end));
      continue;
    end if;

    -- The pile it leaves, if it is one. Remembered once; renumbered after every move has landed.
    select * into v_src from public.storage_units where user_id = v_uid and id = v_entry.storage_id;
    if found and v_src.kind in ('stack', 'other') and not (v_src.id = any (v_sources)) then
      v_sources := v_sources || v_src.id;
    end if;

    if v_entry.quantity > 1 then
      -- SPLIT: one copy leaves the lot as its own row. Its own block, so the card-cap trigger
      -- (enforce_card_cap fires on the insert) can refuse this one item without failing the rest:
      -- an account already over its cap gets the item skipped with reason 'cap'.
      v_moving := gen_random_uuid()::text;
      begin
        update public.portfolio_entries set quantity = quantity - 1,
          updated_at = greatest(v_now, v_entry.updated_at + interval '1 millisecond')
          where id = v_entry.id returning updated_at into v_stamp;
        insert into public.portfolio_entries
          select (jsonb_populate_record(null::public.portfolio_entries,
                   to_jsonb(v_entry) || jsonb_build_object('id', v_moving, 'quantity', 1, 'added_at', v_now, 'updated_at', v_now))).*;
      exception when sqlstate 'P0001' then
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('item', v_item.id, 'reason', 'cap'));
        continue;
      end;
      v_snap := v_snap || jsonb_build_array(
        jsonb_build_object('t', 'entry', 'id', v_entry.id, 'prev', to_jsonb(v_entry)),
        jsonb_build_object('t', 'stamp', 'id', v_entry.id, 'stamp', v_stamp),
        jsonb_build_object('t', 'entry_created', 'id', v_moving, 'from', v_entry.id, 'stamp', v_now));
      v_stamp := v_now;
    else
      v_moving := v_entry.id;
      v_snap := v_snap || jsonb_build_array(jsonb_build_object('t', 'entry', 'id', v_entry.id, 'prev', to_jsonb(v_entry)));
      v_stamp := greatest(v_now, v_entry.updated_at + interval '1 millisecond');
    end if;

    update public.portfolio_entries set
      collection_id = v_list.collection_id,
      storage_id    = v_unit,
      storage_page  = v_item.target_page,
      storage_pos   = case when v_item.target_page is null then null else v_item.target_pos end,
      storage_rows  = case when v_item.target_page is null then null else v_item.target_rows end,
      storage_cols  = case when v_item.target_page is null then null else v_item.target_cols end,
      updated_at    = v_stamp
    where id = v_moving returning updated_at into v_stamp;
    v_snap := v_snap || jsonb_build_array(jsonb_build_object('t', 'stamp', 'id', v_moving, 'stamp', v_stamp));

    -- THE MICHI POCKET now names this exact copy.
    if v_item.michi_slot_id is not null then
      for v_r in
        select s.* from public.binder_slots s
          join public.binder_pages p on p.id = s.page_id
          join public.binders b on b.id = p.binder_id
          where s.id = v_item.michi_slot_id and b.owner_id = v_uid
          for update of s
      loop
        -- binder_slots has a set_updated_at trigger, so the stamp is whatever it wrote: read it back.
        update public.binder_slots set source_entry_id = v_moving, from_collection = true,
          updated_at = greatest(v_now, v_r.updated_at + interval '1 millisecond')
          where id = v_r.id returning updated_at into v_stamp;
        v_snap := v_snap || jsonb_build_array(jsonb_build_object('t', 'slot', 'id', v_r.id,
          'source_entry_id', v_r.source_entry_id, 'from_collection', v_r.from_collection, 'stamp', v_stamp));
      end loop;
    end if;

    update public.pull_list_items set moved_at = v_now, moved_entry_id = v_moving, commit_id = v_commit, updated_at = v_now
      where id = v_item.id;
    v_moved := v_moved + 1;
  end loop;

  -- CLOSE EVERY SOURCE PILE: renumber 1..n in display order, writing only what changes.
  foreach v_s in array v_sources loop
    for v_r in
      select e.id, e.storage_pos, e.updated_at, n.want from public.portfolio_entries e
        join (
          select id, row_number() over (
            order by storage_pos, coalesce(scanned_at, 'epoch'::timestamptz), id collate "C") as want
          from public.portfolio_entries
          where user_id = v_uid and storage_id = v_s and storage_pos is not null
        ) n on n.id = e.id
      where e.storage_pos is distinct from n.want
    loop
      update public.portfolio_entries set storage_pos = v_r.want,
        updated_at = greatest(v_now, v_r.updated_at + interval '1 millisecond')
        where id = v_r.id returning updated_at into v_stamp;
      v_snap := v_snap || jsonb_build_array(jsonb_build_object('t', 'pos', 'id', v_r.id, 'storage_pos', v_r.storage_pos, 'stamp', v_stamp));
    end loop;
  end loop;

  if v_moved > 0 then
    insert into public.pull_list_commits (id, list_id, user_id, stamp, snapshot) values (v_commit, p_list_id, v_uid, v_now, v_snap);
  end if;
  if not exists (select 1 from public.pull_list_items where list_id = p_list_id and moved_at is null) then
    update public.pull_lists set status = 'done', updated_at = v_now where id = p_list_id;
  end if;

  return jsonb_build_object('commit_id', case when v_moved > 0 then v_commit end, 'moved', v_moved,
    'skipped', v_skipped, 'target_unit_id', v_unit);
end;
$$;

-- ── Undo ──────────────────────────────────────────────────────────────────────────────────────
create or replace function public.undo_pull_list(p_commit_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_commit    public.pull_list_commits;
  v_now       timestamptz := clock_timestamp();
  v_x         jsonb;
  v_stamps    jsonb := '{}'::jsonb;
  v_prev      public.portfolio_entries;
  v_cur       timestamptz;
  v_restored  integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_ok        boolean;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_commit from public.pull_list_commits where id = p_commit_id and user_id = v_uid for update;
  if not found then raise exception 'commit not found'; end if;
  if v_commit.undone_at is not null then raise exception 'already undone'; end if;

  -- The LAST stamp the commit wrote on each row is what "untouched since" means.
  for v_x in select * from jsonb_array_elements(v_commit.snapshot) loop
    if v_x->>'t' in ('stamp', 'pos', 'slot', 'entry_created', 'unit_created') then
      v_stamps := v_stamps || jsonb_build_object((v_x->>'t' = 'slot')::text || ':' || (v_x->>'id'), v_x->'stamp');
    end if;
  end loop;

  -- Newest first, so stack positions go back before the moved card returns into the gap.
  for v_x in select value from jsonb_array_elements(v_commit.snapshot) with ordinality as a(value, n) order by n desc loop
    if v_x->>'t' = 'pos' then
      select updated_at into v_cur from public.portfolio_entries where id = v_x->>'id' and user_id = v_uid for update;
      if found and v_cur = (v_stamps->>('false:' || (v_x->>'id')))::timestamptz then
        update public.portfolio_entries set storage_pos = (v_x->>'storage_pos')::integer,
          updated_at = greatest(v_now, v_cur + interval '1 millisecond') where id = v_x->>'id';
        v_stamps := v_stamps || jsonb_build_object('false:' || (v_x->>'id'), to_jsonb(greatest(v_now, v_cur + interval '1 millisecond')));
        v_restored := v_restored + 1;
      elsif found then
        v_conflicts := v_conflicts || jsonb_build_array(v_x->>'id');
      end if;
    elsif v_x->>'t' = 'slot' then
      select updated_at into v_cur from public.binder_slots where id = (v_x->>'id')::uuid for update;
      if found and v_cur = (v_stamps->>('true:' || (v_x->>'id')))::timestamptz then
        update public.binder_slots set source_entry_id = v_x->>'source_entry_id',
          from_collection = (v_x->>'from_collection')::boolean,
          updated_at = greatest(v_now, v_cur + interval '1 millisecond') where id = (v_x->>'id')::uuid;
        v_restored := v_restored + 1;
      elsif found then
        v_conflicts := v_conflicts || jsonb_build_array(v_x->>'id');
      end if;
    elsif v_x->>'t' = 'entry_created' then
      select updated_at into v_cur from public.portfolio_entries where id = v_x->>'id' and user_id = v_uid for update;
      if found and v_cur = (v_stamps->>('false:' || (v_x->>'id')))::timestamptz then
        delete from public.portfolio_entries where id = v_x->>'id';
        v_restored := v_restored + 1;
      elsif found then
        v_conflicts := v_conflicts || jsonb_build_array(v_x->>'id');
      end if;
    elsif v_x->>'t' = 'entry' then
      v_prev := jsonb_populate_record(null::public.portfolio_entries, v_x->'prev');
      select updated_at into v_cur from public.portfolio_entries where id = v_prev.id and user_id = v_uid for update;
      v_ok := found and v_cur = (v_stamps->>('false:' || v_prev.id))::timestamptz;
      if v_ok then
        update public.portfolio_entries set
          collection_id = v_prev.collection_id, quantity = v_prev.quantity,
          storage_id = v_prev.storage_id, storage_page = v_prev.storage_page, storage_pos = v_prev.storage_pos,
          storage_rows = v_prev.storage_rows, storage_cols = v_prev.storage_cols,
          updated_at = greatest(v_now, v_cur + interval '1 millisecond')
        where id = v_prev.id;
        v_restored := v_restored + 1;
      elsif found then
        v_conflicts := v_conflicts || jsonb_build_array(v_prev.id);
      end if;
    elsif v_x->>'t' = 'unit_created' then
      -- A unit this commit made goes again only if nothing is in it now.
      if not exists (select 1 from public.portfolio_entries where user_id = v_uid and storage_id = v_x->>'id') then
        delete from public.storage_units where user_id = v_uid and id = v_x->>'id'
          and updated_at = (v_x->>'stamp')::timestamptz;
        if found then
          update public.pull_lists set target_unit_id = null, updated_at = v_now
            where id = v_commit.list_id and michi_binder_id is not null;
        end if;
      end if;
    end if;
  end loop;

  update public.pull_list_items set moved_at = null, moved_entry_id = null, commit_id = null, updated_at = v_now
    where commit_id = p_commit_id;
  update public.pull_lists set status = 'open', updated_at = v_now where id = v_commit.list_id;
  update public.pull_list_commits set undone_at = v_now where id = p_commit_id;
  return jsonb_build_object('restored', v_restored, 'conflicts', v_conflicts);
end;
$$;

revoke all on function public.commit_pull_list(uuid) from public, anon;
revoke all on function public.undo_pull_list(uuid) from public, anon;
grant execute on function public.commit_pull_list(uuid) to authenticated;
grant execute on function public.undo_pull_list(uuid) to authenticated;

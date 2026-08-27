-- tcgscan-app: STORAGE UNITS, the layer between a collection and its cards.
--
-- A collection describes ownership; it says nothing about where the cards physically are. Users
-- keep riffle-scanned cards in a stack (a shoebox, a deck box) and binder-scanned pages in a
-- binder, and want the app organized the way the shelf is. So a collection now contains storage
-- units (kind: binder | stack | other) and a portfolio entry can claim a place in one:
--
--   stack:  storage_pos is the LIFO ordinal from the BOTTOM of the pile (1 = first card scanned,
--           i.e. the one the scanner dropped first and everything else landed on). Appending a
--           session continues from the current max, so the last card scanned is the top of the
--           pile, which is how the pile actually looks. storage_page stays null.
--   binder: storage_page is the 1-based page number in the physical binder; sessions append
--           incrementally (a binder holding 4 pages + a 2-page session = pages 5 and 6).
--           storage_pos is the slot within the page (0-based, row-major, as the scanner reads).
--
-- These are tcgscan-app's PRIVATE sync tables (see 20260714120000): michi-maker never reads them.
--
-- THE SHAPE FOLLOWS THE SYNC MODEL, and three "missing" things are missing on purpose:
--
--   NO set_updated_at TRIGGER. The client sends updated_at and the offline-first merge resolves
--   conflicts by that value (last-write-wins). A DB trigger would overwrite it and corrupt the
--   merge, same rule as collections/portfolio_entries.
--
--   NO UNIQUE (storage_id, storage_page, storage_pos). Two devices appending to the same stack
--   offline will mint colliding positions, and the sync push is a single batch upsert: one
--   conflicting row would 400 the whole batch and poison the queue (the exact failure mode the
--   purchase_date '' bug had). Collisions are tolerated in the data and resolved at display time
--   (ties sort by scanned_at, then id).
--
--   NO FK from portfolio_entries.storage_id to storage_units. Push order inside one delta is not
--   guaranteed to land units before the entries that reference them, and a hard FK would turn
--   that race into a poisoned batch. The reference is soft; the client clears dangling ids at
--   merge time, and a unit deleted with its collection takes its entries down via the entries'
--   own collection FK anyway.
--
-- The FK that DOES exist, storage_units -> collections ON DELETE CASCADE, is load-bearing for
-- a writer that is not tcgscan: michi-maker hard-deletes tcgscan collections server-side
-- (collectionRepo.deletePortfolio, csvImport rollback) and relies on cascade for children.
-- Composite (user_id, collection_id), matching portfolio_entries_collection_fkey.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table if not exists public.storage_units (
  id            text not null,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection_id text not null,
  name          text not null,
  kind          text not null check (kind in ('binder', 'stack', 'other')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, collection_id)
    references public.collections (user_id, id) on delete cascade
);

-- No standalone user_id index: the PK (user_id, id) and the collection index below both lead
-- with user_id, so a third index on the same prefix would be pure write cost.
create index if not exists storage_units_collection_idx
  on public.storage_units (user_id, collection_id);

-- ---------------------------------------------------------------------------
-- 2. Where an entry sits
-- ---------------------------------------------------------------------------
-- All four nullable, and that is a contract, not laziness: michi-maker's CSV import inserts
-- portfolio_entries with an explicit column list and no knowledge of storage; a NOT NULL here
-- would break it. Null storage_id = "loose in the collection", the state every existing row is in.
alter table public.portfolio_entries add column if not exists storage_id   text;
alter table public.portfolio_entries add column if not exists storage_page integer;
alter table public.portfolio_entries add column if not exists storage_pos  integer;
-- When the SCANNER saw this card, as distinct from added_at (when the reviewed session was
-- submitted) and purchase_date (when the human acquired it). Sortable search key; never shown as
-- a cost-basis date, and the value chart must keep reading added_at/purchase_date.
alter table public.portfolio_entries add column if not exists scanned_at   timestamptz;

comment on column public.portfolio_entries.storage_id is
  'Soft reference to storage_units.id (same user). No FK on purpose: sync pushes one batch and '
  'must not be poisoned by ordering. Null = loose in the collection.';
comment on column public.portfolio_entries.storage_pos is
  'Stack: LIFO ordinal from the bottom of the pile (1 = first scanned). Binder: slot within the '
  'page, 0-based row-major. Collisions from concurrent devices are legal; display sorts ties.';
comment on column public.portfolio_entries.storage_page is
  'Binder page number, 1-based, appended incrementally across sessions. Null for stacks.';

create index if not exists portfolio_entries_storage_idx
  on public.portfolio_entries (user_id, storage_id)
  where storage_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS + grants, owner-only, exactly as the sibling tables
-- ---------------------------------------------------------------------------
alter table public.storage_units enable row level security;

drop policy if exists "own storage_units" on public.storage_units;
create policy "own storage_units" on public.storage_units for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.storage_units to authenticated;
grant all on public.storage_units to service_role;

-- ---------------------------------------------------------------------------
-- 4. Realtime, the sync engine listens for other-device changes
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'storage_units'
  ) then
    alter publication supabase_realtime add table public.storage_units;
  end if;
end $$;

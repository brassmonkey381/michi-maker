-- tcgscan-app's own user-data tables, relocated into the michi-maker project so the two
-- apps share ONE identity (auth.uid()). tcgscan-app signs users in against THIS project and
-- syncs its collections/portfolio here. These are tcgscan-app's PRIVATE tables — michi-maker
-- never reads them. The only cross-app interchange is the separate public.user_cards summary
-- that tcgscan feeds (see 20260714120100_increment_user_card.sql + docs/TCGSCAN-PORTFOLIO.md).
--
-- Faithful copy of the schema from the retired standalone project (ref thirerjgjfequwiyonph,
-- 0 rows) with ONE deliberate fix: id / collection_id are TEXT, not uuid. The client mints
-- its own ids ("col-…", "lot-…"; see tcgscan-app src/lib/portfolio.ts uid()), so uuid columns
-- would reject every sync push — a latent bug that never surfaced because live sync was never
-- run against the old project.
--
-- NO set_updated_at trigger on these tables, on purpose: the client sends updated_at itself
-- and the offline-first sync merge resolves conflicts by that value (last-write-wins). A DB
-- trigger would overwrite it and corrupt the merge. (public.user_cards keeps ITS trigger — it
-- is server-maintained, not last-write-wins synced.)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.saved_cards (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id    text not null,
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table public.collections (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  is_active  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index collections_user_id_idx on public.collections (user_id);

create table public.portfolio_entries (
  id             text primary key,
  collection_id  text not null references public.collections (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id        text not null,
  variant        text not null,
  condition      text not null,
  quantity       integer not null default 1,
  purchase_price numeric,
  purchase_date  date,
  added_at       timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index portfolio_entries_user_id_idx on public.portfolio_entries (user_id);
create index portfolio_entries_collection_id_idx on public.portfolio_entries (collection_id);

-- ---------------------------------------------------------------------------
-- Row level security — owner-only in every direction (one ALL policy per table,
-- matching the retired project). `to authenticated`; USING + WITH CHECK so a row's
-- owner can never be reassigned.
-- ---------------------------------------------------------------------------

alter table public.saved_cards       enable row level security;
alter table public.collections       enable row level security;
alter table public.portfolio_entries enable row level security;

create policy "own saved_cards" on public.saved_cards for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own collections" on public.collections for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own portfolio_entries" on public.portfolio_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants (Data API). RLS still governs which rows are visible.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete
  on public.saved_cards, public.collections, public.portfolio_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the app subscribes to postgres_changes on all three to drive a
-- debounced reconcile (same pull+merge path as sign-in).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.saved_cards, public.collections, public.portfolio_entries;

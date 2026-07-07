-- tcgscan-michi-maker — initial schema (user-data layer only)
--
-- This project holds ONLY the app's own user data. All card/catalog reference data
-- (pokemon, illustrators, sets, cards, images, prices, embeddings) lives in the shared
-- tcgscan-data project and is consumed read-only over HTTP — it is deliberately NOT
-- resurrected here (see docs/DATA-SERVER.md). Binder slots reference a card by its source
-- id as plain text (no FK), so binders can be saved independently of catalogue completeness.
--
-- RLS conventions (Supabase guidance): RLS on every public table; write policies scoped
-- `to authenticated` with an ownership predicate; UPDATE policies declare both USING and
-- WITH CHECK so a row's owner cannot be reassigned.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- The named "Michi Method" page layouts (see docs/DATA-MODEL.md).
create type public.michi_layout_style as enum (
  'anchor',            -- one or two hero cards surrounded by complementary cards
  'single_pokemon',    -- one species across many art styles
  'themed_story',      -- a narrative spread (e.g. an Eevee evolution line)
  'artist',            -- a page of one illustrator's work
  'trainer',           -- built around a specific trainer character
  'full_page_spread',  -- large artwork spanning the page with cards as accents
  'color_theme',       -- a unified colour palette
  'freeform'           -- no specific style
);

-- What occupies a single position on a binder page.
create type public.binder_slot_type as enum (
  'card',     -- a real card from the reference catalogue (tcgscan-data)
  'insert',   -- a custom insert printed on cardstock
  'artwork',  -- artwork spanning one or more pockets
  'empty'     -- intentional negative space
);

create type public.card_orientation as enum ('portrait', 'landscape');

-- ---------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.binders (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null,
  description   text,
  layout_style  public.michi_layout_style not null default 'freeform',
  -- Card source id from the tcgscan-data catalogue (plain text, no FK — see header).
  cover_card_id text,
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index binders_owner_id_idx on public.binders (owner_id);
create index binders_is_public_idx on public.binders (is_public) where is_public;

-- A binder is a sequence of pages; each page is a grid "canvas".
create table public.binder_pages (
  id               uuid primary key default gen_random_uuid(),
  binder_id        uuid not null references public.binders(id) on delete cascade,
  position         integer not null default 0,
  title            text,
  rows             integer not null default 3 check (rows between 1 and 6),
  cols             integer not null default 3 check (cols between 1 and 6),
  background_color text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (binder_id, position)
);

create index binder_pages_binder_id_idx on public.binder_pages (binder_id);

-- A placement on a page. A slot may span multiple pockets (row_span / col_span)
-- to support spanning artwork and multi-slot panels.
create table public.binder_slots (
  id               uuid primary key default gen_random_uuid(),
  page_id          uuid not null references public.binder_pages(id) on delete cascade,
  row_index        integer not null check (row_index >= 0),
  col_index        integer not null check (col_index >= 0),
  row_span         integer not null default 1 check (row_span >= 1),
  col_span         integer not null default 1 check (col_span >= 1),
  slot_type        public.binder_slot_type not null default 'card',
  -- Card source id from the tcgscan-data catalogue (plain text, no FK — see header).
  card_id          text,
  insert_image_url text,
  orientation      public.card_orientation not null default 'portrait',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (page_id, row_index, col_index)
);

create index binder_slots_page_id_idx on public.binder_slots (page_id);
create index binder_slots_card_id_idx on public.binder_slots (card_id);

-- ---------------------------------------------------------------------------
-- Functions & triggers
-- ---------------------------------------------------------------------------

-- Keep updated_at current on row updates.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger binders_set_updated_at
  before update on public.binders
  for each row execute function public.set_updated_at();

create trigger binder_pages_set_updated_at
  before update on public.binder_pages
  for each row execute function public.set_updated_at();

create trigger binder_slots_set_updated_at
  before update on public.binder_slots
  for each row execute function public.set_updated_at();

-- Create a profile row automatically when a new auth user signs up (including anonymous
-- users). Display fields are prefilled from user metadata for convenience only — metadata
-- is user-editable and is never used for authorization.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- This SECURITY DEFINER function is only meaningful from its trigger; do not expose it.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.binders       enable row level security;
alter table public.binder_pages  enable row level security;
alter table public.binder_slots  enable row level security;

-- Profiles: public read, owner-only write.
create policy "Profiles are viewable by everyone"
  on public.profiles for select to anon, authenticated using (true);
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Binders: owners have full access; anyone may read binders flagged public.
create policy "Owners can view their binders"
  on public.binders for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Public binders are viewable by everyone"
  on public.binders for select to anon, authenticated
  using (is_public);
create policy "Users can create their own binders"
  on public.binders for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "Owners can update their binders"
  on public.binders for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Owners can delete their binders"
  on public.binders for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Pages inherit access from their parent binder.
create policy "Pages of owned binders are viewable"
  on public.binder_pages for select to authenticated
  using (exists (
    select 1 from public.binders b
    where b.id = binder_pages.binder_id and b.owner_id = (select auth.uid())
  ));
create policy "Pages of public binders are viewable"
  on public.binder_pages for select to anon, authenticated
  using (exists (
    select 1 from public.binders b
    where b.id = binder_pages.binder_id and b.is_public
  ));
create policy "Owners can insert pages"
  on public.binder_pages for insert to authenticated
  with check (exists (
    select 1 from public.binders b
    where b.id = binder_pages.binder_id and b.owner_id = (select auth.uid())
  ));
create policy "Owners can update pages"
  on public.binder_pages for update to authenticated
  using (exists (
    select 1 from public.binders b
    where b.id = binder_pages.binder_id and b.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.binders b
    where b.id = binder_pages.binder_id and b.owner_id = (select auth.uid())
  ));
create policy "Owners can delete pages"
  on public.binder_pages for delete to authenticated
  using (exists (
    select 1 from public.binders b
    where b.id = binder_pages.binder_id and b.owner_id = (select auth.uid())
  ));

-- Slots inherit access from their page's binder.
create policy "Slots of owned binders are viewable"
  on public.binder_slots for select to authenticated
  using (exists (
    select 1 from public.binder_pages p
    join public.binders b on b.id = p.binder_id
    where p.id = binder_slots.page_id and b.owner_id = (select auth.uid())
  ));
create policy "Slots of public binders are viewable"
  on public.binder_slots for select to anon, authenticated
  using (exists (
    select 1 from public.binder_pages p
    join public.binders b on b.id = p.binder_id
    where p.id = binder_slots.page_id and b.is_public
  ));
create policy "Owners can insert slots"
  on public.binder_slots for insert to authenticated
  with check (exists (
    select 1 from public.binder_pages p
    join public.binders b on b.id = p.binder_id
    where p.id = binder_slots.page_id and b.owner_id = (select auth.uid())
  ));
create policy "Owners can update slots"
  on public.binder_slots for update to authenticated
  using (exists (
    select 1 from public.binder_pages p
    join public.binders b on b.id = p.binder_id
    where p.id = binder_slots.page_id and b.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.binder_pages p
    join public.binders b on b.id = p.binder_id
    where p.id = binder_slots.page_id and b.owner_id = (select auth.uid())
  ));
create policy "Owners can delete slots"
  on public.binder_slots for delete to authenticated
  using (exists (
    select 1 from public.binder_pages p
    join public.binders b on b.id = p.binder_id
    where p.id = binder_slots.page_id and b.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Grants (Data API access). RLS still governs which rows are visible.
-- ---------------------------------------------------------------------------

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

grant select on public.binders, public.binder_pages, public.binder_slots to anon;
grant select, insert, update, delete
  on public.binders, public.binder_pages, public.binder_slots to authenticated;

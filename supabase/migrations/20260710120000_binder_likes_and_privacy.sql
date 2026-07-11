-- tcgscan-michi-maker — binder likes + multi-level privacy
--
-- Adds:
--   • profiles.is_public       — a private profile hides ALL of the owner's binders from
--                                everyone but the owner (public links stop resolving).
--   • binder_pages.is_public   — a page can be private even inside a public binder; public
--                                viewers never see it (RLS filters the page + its slots).
--   • binder_likes             — one row per (binder, user) with the time the like was made.
--
-- Featured binders are ranked by likes received in the last rolling 3 days (see
-- public.featured_binders), so the app no longer hard-codes a curated Featured set.
--
-- RLS conventions match the init migration: RLS on every table; writes `to authenticated`
-- with an ownership predicate; UPDATE policies declare both USING and WITH CHECK.

-- ---------------------------------------------------------------------------
-- Privacy columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_public boolean not null default true;

alter table public.binder_pages
  add column if not exists is_public boolean not null default true;

-- ---------------------------------------------------------------------------
-- Tighten the public-read policies: public visibility now also requires the
-- owner's profile to be public (and, for pages/slots, the page to be public).
-- Owners' own-row policies are unchanged, so a private profile never locks the
-- owner out of their own data.
-- ---------------------------------------------------------------------------

drop policy if exists "Public binders are viewable by everyone" on public.binders;
create policy "Public binders are viewable by everyone"
  on public.binders for select to anon, authenticated
  using (
    is_public
    and exists (
      select 1 from public.profiles p
      where p.id = binders.owner_id and coalesce(p.is_public, true)
    )
  );

drop policy if exists "Pages of public binders are viewable" on public.binder_pages;
create policy "Pages of public binders are viewable"
  on public.binder_pages for select to anon, authenticated
  using (
    binder_pages.is_public
    and exists (
      select 1 from public.binders b
      join public.profiles p on p.id = b.owner_id
      where b.id = binder_pages.binder_id and b.is_public and coalesce(p.is_public, true)
    )
  );

drop policy if exists "Slots of public binders are viewable" on public.binder_slots;
create policy "Slots of public binders are viewable"
  on public.binder_slots for select to anon, authenticated
  using (
    exists (
      select 1 from public.binder_pages pg
      join public.binders b on b.id = pg.binder_id
      join public.profiles p on p.id = b.owner_id
      where pg.id = binder_slots.page_id
        and pg.is_public and b.is_public and coalesce(p.is_public, true)
    )
  );

-- ---------------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------------

create table public.binder_likes (
  binder_id  uuid not null references public.binders(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (binder_id, user_id)
);

create index binder_likes_binder_id_idx on public.binder_likes (binder_id);
-- Featured ranking scans recent likes by time, so index created_at.
create index binder_likes_created_at_idx on public.binder_likes (created_at);

alter table public.binder_likes enable row level security;

-- Read: the binder's owner sees every like on it (to list who liked); any user may see their
-- OWN like row (to know whether they've liked). Public like *counts* go through the SECURITY
-- DEFINER functions below, so anonymous visitors never read individual like rows.
create policy "Owners can see likes on their binders"
  on public.binder_likes for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.binders b
      where b.id = binder_likes.binder_id and b.owner_id = (select auth.uid())
    )
  );

-- Like: only a real (non-anonymous) signed-in account may like, only as itself, and only a
-- PUBLIC binder that isn't their own. Anonymous guests must upgrade first.
create policy "Real accounts can like public binders"
  on public.binder_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.binders b
      join public.profiles p on p.id = b.owner_id
      where b.id = binder_likes.binder_id
        and b.is_public
        and coalesce(p.is_public, true)
        and b.owner_id <> (select auth.uid())
    )
  );

-- Unlike: remove your own like.
create policy "Users can remove their own like"
  on public.binder_likes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Aggregate functions (SECURITY DEFINER so anonymous visitors get counts /
-- rankings without reading individual like rows). Each re-checks visibility
-- explicitly because DEFINER bypasses RLS.
-- ---------------------------------------------------------------------------

-- Total likes for a single binder (only meaningful for a binder the caller can already see).
create or replace function public.binder_like_count(p_binder_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.binder_likes where binder_id = p_binder_id;
$$;

-- Top public binders by likes received in the last rolling 3 days. Excludes private profiles.
-- Returns the binder id, its 3-day like count, and the owner's display name (safe to show —
-- private profiles are already filtered out here).
create or replace function public.featured_binders(p_limit integer default 12)
returns table (binder_id uuid, like_count bigint, author_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.binder_id, count(*) as like_count, max(p.display_name) as author_name
  from public.binder_likes l
  join public.binders b on b.id = l.binder_id
  join public.profiles p on p.id = b.owner_id
  where l.created_at >= now() - interval '3 days'
    and b.is_public
    and coalesce(p.is_public, true)
  group by l.binder_id
  order by like_count desc, l.binder_id
  limit greatest(p_limit, 0);
$$;

-- ---------------------------------------------------------------------------
-- Grants (RLS still governs row visibility for the table itself).
-- ---------------------------------------------------------------------------

grant select on public.binder_likes to authenticated;
grant insert, delete on public.binder_likes to authenticated;

grant execute on function public.binder_like_count(uuid) to anon, authenticated;
grant execute on function public.featured_binders(integer) to anon, authenticated;

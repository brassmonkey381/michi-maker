-- tcgscan-michi-maker — profile upvotes + people search
--
-- Adds a way to find other collectors and upvote their profile:
--   • profile_upvotes — one row per (profile, voter), with the time it was cast.
--   • profile_upvote_count(id) — public count for a profile.
--   • search_profiles(query, limit) — public profiles matching a name/username query, ranked by
--     upvotes; private profiles and nameless (guest) profiles are excluded.
--
-- Mirrors the binder_likes RLS: upvotes are real-account-only, one per voter, never on yourself,
-- and only for a public profile. Owners can see who upvoted them; public counts go through the
-- SECURITY DEFINER functions so anonymous visitors never read individual rows.

create table public.profile_upvotes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  voter_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, voter_id)
);

create index profile_upvotes_profile_id_idx on public.profile_upvotes (profile_id);
create index profile_upvotes_created_at_idx on public.profile_upvotes (created_at);

alter table public.profile_upvotes enable row level security;

-- Read: the voter sees their own vote; the profile owner sees everyone who upvoted them.
create policy "See upvotes you made or received"
  on public.profile_upvotes for select to authenticated
  using (voter_id = (select auth.uid()) or profile_id = (select auth.uid()));

-- Upvote: real (non-anonymous) account only, as itself, never yourself, target profile public.
create policy "Real accounts can upvote public profiles"
  on public.profile_upvotes for insert to authenticated
  with check (
    voter_id = (select auth.uid())
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and profile_id <> (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = profile_upvotes.profile_id and coalesce(p.is_public, true)
    )
  );

-- Remove your own upvote.
create policy "Remove your own upvote"
  on public.profile_upvotes for delete to authenticated
  using (voter_id = (select auth.uid()));

-- Public upvote count for one profile.
create or replace function public.profile_upvote_count(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.profile_upvotes where profile_id = p_profile_id;
$$;

-- Search public profiles by display name / username, ranked by upvotes. An empty query returns the
-- top profiles. Excludes private profiles and profiles with no name (guests never surface).
create or replace function public.search_profiles(p_query text default '', p_limit integer default 30)
returns table (id uuid, display_name text, username text, avatar_url text, upvotes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.display_name, pr.username, pr.avatar_url,
         (select count(*) from public.profile_upvotes u where u.profile_id = pr.id) as upvotes
  from public.profiles pr
  where coalesce(pr.is_public, true)
    and (coalesce(pr.display_name, '') <> '' or coalesce(pr.username, '') <> '')
    and (
      coalesce(p_query, '') = ''
      or pr.display_name ilike '%' || p_query || '%'
      or pr.username ilike '%' || p_query || '%'
    )
  order by upvotes desc, lower(coalesce(nullif(pr.display_name, ''), pr.username)) asc
  limit greatest(p_limit, 0);
$$;

grant select on public.profile_upvotes to authenticated;
grant insert, delete on public.profile_upvotes to authenticated;

grant execute on function public.profile_upvote_count(uuid) to anon, authenticated;
grant execute on function public.search_profiles(text, integer) to anon, authenticated;

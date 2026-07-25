-- Discover page: search across ALL public binders by title, description, or the owner's @username.
--
-- Mirrors search_profiles / featured_binders: SECURITY DEFINER with a hard visibility gate (the
-- binder is public AND its owner's profile is public AND it isn't soft-archived or a seeded demo),
-- so nothing the RLS policies would hide can leak through the ranking. An EMPTY query returns the
-- most-liked public binders — the Discover page's default "popular" view. Ranked by all-time likes.
--
-- Returns the same shape as featured_binders (binder_id, like_count, author_name) so the client can
-- reuse the featured hydration path (load pages/slots via the public read, re-attach author + likes).
create or replace function public.search_binders(p_query text default '', p_limit integer default 40)
returns table (binder_id uuid, like_count bigint, author_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id as binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = b.id) as like_count,
         p.username as author_name
  from public.binders b
  join public.profiles p on p.id = b.owner_id
  where b.is_public
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
    and (
      coalesce(p_query, '') = ''
      or b.title ilike '%' || p_query || '%'
      or coalesce(b.description, '') ilike '%' || p_query || '%'
      or coalesce(p.username, '') ilike '%' || p_query || '%'
    )
  order by like_count desc, lower(coalesce(b.title, '')) asc, b.id
  limit greatest(p_limit, 0);
$$;

-- Guests browse public binders too (anon), same as featured/people search.
grant execute on function public.search_binders(text, integer) to anon, authenticated;

-- Discover search: a page title matches only when that page is visible to visitors (MIC-070).
--
-- 20261102120000_search_page_titles.sql added the page-title branch without checking the page's
-- own visibility, so a word from a PRIVATE page's title (or one held for image review) made its
-- public binder show up in Discover. The page itself never showed, but its title became
-- searchable. This redefines search_binders with that one branch gated on
-- pg.is_public and not pg.moderation_hold. Every other line is unchanged.
--
-- Applied with `supabase db query --linked -f`, not `db push` (the project is shared with the
-- tcgscan repos, whose migrations are not in this repo).

create or replace function public.search_binders(
  p_query       text default '',
  p_limit       integer default 40,
  p_after_likes bigint default null,
  p_after_at    timestamptz default null,
  p_after_id    uuid default null
)
returns table (
  binder_id      uuid,
  like_count     bigint,
  author_name    text,
  made_public_at timestamptz,
  page_count     integer,
  face_page_id   uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  -- FOUR BRANCHES, NOT ONE `or`. An `or` across tables cannot use an index on any of them; a
  -- union of single-table conditions can use all four.
  with hits as (
    select b.id from public.binders b
     where b.is_public and btrim(coalesce(p_query, '')) = ''
    union
    select b.id from public.binders b
     where b.is_public and btrim(coalesce(p_query, '')) <> ''
       and (b.title ilike public.like_pattern(p_query) or b.description ilike public.like_pattern(p_query))
    union
    select b.id from public.binders b
      join public.profiles p on p.id = b.owner_id
     where b.is_public and btrim(coalesce(p_query, '')) <> ''
       and p.username ilike public.like_pattern(p_query)
    union
    -- Page titles: the binder is the result, the page is why. Only a page a visitor can see may
    -- match (is_public and not under moderation hold, the same rule as the page read policy), or a
    -- private page's title would be searchable through its public binder (MIC-070). The binder's
    -- own visibility is settled below, the same as every other branch.
    select pg.binder_id from public.binder_pages pg
      join public.binders b on b.id = pg.binder_id
     where b.is_public and btrim(coalesce(p_query, '')) <> ''
       and pg.is_public and not pg.moderation_hold
       and pg.title ilike public.like_pattern(p_query)
  ),
  visible as (
    select b.id,
           coalesce(c.like_count, 0)::bigint as likes,
           p.username,
           coalesce(b.made_public_at, b.created_at) as at
      from hits h
      join public.binders b on b.id = h.id
      join public.profiles p on p.id = b.owner_id
      left join public.binder_like_counts c on c.binder_id = b.id
     where b.is_public
       and b.removed_at is null
       and coalesce(b.hidden_from_feeds, false) = false
       and coalesce(p.is_public, true)
       and b.archived_at is null
       and coalesce(b.is_demo, false) = false
  ),
  ranked as (
    select v.*
      from visible v
     where p_after_id is null
        or (v.likes, v.at, v.id) < (p_after_likes, p_after_at, p_after_id)
     order by v.likes desc, v.at desc, v.id desc
     limit least(greatest(p_limit, 0), 100)
  )
  select r.id, r.likes, r.username, r.at,
         public.binder_public_page_count(r.id),
         public.binder_face_page(r.id)
    from ranked r
   order by r.likes desc, r.at desc, r.id desc;
$$;

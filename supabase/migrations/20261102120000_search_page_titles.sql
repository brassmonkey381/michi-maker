-- Discover search reaches page titles (owner, 2026-11-02).
--
-- A public binder is remembered by the page in it ("the Pikachu page", "the Pitch Black set page")
-- as often as by its own name, and half of all pages already carry a title (2748 of 5613 on the
-- day this was written). search_binders gains ONE more union branch, on binder_pages.title, with
-- its own trigram index, so the cost stays an index probe per branch: the same shape the title,
-- description and username branches already have. Page notes are deliberately not searched: they
-- are long free text and the one field here with no index-friendly shape.
--
-- Applied with `supabase db query --linked -f`, not `db push` (this project is shared with the
-- tcgscan repos, whose migrations are not in this repo).

do $$
declare s text;
begin
  select n.nspname into s
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  execute format('create index if not exists binder_pages_title_trgm_idx on public.binder_pages using gin (title %I.gin_trgm_ops) where title is not null', s);
end $$;

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
    -- Page titles: the binder is the result, the page is why. Visibility is settled below, the
    -- same as every other branch.
    select pg.binder_id from public.binder_pages pg
      join public.binders b on b.id = pg.binder_id
     where b.is_public and btrim(coalesce(p_query, '')) <> ''
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

-- Public binder lists that stay fast as they grow: Discover, Featured and search.
--
-- MEASURED BEFORE THIS (2026-09-20, 68 public binders). Ranking was never the cost: every ranking
-- call answered in about 140 ms. The cost was what came after it. Each list then loaded EVERY page
-- and EVERY pocket of every binder it named (40 binders: 425 pages, 3,475 pockets, 2.6 MB, 920 ms)
-- to draw one page per tile. And Discover stopped at 40 with no way past: the 41st binder existed
-- only for someone who searched for it.
--
-- WHAT THIS CHANGES
--   0. The takedown filter is back in Discover. 20260826120000_moderation_kit added
--      `removed_at is null` to discover_binders; 20260901120000_discover_hides_empty rewrote the
--      function without it. Row security still kept a removed binder from being OPENED, but it
--      took a place in the ranking and its id, author and likes came back to any caller.
--   1. Every ranking row now says which page a tile should draw (face_page_id) and how many pages
--      a visitor can see (page_count), so the client loads one page per binder instead of all.
--   2. Like counts are kept, not recounted. A small table, maintained by a trigger on
--      binder_likes. Deliberately NOT a column on binders: that table has seven update triggers,
--      one bumps updated_at (which keys the share image cache) and one refuses updates to a
--      contest-locked binder, so a like on a locked entry would have failed outright.
--      Discover and search page by cursor (the last row's likes, time and id), so the display
--      cap is a page size and not a wall.
--   3. Search uses trigram indexes on title, description and username. Same behaviour as before,
--      any part of a word matches, but indexed. Typed % and _ are now literal, not wildcards.
--
-- OLD CLIENTS KEEP WORKING. PostgREST matches a function by the argument names sent. The new
-- arguments all have defaults, so a cached bundle calling with the old names resolves to the same
-- function, and extra columns in a result are ignored by it.

begin;

-- ── 2a. kept like counts ────────────────────────────────────────────────────────────────────
create table if not exists public.binder_like_counts (
  binder_id  uuid primary key references public.binders(id) on delete cascade,
  like_count integer not null default 0 check (like_count >= 0)
);
comment on table public.binder_like_counts is
  'Total likes per binder, maintained by the binder_likes trigger. Read only through the ranking functions; no client policy on purpose.';

alter table public.binder_like_counts enable row level security;
revoke all on public.binder_like_counts from anon, authenticated;

create or replace function public.binder_likes_keep_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.binder_like_counts (binder_id, like_count)
    values (new.binder_id, 1)
    on conflict (binder_id) do update
      set like_count = public.binder_like_counts.like_count + 1;
    return new;
  end if;
  -- DELETE. When the binder itself is going, its count row is going with it and this touches
  -- nothing, which is correct.
  update public.binder_like_counts
     set like_count = greatest(like_count - 1, 0)
   where binder_id = old.binder_id;
  return old;
end;
$$;

-- Nobody may like while the count is taken, or the backfill and the trigger would disagree.
lock table public.binder_likes in share row exclusive mode;

drop trigger if exists binder_likes_keep_count on public.binder_likes;
create trigger binder_likes_keep_count
  after insert or delete on public.binder_likes
  for each row execute function public.binder_likes_keep_count();

insert into public.binder_like_counts (binder_id, like_count)
select l.binder_id, count(*)::integer from public.binder_likes l group by l.binder_id
on conflict (binder_id) do update set like_count = excluded.like_count;

-- Re-running this migration: a binder whose likes have all gone since the first run keeps a row,
-- and the recount above does not visit it. Zero it.
update public.binder_like_counts c set like_count = 0
 where not exists (select 1 from public.binder_likes l where l.binder_id = c.binder_id)
   and c.like_count <> 0;

-- ── 1. what a tile draws ─────────────────────────────────────────────────────────────────────
-- The first page a visitor can see that holds a card or a picture; failing that, the first page
-- they can see. The same rule the app applies to a whole binder (data/previewPages.facePage).
create or replace function public.binder_face_page(p_binder uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select pg.id
       from public.binder_pages pg
      where pg.binder_id = p_binder
        and pg.is_public
        and exists (
          select 1 from public.binder_slots s
           where s.page_id = pg.id and (s.card_id is not null or s.image_url is not null)
        )
      order by pg.position, pg.id
      limit 1),
    (select pg.id
       from public.binder_pages pg
      where pg.binder_id = p_binder and pg.is_public
      order by pg.position, pg.id
      limit 1)
  );
$$;

create or replace function public.binder_public_page_count(p_binder uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.binder_pages pg
   where pg.binder_id = p_binder and pg.is_public;
$$;

-- A typed query as a LIKE pattern: wildcards the person typed are literal characters.
create or replace function public.like_pattern(p_query text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

-- ── 3. trigram indexes ──────────────────────────────────────────────────────────────────────
-- The extension may already live in another schema on this project, so the operator class is
-- addressed wherever it actually is rather than where we would have put it.
do $$
declare s text;
begin
  create extension if not exists pg_trgm with schema extensions;
  select n.nspname into s
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  execute format('create index if not exists binders_title_trgm_idx on public.binders using gin (title %I.gin_trgm_ops) where is_public', s);
  execute format('create index if not exists binders_description_trgm_idx on public.binders using gin (description %I.gin_trgm_ops) where is_public', s);
  execute format('create index if not exists profiles_username_trgm_idx on public.profiles using gin (username %I.gin_trgm_ops)', s);
end $$;

-- ── 0 + 1 + 2b. Discover ────────────────────────────────────────────────────────────────────
drop function if exists public.discover_binders(text, integer, text, text, text);
drop function if exists public.discover_binders(text, integer, text, text, text, bigint, timestamptz, uuid);
create function public.discover_binders(
  p_sort           text default 'recent',   -- 'recent' | 'likes'
  p_limit          integer default 40,
  p_contest        text default null,       -- exclude entries of this contest
  p_author         text default null,       -- ONLY this @username
  p_exclude_author text default null,       -- everything EXCEPT this @username
  -- THE CURSOR: the last row of the page before. All three, or none for the first page.
  p_after_likes    bigint default null,
  p_after_at       timestamptz default null,
  p_after_id       uuid default null
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
  with visible as (
    select b.id,
           coalesce(c.like_count, 0)::bigint as likes,
           p.username,
           coalesce(b.made_public_at, b.created_at) as at
      from public.binders b
      join public.profiles p on p.id = b.owner_id
      left join public.binder_like_counts c on c.binder_id = b.id
     where b.is_public
       and b.removed_at is null
       and coalesce(p.is_public, true)
       and b.archived_at is null
       and coalesce(b.is_demo, false) = false
       -- MIN_FILLED_POCKETS is 1: `exists` stops at the first pocket instead of walking them all.
       and exists (
         select 1
           from public.binder_pages pg
           join public.binder_slots s on s.page_id = pg.id
          where pg.binder_id = b.id
       )
       and (
         p_contest is null
         or not exists (
           select 1 from public.contest_entries e
            where e.binder_id = b.id and e.contest = p_contest
         )
       )
       and (p_author is null or lower(p.username) = lower(p_author))
       and (p_exclude_author is null or lower(p.username) is distinct from lower(p_exclude_author))
  ),
  ranked as (
    select v.*
      from visible v
     where p_after_id is null
        or (p_sort = 'likes' and (v.likes, v.at, v.id) < (p_after_likes, p_after_at, p_after_id))
        or (p_sort is distinct from 'likes' and (v.at, v.id) < (p_after_at, p_after_id))
     order by case when p_sort = 'likes' then v.likes else 0 end desc, v.at desc, v.id desc
     limit least(greatest(p_limit, 0), 100)
  )
  -- The tile's page and count are worked out for the rows that are actually returned, never for
  -- every candidate.
  select r.id, r.likes, r.username, r.at,
         public.binder_public_page_count(r.id),
         public.binder_face_page(r.id)
    from ranked r
   order by case when p_sort = 'likes' then r.likes else 0 end desc, r.at desc, r.id desc;
$$;
grant execute on function public.discover_binders(text, integer, text, text, text, bigint, timestamptz, uuid)
  to anon, authenticated;

-- ── search ──────────────────────────────────────────────────────────────────────────────────
drop function if exists public.search_binders(text, integer);
drop function if exists public.search_binders(text, integer, bigint, timestamptz, uuid);
create function public.search_binders(
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
  -- THREE BRANCHES, NOT ONE `or`. An `or` across two tables cannot use an index on either; a
  -- union of single-table conditions can use all three.
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
grant execute on function public.search_binders(text, integer, bigint, timestamptz, uuid)
  to anon, authenticated;

-- ── Featured: the same two tile columns; the ranking is unchanged ───────────────────────────
drop function if exists public.featured_binders(integer);
create function public.featured_binders(p_limit integer default 12)
returns table (
  binder_id    uuid,
  like_count   bigint,
  author_name  text,
  page_count   integer,
  face_page_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select l.binder_id, count(*) as like_count, max(p.username) as author_name
      from public.binder_likes l
      join public.binders b on b.id = l.binder_id
      join public.profiles p on p.id = b.owner_id
     where l.created_at >= now() - interval '3 days'
       and b.is_public
       and b.removed_at is null
       and coalesce(p.is_public, true)
     group by l.binder_id
     order by like_count desc, l.binder_id
     limit least(greatest(p_limit, 0), 100)
  )
  select r.binder_id, r.like_count, r.author_name,
         public.binder_public_page_count(r.binder_id),
         public.binder_face_page(r.binder_id)
    from ranked r
   order by r.like_count desc, r.binder_id;
$$;
grant execute on function public.featured_binders(integer) to anon, authenticated;

commit;

-- PostgREST caches function signatures; tell it these changed.
notify pgrst, 'reload schema';

-- Binders that are public so their share image renders, but are not part of the community.
--
-- WHY A COLUMN AND NOT is_demo. Every feed already filters `coalesce(b.is_demo, false) = false`,
-- so is_demo looks like the flag for this and is not: it also makes a binder READ ONLY in the
-- editor (src/components/binder/BinderScreen.tsx, canEdit). The puzzle binders are curated by hand,
-- eight candidates down to four, so they have to stay editable.
--
-- WHY PUBLIC AT ALL. The share image is fetched by scrapers with no session, so a preview only
-- renders for a binder an anonymous reader can load. `is_public` is therefore genuinely required
-- and this column is what takes back everything else that being public normally means.
--
-- THE FOUR FUNCTIONS BELOW ARE THE LIVE DEFINITIONS, with one line added to each. They were read
-- out of the database with pg_get_functiondef rather than reassembled from the five migrations that
-- have redefined them, because reassembling them by hand is how a feed quietly loses a filter it
-- used to have. The added line is marked above each one, and the anchor is `removed_at is null`,
-- which every one of them already gates on.

alter table public.binders
  add column if not exists hidden_from_feeds boolean not null default false;

comment on column public.binders.hidden_from_feeds is
  'Public so the share image renders, but kept out of discover, search, featured and the contest '
  'feed. Used by the daily puzzle binders. Not the same as is_demo, which also forces read-only.';

-- Partial, because the rows that set it are a handful out of every binder in the table.
create index if not exists binders_hidden_from_feeds_idx
  on public.binders (owner_id) where hidden_from_feeds;

-- contest_entry_feed: and coalesce(b.hidden_from_feeds, false) = false
CREATE OR REPLACE FUNCTION public.contest_entry_feed(p_contest text, p_limit integer DEFAULT 60)
 RETURNS TABLE(binder_id uuid, like_count bigint, author_name text, category text, entered_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select e.binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = e.binder_id) as like_count,
         p.username as author_name,
         e.category,
         e.created_at as entered_at
  from public.contest_entries e
  join public.binders b on b.id = e.binder_id
  join public.profiles p on p.id = b.owner_id
  where e.contest = p_contest
    and b.is_public
    and b.removed_at is null
    and coalesce(b.hidden_from_feeds, false) = false
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
  order by e.created_at desc, e.binder_id
  limit greatest(p_limit, 0);
$function$;

-- discover_binders: and coalesce(b.hidden_from_feeds, false) = false
CREATE OR REPLACE FUNCTION public.discover_binders(p_sort text DEFAULT 'recent'::text, p_limit integer DEFAULT 40, p_contest text DEFAULT NULL::text, p_author text DEFAULT NULL::text, p_exclude_author text DEFAULT NULL::text, p_after_likes bigint DEFAULT NULL::bigint, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(binder_id uuid, like_count bigint, author_name text, made_public_at timestamp with time zone, page_count integer, face_page_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
       and coalesce(b.hidden_from_feeds, false) = false
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
$function$;

-- featured_binders: and coalesce(b.hidden_from_feeds, false) = false
CREATE OR REPLACE FUNCTION public.featured_binders(p_limit integer DEFAULT 12)
 RETURNS TABLE(binder_id uuid, like_count bigint, author_name text, page_count integer, face_page_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ranked as (
    select l.binder_id, count(*) as like_count, max(p.username) as author_name
      from public.binder_likes l
      join public.binders b on b.id = l.binder_id
      join public.profiles p on p.id = b.owner_id
     where l.created_at >= now() - interval '3 days'
       and b.is_public
       and b.removed_at is null
       and coalesce(b.hidden_from_feeds, false) = false
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
$function$;

-- search_binders: and coalesce(b.hidden_from_feeds, false) = false
CREATE OR REPLACE FUNCTION public.search_binders(p_query text DEFAULT ''::text, p_limit integer DEFAULT 40, p_after_likes bigint DEFAULT NULL::bigint, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(binder_id uuid, like_count bigint, author_name text, made_public_at timestamp with time zone, page_count integer, face_page_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

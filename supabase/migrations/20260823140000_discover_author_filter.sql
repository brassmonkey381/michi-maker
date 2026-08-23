-- Discover: let a section be scoped to one author, or exclude one.
--
-- WHY. The michi-maker house account (@michimaker) publishes plain reference binders: mostly
-- ordinary cards, little or no art. They are useful and they should stay browsable, but mixed in
-- by publish date they push real people's work down the page, and a visitor's first impression of
-- Discover becomes the house's own filler. So they get their own section at the bottom, and the
-- main section leaves them out.
--
-- WHY DROP AND RECREATE. Adding parameters makes a NEW signature rather than replacing the old
-- one, so create-or-replace would leave two discover_binders functions and PostgREST would have
-- to guess. Dropping first keeps exactly one.
--
-- The already-deployed client calls this with p_sort / p_limit / p_contest only. Both new
-- parameters default to null, and PostgREST resolves by the argument names supplied, so that call
-- keeps matching and no client breaks while a deploy catches up.

drop function if exists public.discover_binders(text, integer, text);

create or replace function public.discover_binders(
  p_sort           text default 'recent',  -- 'recent' | 'likes'
  p_limit          integer default 40,
  p_contest        text default null,      -- exclude entries of this contest
  p_author         text default null,      -- ONLY this @username
  p_exclude_author text default null       -- everything EXCEPT this @username
)
returns table (
  binder_id      uuid,
  like_count     bigint,
  author_name    text,
  made_public_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id as binder_id,
         (select count(*) from public.binder_likes l where l.binder_id = b.id) as like_count,
         p.username as author_name,
         coalesce(b.made_public_at, b.created_at) as made_public_at
  from public.binders b
  join public.profiles p on p.id = b.owner_id
  where b.is_public
    and coalesce(p.is_public, true)
    and b.archived_at is null
    and coalesce(b.is_demo, false) = false
    and (
      p_contest is null
      or not exists (
        select 1 from public.contest_entries e
        where e.binder_id = b.id and e.contest = p_contest
      )
    )
    -- Username comparisons are case-insensitive: usernames are stored normalised, but a caller
    -- passing 'MichiMaker' should not silently select nothing.
    and (p_author is null or lower(p.username) = lower(p_author))
    and (p_exclude_author is null or lower(p.username) is distinct from lower(p_exclude_author))
  order by
    case when p_sort = 'likes'
      then (select count(*) from public.binder_likes l2 where l2.binder_id = b.id)
      else 0
    end desc,
    case when p_sort = 'likes'
      then null::timestamptz
      else coalesce(b.made_public_at, b.created_at)
    end desc nulls last,
    lower(coalesce(b.title, '')) asc,
    b.id
  limit greatest(p_limit, 0);
$$;

grant execute on function public.discover_binders(text, integer, text, text, text)
  to anon, authenticated;

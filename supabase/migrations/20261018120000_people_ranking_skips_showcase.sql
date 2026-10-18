-- search_profiles: the showcase binders do not count as publishing.
--
-- Binders with hidden_from_feeds (the daily puzzle binders, public only so the day's post can draw
-- its picture) are already left out of discover, search, featured and the contest feed
-- (20260923150000_hidden_from_feeds.sql). People browsing still saw them: every one stamps
-- made_public_at, so their owner was "most recently published" on every new puzzle binder and sat
-- at the top of the people list for it, and their count qualified the owner for browsing on its
-- own. One line added to each of the two binder CTEs; nothing else in the function changes.
-- (Owner, 2026-10-18: "hidden from others, but I can still render images from them".)

create or replace function public.search_profiles(
  p_query  text    default '',
  p_limit  integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  avatar_url text,
  upvotes bigint,
  binder_votes bigint
)
language sql stable security definer set search_path = ''
as $$
  with raw as (
    select nullif(btrim(coalesce(p_query, '')), '') as q
  ),
  term as (
    -- Backslash first, or it would escape the escapes added after it.
    select q, replace(replace(replace(q, '\', '\'), '%', '\%'), '_', '\_') as pat
    from raw
  ),
  upvote as (
    select u.profile_id, count(*) as n
    from public.profile_upvotes u
    group by u.profile_id
  ),
  visible_binder as (
    select b.owner_id, count(*) as n, max(b.made_public_at) as last_published
    from public.binders b
    where b.is_public and b.removed_at is null
      and coalesce(b.hidden_from_feeds, false) = false
    group by b.owner_id
  ),
  binder_vote as (
    select b.owner_id, count(*) as n
    from public.binder_likes l
    join public.binders b on b.id = l.binder_id
    where b.is_public and b.removed_at is null
      and coalesce(b.hidden_from_feeds, false) = false
    group by b.owner_id
  )
  select pr.id, pr.username, pr.avatar_url,
         coalesce(uv.n, 0) as upvotes,
         coalesce(bv.n, 0) as binder_votes
  from public.profiles pr
  cross join term t
  left join upvote uv         on uv.profile_id = pr.id
  left join visible_binder vb on vb.owner_id   = pr.id
  left join binder_vote bv    on bv.owner_id   = pr.id
  where coalesce(pr.is_public, true)
    and coalesce(pr.username, '') <> ''
    and (t.q is null or pr.username ilike '%' || t.pat || '%' escape '\')
    -- Browsing qualifies on having something to look at; searching deliberately does not.
    and (t.q is not null or coalesce(vb.n, 0) > 0)
  order by
    case
      when t.q is null                        then 0
      when lower(pr.username) = lower(t.q)    then 0
      when pr.username ilike t.pat || '%' escape '\' then 1
      else 2
    end,
    coalesce(uv.n, 0) desc,
    coalesce(bv.n, 0) desc,
    vb.last_published desc nulls last,
    lower(pr.username) asc
  limit  greatest(coalesce(p_limit, 30), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.search_profiles(text, integer, integer) to anon, authenticated;

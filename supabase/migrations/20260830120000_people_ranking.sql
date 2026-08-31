-- tcgscan-michi-maker: who the People window shows, and in what order.
--
-- THE DEFECT. search_profiles ordered by `upvotes desc, lower(username) asc` and the client asked
-- for 30 rows with no way to ask for more. Almost every profile has zero upvotes, so past the
-- handful that have any, the list collapsed into plain alphabetical from 'a' and stopped at 30.
-- That is not a ranking, it is an accident, and it is permanent: an account named `rileyuy` could
-- never appear in the browse list no matter what it did, while the same account was findable the
-- instant someone typed the name, because a typed query narrows the WHERE and so fits inside the
-- same 30. "Findable but unbrowsable, forever, based on your initial" is the bug being fixed.
--
-- WHAT CHANGES:
--   1. RANKING. Profile upvotes, then total votes across the owner's publicly visible binders,
--      then how recently they last published, then username. The last two are not decoration: an
--      ORDER BY that is not total lets OFFSET pagination drop and repeat rows between pages, so
--      the tail has to be deterministic once there is a page 2.
--   2. BROWSING QUALIFIES. The empty query now shows only profiles with at least one publicly
--      visible binder. A browse surface exists to be walked into, and a profile with nothing on it
--      is a dead end. A TYPED query still reaches everyone: someone searching a name wants that
--      person whether or not they have published.
--   3. SEARCH RANKS BY MATCH, NOT POPULARITY. Exact, then prefix, then substring, and only inside
--      a tier by votes. Before this, the query "riley" put a well-upvoted `smileyface` above an
--      exact `rileyuy`.
--   4. WILDCARDS ARE ESCAPED. `%` and `_` reached ILIKE raw, and `_` is a legal username character
--      (usernames are `^[a-z0-9_]{3,20}$`), so searching `riley_uy` silently matched any character
--      in that position. A query of `%` matched literally everyone.
--   5. p_offset, so the window can page instead of truncating.
--
-- WHAT DOES NOT CHANGE: the privacy gate. Browse and search stay ONE function behind one
-- `is_public` test, so the rule cannot drift between the two paths (that property is why the
-- qualification filter is expressed as "only when the query is empty" rather than as a second
-- RPC). Binder-derived numbers count only `is_public and removed_at is null` binders, so a
-- takedown withdraws the votes it carried as well as the binder.

drop function if exists public.search_profiles(text, integer);
drop function if exists public.search_profiles(text, integer, integer);

create function public.search_profiles(
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
    select q, replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') as pat
    from raw
  ),
  -- One grouped pass over each vote table rather than a correlated subquery per profile: browsing
  -- has to rank every candidate, so these get computed for all of them either way.
  upvote as (
    select u.profile_id, count(*) as n
    from public.profile_upvotes u
    group by u.profile_id
  ),
  visible_binder as (
    select b.owner_id, count(*) as n, max(b.made_public_at) as last_published
    from public.binders b
    where b.is_public and b.removed_at is null
    group by b.owner_id
  ),
  binder_vote as (
    select b.owner_id, count(*) as n
    from public.binder_likes l
    join public.binders b on b.id = l.binder_id
    where b.is_public and b.removed_at is null
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

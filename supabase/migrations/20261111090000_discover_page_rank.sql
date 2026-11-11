-- MIC-017 piece 8: Discover finds binders through their PAGES (owner, 2026-11-11: "I would rather
-- it return binders with PAGEs that exhibit a lot of black color throughout a specific page or
-- page(s) ... a post-it note tag on the bottom edge of the binder saying which page(s) have the
-- search result. clicking on the binder ... should also flip to the first page").
--
-- The caller sends card ids, each with a share in 0..1:
--   * a colour: how much of that card's art is the colour (from the on-device palette index);
--   * a text search: 1 for every card the search found.
-- A page's share is the sum of its pockets' shares over its filled pockets. A page matches when
-- its share is at least p_min_share and it holds at least p_min_cards cards. A binder matches
-- through its matching pages, and comes back with:
--   * match_pages: their 1-based numbers among the binder's PUBLIC pages (what ?page=N opens),
--     in page order;
--   * face_page_id: its best matching page, so the tile shows the page that matched;
--   * score: p_rank 'page' -> the best page's share (colour), 'binder' -> the same tf x log-count
--     as search_binders_by_cards over the whole binder (text search, unchanged ranking).
-- Same visibility gate as search_binders_by_cards.
--
-- ADDITIVE: one new function; nothing existing changes. Until it runs the app falls back to
-- search_binders_by_cards (no post-it, opens at the start), so the deploy order does not matter.
create or replace function public.search_binder_pages_by_cards(
  p_card_ids  text[],
  p_shares    real[] default null,
  p_min_share real default 0.35,
  p_min_cards integer default 3,
  p_rank      text default 'page',
  p_limit     integer default 40
)
returns table (
  binder_id      uuid,
  like_count     bigint,
  author_name    text,
  made_public_at timestamptz,
  page_count     integer,
  face_page_id   uuid,
  score          double precision,
  hits           integer,
  match_pages    integer[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select x.card_id, max(least(greatest(coalesce(x.share, 1), 0), 1))::double precision as share
      from unnest(coalesce(p_card_ids, '{}'::text[]), p_shares) as x(card_id, share)
     where x.card_id is not null
     group by x.card_id
     limit 20000
  ),
  touched as (
    select distinct s.page_id
      from public.binder_slots s
      join ids on ids.card_id = s.card_id
  ),
  -- Every public, unheld page a matched card sits on, with its number among its binder's public pages.
  pages as (
    select pg.id as page_id, pg.binder_id,
           (select count(*)::int from public.binder_pages q
             where q.binder_id = pg.binder_id and q.is_public
               and (q.position, q.id) <= (pg.position, pg.id)) as page_no
      from public.binder_pages pg
      join touched t on t.page_id = pg.id
     where pg.is_public and coalesce(pg.moderation_hold, false) = false
  ),
  page_share as (
    select p.page_id, p.binder_id, p.page_no,
           count(s.card_id)::int as filled,
           count(ids.card_id)::int as n,
           coalesce(sum(ids.share), 0) / greatest(count(s.card_id), 1) as share
      from pages p
      join public.binder_slots s on s.page_id = p.page_id and s.card_id is not null
      left join ids on ids.card_id = s.card_id
     group by p.page_id, p.binder_id, p.page_no
  ),
  matched as (
    select * from page_share
     where share >= p_min_share and filled >= greatest(p_min_cards, 1) and n > 0
  ),
  per_binder as (
    select m.binder_id,
           array_agg(m.page_no order by m.page_no) as match_pages,
           (array_agg(m.page_id order by m.share desc, m.n desc, m.page_no))[1] as best_page,
           max(m.share) as best_share,
           sum(m.n)::int as n
      from matched m
     group by m.binder_id
  ),
  size as (
    select pg.binder_id, count(*)::int as total
      from public.binder_slots s
      join public.binder_pages pg on pg.id = s.page_id
     where pg.binder_id in (select b.binder_id from per_binder b)
       and s.card_id is not null
       and pg.is_public and coalesce(pg.moderation_hold, false) = false
     group by pg.binder_id
  ),
  visible as (
    select b.id,
           coalesce(c.like_count, 0)::bigint as likes,
           p.username,
           coalesce(b.made_public_at, b.created_at) as at,
           h.n,
           h.best_page,
           h.match_pages,
           case when p_rank = 'binder'
                then (h.n::double precision / greatest(z.total, 1)) * ln(1 + h.n)
                else h.best_share + 0.01 * least(cardinality(h.match_pages), 5)
           end as score
      from per_binder h
      join size z on z.binder_id = h.binder_id
      join public.binders b on b.id = h.binder_id
      join public.profiles p on p.id = b.owner_id
      left join public.binder_like_counts c on c.binder_id = b.id
     where b.is_public
       and b.removed_at is null
       and coalesce(b.hidden_from_feeds, false) = false
       and coalesce(p.is_public, true)
       and b.archived_at is null
       and coalesce(b.is_demo, false) = false
     order by score desc, likes desc, at desc
     limit least(greatest(p_limit, 0), 100)
  )
  select v.id, v.likes, v.username, v.at,
         public.binder_public_page_count(v.id),
         v.best_page,
         v.score, v.n, v.match_pages
    from visible v
   order by v.score desc, v.likes desc, v.at desc;
$$;

grant execute on function public.search_binder_pages_by_cards(text[], real[], real, integer, text, integer) to anon, authenticated;

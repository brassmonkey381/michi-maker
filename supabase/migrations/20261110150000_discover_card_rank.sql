-- MIC-017 piece 8: Discover ranks public binders by HOW MUCH OF THEM a search's cards fill
-- ("card dominance"). The app turns any search (a Pokémon name, theme:night, a colour) into card
-- ids on the card server, and this ranks binders by tf x log-count of those ids among their own
-- public cards, likes breaking ties. Same visibility gate as search_binders.
--
-- ADDITIVE: one new function and one new index; nothing existing changes. Until this runs the app
-- falls back to the title/creator search it has today (PGRST202 -> fallback).
create index if not exists binder_slots_card_page_idx on public.binder_slots (card_id, page_id);

create or replace function public.search_binders_by_cards(
  p_card_ids text[],
  p_limit    integer default 40
)
returns table (
  binder_id      uuid,
  like_count     bigint,
  author_name    text,
  made_public_at timestamptz,
  page_count     integer,
  face_page_id   uuid,
  score          double precision,
  hits           integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select distinct x as card_id from unnest(coalesce(p_card_ids, '{}'::text[])) as x limit 2000
  ),
  hit as (
    select pg.binder_id, count(*)::int as n
      from public.binder_slots s
      join ids on ids.card_id = s.card_id
      join public.binder_pages pg on pg.id = s.page_id
     where pg.is_public and coalesce(pg.moderation_hold, false) = false
     group by pg.binder_id
  ),
  size as (
    select pg.binder_id, count(*)::int as total
      from public.binder_slots s
      join public.binder_pages pg on pg.id = s.page_id
     where pg.binder_id in (select h.binder_id from hit h)
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
           (h.n::double precision / greatest(z.total, 1)) * ln(1 + h.n) as score
      from hit h
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
         public.binder_face_page(v.id),
         v.score, v.n
    from visible v
   order by v.score desc, v.likes desc, v.at desc;
$$;

grant execute on function public.search_binders_by_cards(text[], integer) to anon, authenticated;

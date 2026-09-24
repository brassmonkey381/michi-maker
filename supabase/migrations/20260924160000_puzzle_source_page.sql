-- A puzzle remembers WHICH page it came from, not just which binder.
--
-- Needed to draw the social image. The poster-scale renderer (api/og-image-hires.js) picks pages by
-- its own rule, which is right for a share link and wrong for this: a puzzle binder holds every
-- candidate page from the curation pass, so that rule draws the two fullest ones side by side
-- instead of the one that was published. With the page id stored, the renderer can be told which.

alter table public.daily_puzzles
  add column if not exists source_page_id uuid references public.binder_pages(id) on delete set null;

comment on column public.daily_puzzles.source_page_id is
  'The binder page this was published from, so api/og-image-hires can be told which one to draw.';

create or replace function public.admin_publish_puzzle(
  p_publish_on date,
  p_page_id    uuid,
  p_themes     text[],
  p_hint       text default null,
  p_image_urls text[] default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id       uuid;
  v_page     record;
  v_cards    text[];
  v_themes   text[];
  v_backdrop text;
  v_images   text[];
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select p.id, p.binder_id, p.rows, p.cols, p.background_color into v_page
    from public.binder_pages p where p.id = p_page_id;
  if v_page.id is null then
    raise exception 'no such page' using errcode = '42704';
  end if;

  v_backdrop := case
    when v_page.background_color ~* '^https?://\S+$' then v_page.background_color
    else null
  end;

  select array_agg(s.card_id order by s.row_index, s.col_index) into v_cards
    from public.binder_slots s
   where s.page_id = p_page_id and s.slot_type = 'card' and s.card_id is not null;
  if v_cards is null or cardinality(v_cards) = 0 then
    raise exception 'that page has no cards on it' using errcode = '22023';
  end if;

  select array_agg(distinct btrim(lower(t))) into v_themes
    from unnest(coalesce(p_themes, '{}')) as t
   where btrim(t) <> '';
  if v_themes is null or cardinality(v_themes) = 0 then
    raise exception 'a puzzle needs at least one theme' using errcode = '22023';
  end if;

  if p_image_urls is not null then
    if cardinality(p_image_urls) <> cardinality(v_cards) then
      raise exception 'expected % picture addresses, got %',
        cardinality(v_cards), cardinality(p_image_urls) using errcode = '22023';
    end if;
    if exists (select 1 from unnest(p_image_urls) as u where u is null or u !~* '^https?://\S+$') then
      raise exception 'every picture address must be http(s)' using errcode = '22023';
    end if;
    v_images := p_image_urls;
  end if;

  insert into public.daily_puzzles as d
    (publish_on, theme_count, card_ids, card_image_urls, rows, cols, hint,
     backdrop_url, source_binder_id, source_page_id)
  values
    (p_publish_on, cardinality(v_themes), v_cards, v_images, v_page.rows, v_page.cols, p_hint,
     v_backdrop, v_page.binder_id, v_page.id)
  on conflict (publish_on) do update
    set theme_count      = excluded.theme_count,
        card_ids         = excluded.card_ids,
        card_image_urls  = coalesce(excluded.card_image_urls, d.card_image_urls),
        rows             = excluded.rows,
        cols             = excluded.cols,
        hint             = excluded.hint,
        backdrop_url     = excluded.backdrop_url,
        source_binder_id = excluded.source_binder_id,
        source_page_id   = excluded.source_page_id
  returning d.id into v_id;

  insert into public.daily_puzzle_answers (puzzle_id, themes)
  values (v_id, v_themes)
  on conflict (puzzle_id) do update set themes = excluded.themes;

  insert into public.puzzle_vocabulary (word)
  select unnest(v_themes)
  on conflict (word) do nothing;

  return v_id;
end;
$$;

-- Puzzles published before this column: the page is recoverable when the binder has exactly one
-- page with cards on it, which is true of every puzzle binder built so far. An ambiguous binder is
-- left null, and the renderer falls back to its own choice rather than guessing here.
update public.daily_puzzles d
   set source_page_id = one.id
  from (
    select p.binder_id, min(p.id::text)::uuid as id, count(*) as n
      from public.binder_pages p
     where exists (
       select 1 from public.binder_slots s
        where s.page_id = p.id and s.slot_type = 'card' and s.card_id is not null
     )
     group by p.binder_id
  ) one
 where one.binder_id = d.source_binder_id and one.n = 1 and d.source_page_id is null;

-- The list gains what the download button needs: the page to draw, and whether the binder is
-- public at all. The renderer reads binders with `is_public=eq.true` hardcoded, so a puzzle whose
-- binder is private cannot produce an image and the panel should say so rather than fail opaquely.
drop function if exists public.admin_puzzle_list(integer);
create or replace function public.admin_puzzle_list(p_limit integer default 60)
returns table (
  id uuid, publish_on date, theme_count integer, card_count integer,
  rows integer, cols integer, hint text, source_binder_id uuid, source_page_id uuid,
  binder_is_public boolean, plays bigint, correct bigint, published boolean
)
language sql stable security definer set search_path = '' as $$
  select d.id, d.publish_on, d.theme_count, cardinality(d.card_ids)::integer,
         d.rows, d.cols, d.hint, d.source_binder_id, d.source_page_id,
         coalesce(b.is_public, false),
         (select count(*) from public.puzzle_plays p where p.puzzle_id = d.id),
         (select count(*) from public.puzzle_plays p where p.puzzle_id = d.id and p.correct),
         d.publish_on <= (now() at time zone 'utc')::date
    from public.daily_puzzles d
    left join public.binders b on b.id = d.source_binder_id
   where public.is_admin()
   order by d.publish_on desc
   limit least(greatest(p_limit, 0), 200);
$$;

revoke all on function public.admin_puzzle_list(integer) from public;
grant execute on function public.admin_puzzle_list(integer) to authenticated;

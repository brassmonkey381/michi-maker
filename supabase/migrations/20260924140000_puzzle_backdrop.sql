-- A published puzzle takes the backdrop of the page it came from.
--
-- `daily_puzzles.backdrop_url` has existed since the first puzzle migration and nothing ever filled
-- it, so /daily had no background of its own. The page it is published FROM already has one: a
-- binder page's `background_color` holds either a #rrggbb or an http(s) image address, told apart
-- by shape (src/data/pageStyle.ts, isImageRef). Copying it across means the puzzle looks like the
-- binder page it is, and the owner sets it by setting the binder's background rather than by
-- editing a constant in the app.
--
-- ONLY AN IMAGE IS CARRIED. A colour belongs to the binder page's own styling, where it sits behind
-- pockets; stretched across a whole screen it is just a tinted wall, and the app's themed
-- background is a better answer than an arbitrary one. So a #rrggbb is left behind and the screen
-- falls back to its default.

create or replace function public.admin_publish_puzzle(
  p_publish_on date,
  p_page_id    uuid,
  p_themes     text[],
  p_hint       text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id       uuid;
  v_page     record;
  v_cards    text[];
  v_themes   text[];
  v_backdrop text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select p.id, p.binder_id, p.rows, p.cols, p.background_color into v_page
    from public.binder_pages p where p.id = p_page_id;
  if v_page.id is null then
    raise exception 'no such page' using errcode = '42704';
  end if;

  -- An http(s) address is a picture; anything else (a colour, or nothing) is not one.
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

  insert into public.daily_puzzles as d
    (publish_on, theme_count, card_ids, rows, cols, hint, backdrop_url, source_binder_id)
  values
    (p_publish_on, cardinality(v_themes), v_cards, v_page.rows, v_page.cols, p_hint, v_backdrop, v_page.binder_id)
  on conflict (publish_on) do update
    set theme_count = excluded.theme_count,
        card_ids    = excluded.card_ids,
        rows        = excluded.rows,
        cols        = excluded.cols,
        hint        = excluded.hint,
        backdrop_url = excluded.backdrop_url,
        source_binder_id = excluded.source_binder_id
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

-- Puzzles published before this carried no backdrop. Fill them in from their source page, so an
-- already-scheduled puzzle does not have to be re-published to gain one.
update public.daily_puzzles d
   set backdrop_url = p.background_color
  from public.binder_pages p
 where p.binder_id = d.source_binder_id
   and d.backdrop_url is null
   and p.background_color ~* '^https?://\S+$'
   and p.position = (select min(p2.position) from public.binder_pages p2 where p2.binder_id = d.source_binder_id);

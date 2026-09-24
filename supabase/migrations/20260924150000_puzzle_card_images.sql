-- A published puzzle carries the addresses of its own card pictures.
--
-- THE PROBLEM, MEASURED. Card images resolve through a manifest keyed by content hash, which the
-- client fetches once per session. That manifest is 5.2 MB. Inside the app it is already warm and
-- nobody notices; on /daily it is the whole cost of the page, because a visitor arriving cold from
-- a link has to download all of it before nine pictures can appear, and until it lands
-- `cardThumbUrl` correctly returns '' and the pockets are blank.
--
-- Nine addresses on the puzzle row is the same information for about a kilobyte. The page then
-- needs no manifest at all, which is why this is worth a column rather than a client fix alone.
--
-- THE CLIENT RESOLVES THEM, NOT POSTGRES. The manifest is a JSON object in storage and the database
-- cannot read it. Studio publishes, Studio already draws the page preview, so Studio has the
-- resolved addresses in hand at exactly the moment it needs them. They are passed in and validated
-- here rather than trusted: wrong length is refused, and anything that is not an http(s) address is
-- refused, so a bug in the panel cannot fill this column with '' and make every pocket blank again.
--
-- IT STAYS OPTIONAL. Null means "resolve them the old way", which is what an older puzzle does and
-- what the page falls back to. The fallback is not dead code: it is the only thing that works if a
-- publish happens before the manifest has hydrated.

alter table public.daily_puzzles
  add column if not exists card_image_urls text[];

comment on column public.daily_puzzles.card_image_urls is
  'Resolved card picture addresses, in the same order as card_ids, so /daily needs no image '
  'manifest. Null = the client resolves them itself. Filled by admin_publish_puzzle.';

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

  -- All of them, in order, and every one a real address, or none of them. A partly filled array
  -- would draw some pockets and leave others blank with no way to tell why.
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
    (publish_on, theme_count, card_ids, card_image_urls, rows, cols, hint, backdrop_url, source_binder_id)
  values
    (p_publish_on, cardinality(v_themes), v_cards, v_images, v_page.rows, v_page.cols,
     p_hint, v_backdrop, v_page.binder_id)
  on conflict (publish_on) do update
    set theme_count      = excluded.theme_count,
        card_ids         = excluded.card_ids,
        -- Kept when a re-publish cannot resolve them, so fixing a hint from a cold tab does not
        -- blank the pictures of a puzzle that already had them.
        card_image_urls  = coalesce(excluded.card_image_urls, d.card_image_urls),
        rows             = excluded.rows,
        cols             = excluded.cols,
        hint             = excluded.hint,
        backdrop_url     = excluded.backdrop_url,
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

-- The four-argument version is replaced, not kept beside the new one: two overloads differing by a
-- trailing default is the shape PostgREST cannot choose between, and it would answer with an
-- ambiguity error rather than picking.
drop function if exists public.admin_publish_puzzle(date, uuid, text[], text);

revoke all on function public.admin_publish_puzzle(date, uuid, text[], text, text[]) from public;
grant execute on function public.admin_publish_puzzle(date, uuid, text[], text, text[]) to authenticated;

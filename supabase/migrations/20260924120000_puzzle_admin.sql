-- Authoring the daily puzzle from Studio, rather than from a script on one laptop.
--
-- WHY RPCS AND NOT TABLE POLICIES. daily_puzzles and daily_puzzle_answers are privileged-write on
-- purpose: the answers table has no read policy at all, and giving the client a write policy on a
-- table it cannot read is the sort of asymmetry that invites someone to "fix" it later by adding
-- the read back. So the client gets named verbs instead, each one `is_admin()` first, and the
-- answers stay unreadable from every direction.
--
-- THE PAGE IS THE SOURCE. A puzzle is published FROM a binder page that was curated by hand, so
-- admin_publish_puzzle reads the cards off that page rather than taking a list. The page is the
-- thing the author looked at; a list retyped beside it is a second version of the truth that can
-- disagree with it silently.

-- Everything the panel needs about one puzzle, and nothing it does not: no themes.
create or replace function public.admin_puzzle_list(p_limit integer default 60)
returns table (
  id uuid, publish_on date, theme_count integer, card_count integer,
  rows integer, cols integer, hint text, source_binder_id uuid,
  plays bigint, correct bigint, published boolean
)
language sql stable security definer set search_path = '' as $$
  select d.id, d.publish_on, d.theme_count, cardinality(d.card_ids)::integer,
         d.rows, d.cols, d.hint, d.source_binder_id,
         (select count(*) from public.puzzle_plays p where p.puzzle_id = d.id),
         (select count(*) from public.puzzle_plays p where p.puzzle_id = d.id and p.correct),
         d.publish_on <= (now() at time zone 'utc')::date
    from public.daily_puzzles d
   where public.is_admin()
   order by d.publish_on desc
   limit least(greatest(p_limit, 0), 200);
$$;

-- The answer, for the author only. The panel has to show what it is about to publish, and an
-- author who cannot see the answer cannot check it. Admin only, and separate from the list so the
-- answer is fetched deliberately rather than riding along with every refresh.
create or replace function public.admin_puzzle_themes(p_puzzle_id uuid)
returns text[]
language sql stable security definer set search_path = '' as $$
  select a.themes from public.daily_puzzle_answers a
   where a.puzzle_id = p_puzzle_id and public.is_admin();
$$;

/**
 * Publish (or re-publish) the puzzle for a date, taking its cards from a binder page.
 *
 * Idempotent on the DATE, which is the key a reader sees. Re-running with the same date replaces
 * that day's puzzle rather than failing or making a second one, so fixing a typo in the hint is
 * the same action as publishing.
 */
create or replace function public.admin_publish_puzzle(
  p_publish_on date,
  p_page_id    uuid,
  p_themes     text[],
  p_hint       text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id     uuid;
  v_page   record;
  v_cards  text[];
  v_themes text[];
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select p.id, p.binder_id, p.rows, p.cols into v_page
    from public.binder_pages p where p.id = p_page_id;
  if v_page.id is null then
    raise exception 'no such page' using errcode = '42704';
  end if;

  -- In reading order, which is the order the page is looked at and therefore the order the cards
  -- should appear in. Only card slots: an artwork or a text slot is not a card to guess.
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
    (publish_on, theme_count, card_ids, rows, cols, hint, source_binder_id)
  values
    (p_publish_on, cardinality(v_themes), v_cards, v_page.rows, v_page.cols, p_hint, v_page.binder_id)
  on conflict (publish_on) do update
    set theme_count = excluded.theme_count,
        card_ids    = excluded.card_ids,
        rows        = excluded.rows,
        cols        = excluded.cols,
        hint        = excluded.hint,
        source_binder_id = excluded.source_binder_id
  returning d.id into v_id;

  insert into public.daily_puzzle_answers (puzzle_id, themes)
  values (v_id, v_themes)
  on conflict (puzzle_id) do update set themes = excluded.themes;

  -- The words become suggestable, because a player has to be able to type the answer. Parked words
  -- (suggest = false) are left parked: un-parking is a decision, not a side effect of publishing.
  insert into public.puzzle_vocabulary (word)
  select unnest(v_themes)
  on conflict (word) do nothing;

  return v_id;
end;
$$;

create or replace function public.admin_unpublish_puzzle(p_puzzle_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  -- The answer and any plays go by cascade. A puzzle nobody has played is the normal case here
  -- (it is how a mis-dated one is withdrawn), and plays on a withdrawn puzzle are not worth keeping.
  delete from public.daily_puzzles where id = p_puzzle_id;
end;
$$;

/**
 * The binders a puzzle can be published from, with their pages.
 *
 * Scoped to the CALLER's own binders. An admin authoring puzzles is working from their own account,
 * and a function that could list anybody's pages would be a much bigger thing than this needs to be.
 */
create or replace function public.admin_puzzle_sources()
returns table (
  binder_id uuid, binder_title text, is_public boolean, hidden_from_feeds boolean,
  page_id uuid, page_position integer, page_title text,
  rows integer, cols integer, card_count integer
)
language sql stable security definer set search_path = '' as $$
  select b.id, b.title, b.is_public, b.hidden_from_feeds,
         p.id, p.position, p.title, p.rows, p.cols,
         (select count(*)::integer from public.binder_slots s
           where s.page_id = p.id and s.slot_type = 'card' and s.card_id is not null)
    from public.binders b
    join public.binder_pages p on p.binder_id = b.id
   where public.is_admin()
     and b.owner_id = auth.uid()
     and b.archived_at is null
     and b.removed_at is null
   order by b.title, p.position;
$$;

/** Public enough for a share image, invisible to every feed. Both flags in one call, on purpose:
 *  setting one without the other is the mistake this pair exists to prevent. */
create or replace function public.admin_set_binder_showcase(p_binder_id uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.binders
     set is_public = p_on, hidden_from_feeds = p_on
   where id = p_binder_id and owner_id = auth.uid();
  if not found then
    raise exception 'not your binder' using errcode = '42501';
  end if;
end;
$$;

-- The guess box's word list, for the panel to curate.
create or replace function public.admin_vocabulary(p_limit integer default 500)
returns table (word text, suggest boolean, used_in integer)
language sql stable security definer set search_path = '' as $$
  select v.word, v.suggest,
         (select count(*)::integer from public.daily_puzzle_answers a where v.word = any (a.themes))
    from public.puzzle_vocabulary v
   where public.is_admin()
   order by v.word
   limit least(greatest(p_limit, 0), 2000);
$$;

create or replace function public.admin_set_vocabulary(p_words text[], p_suggest boolean default true)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_words text[];
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select array_agg(distinct btrim(lower(w))) into v_words
    from unnest(coalesce(p_words, '{}')) as w
   where btrim(w) <> '' and length(btrim(w)) between 2 and 32;
  if v_words is null then return 0; end if;

  insert into public.puzzle_vocabulary (word, suggest)
  select unnest(v_words), p_suggest
  on conflict (word) do update set suggest = excluded.suggest;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.admin_puzzle_list(integer)                        from public;
revoke all on function public.admin_puzzle_themes(uuid)                         from public;
revoke all on function public.admin_publish_puzzle(date, uuid, text[], text)    from public;
revoke all on function public.admin_unpublish_puzzle(uuid)                      from public;
revoke all on function public.admin_puzzle_sources()                            from public;
revoke all on function public.admin_set_binder_showcase(uuid, boolean)          from public;
revoke all on function public.admin_vocabulary(integer)                         from public;
revoke all on function public.admin_set_vocabulary(text[], boolean)             from public;

grant execute on function public.admin_puzzle_list(integer)                     to authenticated;
grant execute on function public.admin_puzzle_themes(uuid)                      to authenticated;
grant execute on function public.admin_publish_puzzle(date, uuid, text[], text) to authenticated;
grant execute on function public.admin_unpublish_puzzle(uuid)                   to authenticated;
grant execute on function public.admin_puzzle_sources()                         to authenticated;
grant execute on function public.admin_set_binder_showcase(uuid, boolean)       to authenticated;
grant execute on function public.admin_vocabulary(integer)                      to authenticated;
grant execute on function public.admin_set_vocabulary(text[], boolean)          to authenticated;

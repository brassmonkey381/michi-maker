-- A scheduled puzzle follows its binder page until the day it runs.
--
-- WHY. A puzzle is a snapshot: admin_publish_puzzle copies the page's cards into daily_puzzles, so
-- editing the page afterwards changed the binder and not the puzzle, and the owner had to open the
-- Studio and re-publish the same page to make the change count. The owner edits puzzle pages in the
-- binder editor, not the Studio (2026-10-18: "if i change the title of a binder page and swap out
-- the cards, will that update the planned puzzle for that day?" "yes").
--
-- WHAT FOLLOWS: the cards (and their order), the grid size, and the backdrop. Not the answer words:
-- those live in daily_puzzle_answers and are typed, not derived from the page. Not the title.
--
-- WHICH DAYS: only puzzles whose day is still to come (publish_on > puzzle_today()). The current
-- day's puzzle has been played and stays as it was; so does every earlier one.
--
-- PICTURE ADDRESSES: daily_puzzles.card_image_urls is positional, one address per card, and the
-- client refuses a partial list. Cards kept from the old page keep their address; if any card is new
-- the whole list is dropped and the player's page draws through the catalog instead, exactly as it
-- does for a puzzle published without addresses. (The Studio's "swap page" sends fresh addresses,
-- which this never touches: the trigger fires on slot writes, and a republish writes no slots.)
--
-- WHY A TRIGGER AND NOT A VIEW: the player's read is one row by date through RLS; a join to the
-- owner's live page would need the page readable by everyone and would move with every keystroke of
-- an edit in progress. The copy stays; it is just kept fresh.

create or replace function public.puzzle_sync_from_page(p_page_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_page   record;
  v_cards  text[];
  v_puzzle record;
  v_images text[];
begin
  if p_page_id is null then return; end if;

  select p.id, p.rows, p.cols, p.background_color into v_page
    from public.binder_pages p where p.id = p_page_id;
  if v_page.id is null then return; end if;

  select array_agg(s.card_id order by s.row_index, s.col_index) into v_cards
    from public.binder_slots s
   where s.page_id = p_page_id and s.slot_type = 'card' and s.card_id is not null;
  -- A page emptied mid-edit keeps the puzzle as it was: an empty puzzle helps nobody, and the
  -- next card placed will bring it in line.
  if v_cards is null or cardinality(v_cards) = 0 then return; end if;

  for v_puzzle in
    select d.id, d.card_ids, d.card_image_urls
      from public.daily_puzzles d
     where d.source_page_id = p_page_id
       and d.publish_on > public.puzzle_today()
  loop
    -- Keep each surviving card's address by looking it up in the old pair of arrays; a card the old
    -- list did not have leaves a null, and one null drops the whole list.
    v_images := null;
    if v_puzzle.card_image_urls is not null
       and cardinality(v_puzzle.card_image_urls) = cardinality(v_puzzle.card_ids) then
      select array_agg(
               (select o.url from unnest(v_puzzle.card_ids, v_puzzle.card_image_urls) as o(id, url)
                 where o.id = n.id limit 1)
               order by n.ord)
        into v_images
        from unnest(v_cards) with ordinality as n(id, ord);
      if exists (select 1 from unnest(v_images) as u where u is null) then
        v_images := null;
      end if;
    end if;

    update public.daily_puzzles d
       set card_ids        = v_cards,
           card_image_urls = v_images,
           rows            = v_page.rows,
           cols            = v_page.cols,
           backdrop_url    = case when v_page.background_color ~* '^https?://\S+$'
                                  then v_page.background_color else null end
     where d.id = v_puzzle.id
       and (d.card_ids is distinct from v_cards
            or d.card_image_urls is distinct from v_images
            or d.rows <> v_page.rows or d.cols <> v_page.cols);
  end loop;
end;
$$;

revoke all on function public.puzzle_sync_from_page(uuid) from public;

create or replace function public.puzzle_follow_slot()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Cheap exit for the common case: the page feeds no puzzle at all.
  if tg_op in ('INSERT', 'UPDATE') and exists (
       select 1 from public.daily_puzzles d where d.source_page_id = new.page_id) then
    perform public.puzzle_sync_from_page(new.page_id);
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.page_id is distinct from new.page_id)
     and exists (select 1 from public.daily_puzzles d where d.source_page_id = old.page_id) then
    perform public.puzzle_sync_from_page(old.page_id);
  end if;
  return null;
end;
$$;

create or replace function public.puzzle_follow_page()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.daily_puzzles d where d.source_page_id = new.id) then
    perform public.puzzle_sync_from_page(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists binder_slots_follow_puzzle on public.binder_slots;
create trigger binder_slots_follow_puzzle
  after insert or update or delete on public.binder_slots
  for each row execute function public.puzzle_follow_slot();

drop trigger if exists binder_pages_follow_puzzle on public.binder_pages;
create trigger binder_pages_follow_puzzle
  after update of rows, cols, background_color on public.binder_pages
  for each row execute function public.puzzle_follow_page();

comment on function public.puzzle_sync_from_page(uuid) is
  'Copies a binder page''s cards, grid and backdrop into every FUTURE puzzle built from it. Fired by '
  'binder_slots_follow_puzzle and binder_pages_follow_puzzle; the answer words are never derived.';

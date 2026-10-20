-- The puzzle follows the page at COMMIT, and a puzzle problem never fails a binder edit.
--
-- WHAT WENT WRONG (owner, 2026-10-20: "when i edit a puzzle binder page now, i often get: A change
-- didn't save"). 20261018140000's triggers fired after every slot statement, and the editor's
-- writes pass through states no finished page is ever in: a drop onto an occupied cell has ten
-- cards on a 3x3 for one statement, a pocket parked at row 1,000,000 during a move, a picker
-- placement that lands before its clear. The sync copied that state into daily_puzzles, the
-- puzzle's fits_page check refused it, and the refusal rolled back the owner's edit.
--
-- TWO CHANGES. The slot trigger is now a CONSTRAINT trigger, DEFERRABLE INITIALLY DEFERRED, so it
-- runs once the transaction is about to commit and sees the page as the editor left it, not as it
-- passed through. And the sync itself only reads pockets inside the grid, skips a page that still
-- does not fit, and catches everything else as a warning: the binder is the owner's work and the
-- puzzle is a copy of it, so the copy is what gives way.

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

  -- Only pockets inside the grid: a pocket parked far off the page mid-move is not on the page.
  select array_agg(s.card_id order by s.row_index, s.col_index) into v_cards
    from public.binder_slots s
   where s.page_id = p_page_id and s.slot_type = 'card' and s.card_id is not null
     and s.row_index < v_page.rows and s.col_index < v_page.cols;
  -- A page emptied mid-edit keeps the puzzle as it was; so does one with more cards than cells
  -- (two pockets on one cell before a deferred uniqueness check sorts them out). The next write
  -- that leaves the page whole brings the puzzle in line.
  if v_cards is null or cardinality(v_cards) = 0 or cardinality(v_cards) > v_page.rows * v_page.cols then
    return;
  end if;

  for v_puzzle in
    select d.id, d.card_ids, d.card_image_urls
      from public.daily_puzzles d
     where d.source_page_id = p_page_id
       and d.publish_on > public.puzzle_today()
  loop
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
exception when others then
  -- The copy gives way, never the edit. Visible in the Postgres log; the Studio calendar shows
  -- the day it affects, and a republish from the Studio always rewrites the snapshot.
  raise warning 'puzzle_sync_from_page(%): % (%)', p_page_id, sqlerrm, sqlstate;
end;
$$;

revoke all on function public.puzzle_sync_from_page(uuid) from public;

-- Fires at commit, when the editor's statement sequence has finished with the page.
drop trigger if exists binder_slots_follow_puzzle on public.binder_slots;
create constraint trigger binder_slots_follow_puzzle
  after insert or update or delete on public.binder_slots
  deferrable initially deferred
  for each row execute function public.puzzle_follow_slot();

drop trigger if exists binder_pages_follow_puzzle on public.binder_pages;
create constraint trigger binder_pages_follow_puzzle
  after update of rows, cols, background_color on public.binder_pages
  deferrable initially deferred
  for each row execute function public.puzzle_follow_page();

comment on function public.puzzle_sync_from_page(uuid) is
  'Copies a binder page''s in-grid cards, grid and backdrop into every FUTURE puzzle built from it, at commit. '
  'Skips a page that does not fit its grid and swallows any other error as a warning: a puzzle problem never fails an edit.';

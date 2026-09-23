-- A MOVE IS ONE TRANSACTION. This is what stops "A change didn't save" and the lost cards behind it.
--
-- THE SHAPE OF THE BUG. Every pocket move was a sequence of SEPARATE PostgREST requests, and
-- PostgREST gives each request its own transaction:
--   * upsertSlot   = SELECT the occupant, DELETE the destination cell, UPSERT the pocket.
--   * moveSlotToCell = DELETE the destination cell, UPDATE the pocket.
--   * swapSlotCells  = DELETE any stale park row, UPDATE A to a park cell, UPDATE B, UPDATE A.
-- Each of those opens by DESTROYING something, and the steps that follow are UPDATEs, which
-- cannot put a row back. A failure between two requests therefore left the server missing a
-- pocket the screen still showed, and the owner found out on the next reload. Two moves in quick
-- succession did it to each other: the second one's opening DELETE hit a row the first had just
-- parked or displaced. The client now serialises its writes, which stops moves racing EACH OTHER,
-- but it cannot make a three-request dance atomic. Only the database can.
--
-- WHY THIS WORKS NOW AND WOULD NOT HAVE BEFORE. 20260906120000 made
-- unique (page_id, row_index, col_index) DEFERRABLE INITIALLY DEFERRED, and said in its own
-- header that the benefit is limited to a single request, because that is the only thing that is
-- a single transaction. These functions are that single transaction. Inside one, two pockets can
-- hold each other's cells halfway through and the check only runs at COMMIT, on the final layout.
--
-- SO THE PARK GOES AWAY. swapSlotCells parked a pocket at row_index = 1000000 purely to dodge a
-- check that no longer fires mid-statement, and then had to sweep that cell on the next swap in
-- case a crash left something there. That sweep was an unconditional DELETE of live data and was
-- one of the three ways a card disappeared. A swap is now two UPDATEs and nothing else.
--
-- SECURITY INVOKER, deliberately. These run as the caller, so the existing binder_slots policies
-- (20260707055603) decide what may be touched exactly as they do for a direct write. A definer
-- function here would be a way to edit anybody's binder.

-- ---------------------------------------------------------------------------
-- Move one pocket to a cell, clearing whatever is in the way
-- ---------------------------------------------------------------------------

create or replace function public.move_slot_to_cell(
  p_slot_id uuid,
  p_page_id uuid,
  p_row integer,
  p_col integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_moved integer;
begin
  -- The destination's current occupant. Still a delete, but now in the SAME transaction as the
  -- move: if the move below fails, this comes back with it. That is the whole difference.
  delete from public.binder_slots
   where page_id = p_page_id
     and row_index = p_row
     and col_index = p_col
     and id <> p_slot_id;

  update public.binder_slots
     set page_id = p_page_id, row_index = p_row, col_index = p_col
   where id = p_slot_id;

  get diagnostics v_moved = row_count;
  -- Zero rows means RLS refused it or the pocket is not there. A silent success would leave the
  -- screen showing a pocket the server does not have, which is the failure this whole migration
  -- exists to end.
  if v_moved = 0 then
    raise exception 'move pocket: pocket % is not on the server', left(p_slot_id::text, 8)
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.move_slot_to_cell(uuid, uuid, integer, integer) is
  'Move one pocket to a cell, clearing the occupant, in one transaction. Replaces a DELETE-then-UPDATE across two requests that could lose the occupant.';

-- ---------------------------------------------------------------------------
-- Swap two pockets' cells: two UPDATEs, no park, no sweep
-- ---------------------------------------------------------------------------

create or replace function public.swap_slot_cells(
  p_a_id uuid, p_a_page uuid, p_a_row integer, p_a_col integer,
  p_b_id uuid, p_b_page uuid, p_b_row integer, p_b_col integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_moved integer;
begin
  -- Between these two statements the pair transiently occupies one cell twice. That is exactly
  -- what the DEFERRABLE constraint permits, and exactly what the old park-at-row-1000000 dance
  -- was built to avoid back when the check fired per statement.
  update public.binder_slots
     set page_id = p_a_page, row_index = p_a_row, col_index = p_a_col
   where id = p_a_id;
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise exception 'swap pockets: pocket % is not on the server', left(p_a_id::text, 8)
      using errcode = 'P0002';
  end if;

  update public.binder_slots
     set page_id = p_b_page, row_index = p_b_row, col_index = p_b_col
   where id = p_b_id;
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    raise exception 'swap pockets: pocket % is not on the server', left(p_b_id::text, 8)
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.swap_slot_cells(uuid, uuid, integer, integer, uuid, uuid, integer, integer) is
  'Swap two pockets'' cells in one transaction, relying on the deferred unique(page_id,row_index,col_index). Replaces a four-request park-and-unpark dance that could delete a live pocket.';

-- ---------------------------------------------------------------------------
-- Place a pocket at a cell (insert or update), clearing the occupant
-- ---------------------------------------------------------------------------
-- The picker's placement path was two INDEPENDENT fire-and-forget requests, a DELETE of the cells
-- it covers and then an UPSERT. Out of order, the upsert landed first and its own clear-up then
-- deleted it. One transaction, in order, cannot do that.

create or replace function public.clear_cells_for_slot(
  p_page_id uuid,
  p_keep_id uuid,
  p_cells jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.binder_slots s
   using jsonb_to_recordset(p_cells) as c(row_index integer, col_index integer)
   where s.page_id = p_page_id
     and s.row_index = c.row_index
     and s.col_index = c.col_index
     and s.id <> p_keep_id;
end;
$$;

comment on function public.clear_cells_for_slot(uuid, uuid, jsonb) is
  'Clear every listed cell on a page except one pocket, in one statement. For a multi-cell placement, so the clears cannot arrive after the write they were clearing for.';

revoke all on function public.move_slot_to_cell(uuid, uuid, integer, integer) from public;
revoke all on function public.swap_slot_cells(uuid, uuid, integer, integer, uuid, uuid, integer, integer) from public;
revoke all on function public.clear_cells_for_slot(uuid, uuid, jsonb) from public;
grant execute on function public.move_slot_to_cell(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.swap_slot_cells(uuid, uuid, integer, integer, uuid, uuid, integer, integer) to authenticated;
grant execute on function public.clear_cells_for_slot(uuid, uuid, jsonb) to authenticated;

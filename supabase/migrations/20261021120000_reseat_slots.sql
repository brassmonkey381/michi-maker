-- RESEAT MANY POCKETS IN ONE TRANSACTION, for Arrange (docs/ARRANGE.md).
--
-- Arrange rearranges a whole page or spread at once: up to 24 pockets change cell, some of them
-- crossing to the facing page. As separate requests that would be 24 transactions, each one a
-- chance to leave the server half way between two layouts; and the editor already learned
-- (20260923120000) that a sequence of single-pocket moves is how cards went missing.
--
-- One function, one statement, one transaction. unique (page_id, row_index, col_index) has been
-- DEFERRABLE INITIALLY DEFERRED since 20260906120000, so inside this statement pockets may trade
-- cells freely and the check runs at COMMIT on the final layout. Nothing is deleted: a move onto
-- an occupied cell is the caller's error and fails the whole reseat rather than clearing a pocket.
--
-- SECURITY INVOKER, like the other slot functions: binder_slots' own policies decide what the
-- caller may touch. Every pocket named must be updated, or the function raises and nothing lands;
-- a zero-row update here is RLS refusing, and a silent partial reseat would be the half-layout
-- this exists to prevent.

create or replace function public.reseat_slots(p_moves jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_wanted integer;
  v_moved integer;
begin
  select count(*) into v_wanted from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb));
  if v_wanted = 0 then
    return 0;
  end if;

  update public.binder_slots s
     set page_id = m.page_id, row_index = m.row_index, col_index = m.col_index
    from jsonb_to_recordset(p_moves) as m(id uuid, page_id uuid, row_index integer, col_index integer)
   where s.id = m.id;

  get diagnostics v_moved = row_count;
  if v_moved <> v_wanted then
    raise exception 'reseat: % of % pockets are not on the server', v_wanted - v_moved, v_wanted
      using errcode = 'P0002';
  end if;
  return v_moved;
end;
$$;

comment on function public.reseat_slots(jsonb) is
  'Arrange: move many pockets to new cells (and pages) in one transaction. p_moves = [{id, page_id, row_index, col_index}]. Raises if any pocket is not updatable.';

grant execute on function public.reseat_slots(jsonb) to authenticated;

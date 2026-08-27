-- tcgscan-app: a binder remembers its page shape, so a pocket has a row and a column.
--
-- Entries already record binder + page + storage_pos, where storage_pos is the pocket's index
-- within the page, row-major (slot = row * cols + col, the binder tracker's own arithmetic). That
-- is enough to say "page 4, pocket 7" and not enough to say "page 4, row 2, column 3", because
-- recovering row and column needs the number of COLUMNS and nothing recorded it: the scan infers
-- the grid per page and the review dropped it on the way to the collection.
--
-- The shape lives on the UNIT rather than on every entry. It describes the physical binder, which
-- is the thing a person would correct if we got it wrong, and it answers for pockets that hold no
-- card (drawing an empty page needs a grid that no entry can supply). The cost is the assumption
-- that one binder has one page shape; a binder mixing 9-pocket and 4-pocket pages will be right
-- about most of it and wrong about the odd page, which is why this is editable rather than
-- inferred once and frozen.
--
-- BACKFILL: every binder scanned before today was a 3 x 4 (owner-confirmed, 2026-08-27), and the
-- data agrees (slots 0..11 across five pages). Filling those in is what makes the existing 54
-- cards addressable rather than stranded at "pocket 7" forever. Stacks get nothing: a pile has no
-- rows.

alter table public.storage_units add column if not exists grid_rows integer;
alter table public.storage_units add column if not exists grid_cols integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'storage_units_grid_check') then
    alter table public.storage_units add constraint storage_units_grid_check
      check (
        (grid_rows is null and grid_cols is null)
        or (grid_rows between 1 and 12 and grid_cols between 1 and 12)
      );
  end if;
end $$;

comment on column public.storage_units.grid_cols is
  'Pockets across one page. storage_pos = row * grid_cols + col, so this is what turns a pocket '
  'index back into a row and a column. Null = unknown (never scanned, or a stack).';

-- Only binders, only where nothing is recorded yet: a unit whose shape someone has already
-- corrected must not be reset by a re-run.
update public.storage_units
   set grid_rows = 3, grid_cols = 4
 where kind = 'binder' and grid_rows is null and grid_cols is null;

-- A scanned binder page remembers its OWN shape, so a tcgscan binder is structurally the same
-- object as a michi binder.
--
-- THE MODEL WE ARE MIRRORING. michi's binder_pages carries `position` plus `rows`/`cols` NOT NULL
-- (20260707055603:69-81), and every slot carries row_index/col_index. Shape belongs to the PAGE.
-- Owner decision 2026-08-27: tcgscan binder sessions must be structurally recreatable in michi
-- one-for-one, so tcgscan needs a per-page shape too. The technical definitions may differ; the
-- structure may not.
--
-- WHAT WAS WRONG. tcgscan already infers a grid per page during a binder scan (binder-tracker's
-- BinderPage.grid) and StagedPick carries it to the review, and then submitPicks used it exactly
-- once, to stamp ONE unit-wide shape from the first pick that had one, and dropped the rest
-- (scan.tsx). storage_pos is `row * cols + col` computed against the PAGE's own grid but decoded
-- later against the UNIT's single grid, so a binder whose pages are not all the same shape
-- decodes to the wrong row and column. The information to fix it was captured and thrown away.
--
-- WHY ON THE ENTRY AND NOT A PAGES TABLE. A `storage_pages` table would mirror binder_pages
-- exactly, and would owe the full offline-sync tax: a fifth table in the Snap, the compact
-- mirror, the delta, fetchRemote/pushDelta/applyToLocal, realtime, and the merge fixtures. The
-- shape is small, immutable per page in practice, and every page that exists at all has at least
-- one card in it (a scan cannot record a page with no cards), so carrying it on the entry loses
-- nothing real and keeps pages derived. The unit-level grid stays as the fallback for entries
-- written before today.
--
-- BIRTH FIELDS, like scan_path and the placement triple beside them: written in the same addEntry
-- call that creates the row, never afterwards. Whole-row last-write-wins would erase a field
-- added later (see 20260828120000's header).
--
-- NO CHECK, deliberately, even though michi constrains rows/cols to 1..6 and a shape outside that
-- range cannot be drawn as a michi page. The sync push is one batch upsert per table and a single
-- rejected row poisons the queue indefinitely, so a range this client could plausibly produce
-- (grid inference has reported a phantom 3x5) must never be enforced here. The range belongs to
-- the export and to the editor, where refusing is visible and recoverable.

alter table public.portfolio_entries add column if not exists storage_rows integer;
alter table public.portfolio_entries add column if not exists storage_cols integer;

comment on column public.portfolio_entries.storage_cols is
  'Pockets across the PAGE this card sits on, at the time it was filed. storage_pos = row * '
  'storage_cols + col, so this is what turns a pocket index into a row and a column even when a '
  'binder mixes page shapes. Null = unknown (pre-2026-08-28 rows, non-binder, or an unresolved '
  'grid); fall back to storage_units.grid_cols.';

comment on column public.portfolio_entries.storage_rows is
  'Rows down the PAGE this card sits on. Recorded with storage_cols so a page can be redrawn '
  'whole (michi binder_pages.rows) rather than inferred from how many pockets happened to fill.';

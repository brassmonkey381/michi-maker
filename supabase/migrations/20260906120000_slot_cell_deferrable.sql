-- Swapping two pockets is one write, and the cell rule used to reject it half way through.
--
-- WHAT WENT WRONG. binder_slots has unique (page_id, row_index, col_index): one pocket per cell.
-- Postgres checks a plain unique constraint row by row, as each row of a statement is written.
-- So a single upsert that swaps pocket A into B's cell and B into A's cell fails on the FIRST
-- row: A now sits where B still is, and the statement is rejected before B ever moves. That is
-- exactly what a cross-page swap in the double-page editor sends (a whole-binder upsert), and
-- what an undo or redo of any swap sends (a per-page upsert). The client showed the swap, the
-- server refused it, and the "A change didn't save" banner asked for a reload.
--
-- THE FIX. Make the constraint DEFERRABLE INITIALLY DEFERRED: it is checked once, at commit, when
-- both pockets are in their final cells. Each PostgREST request is one transaction, so a batch
-- upsert that ends in a legal layout now succeeds, and one that does not is still refused as a
-- whole. Nothing else changes: the rule is the same, only the moment it is checked.
--
-- A deferrable unique constraint cannot serve as an ON CONFLICT arbiter, which is fine: every
-- upsert in this app resolves on the primary key (`onConflict: 'id'`), never on the cell.

alter table public.binder_slots
  drop constraint if exists binder_slots_page_id_row_index_col_index_key;

alter table public.binder_slots
  add constraint binder_slots_page_id_row_index_col_index_key
  unique (page_id, row_index, col_index) deferrable initially deferred;

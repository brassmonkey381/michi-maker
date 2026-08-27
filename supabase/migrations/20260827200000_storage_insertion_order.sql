-- tcgscan-app: how a stack's scan order maps onto the physical pile.
--
-- The first storage build assumed one habit: pull a card, read it, drop it on a discard pile, so
-- the FIRST card scanned ends up at the BOTTOM and the last on top. That is LIFO, and it is what
-- most riffling looks like.
--
-- It is not the only habit. Scanning a fresh pack by taking the front card, reading it, and
-- putting it to the BACK cycles the whole stack: after ten cards the first one is at the front
-- again and the pile is in its original order. There the first card scanned is the TOP of the
-- pile, not the bottom. Recording that session as LIFO inverts the box: every "where is this
-- card" answer is wrong by the height of the stack.
--
-- So a stack now says which it is, and storage_pos keeps ONE meaning either way: the distance
-- from the bottom of the pile (1 = bottom). Only the mapping from scan order to position flips.
-- A new session always lands ABOVE what the unit already holds; the setting decides whether,
-- within that session, the first card scanned is its deepest card or its topmost one.
--
-- Binders are unaffected: a page number is a page number whichever way you flip through.
--
-- 'lifo' is the default, which is what every row written before today already means.

alter table public.storage_units
  add column if not exists insertion_order text not null default 'lifo';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'storage_units_insertion_order_check'
  ) then
    alter table public.storage_units add constraint storage_units_insertion_order_check
      check (insertion_order in ('lifo', 'fifo'));
  end if;
end $$;

comment on column public.storage_units.insertion_order is
  'How scan order maps onto the pile. lifo = first card scanned is the BOTTOM (dropped on a '
  'discard pile). fifo = first card scanned is the TOP (front card moved to the back, cycling '
  'the stack back to its original order). storage_pos always counts from the bottom. Binders '
  'ignore this.';

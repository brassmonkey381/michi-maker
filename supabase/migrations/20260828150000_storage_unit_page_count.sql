-- A binder remembers how many pages it HAS, not merely how many hold cards.
--
-- THE DEFECT THIS CLOSES, documented as a known limit in tcgscan's storage-assign.ts since the
-- storage layer shipped. Binder sessions append by OFFSET: a session's page 1 becomes
-- (last existing page + 1). "Last existing page" was derived from the entries, and entries can
-- only represent a page that holds a card. So a session whose LAST page was entirely discarded
-- in review (every pocket a card we do not carry, or the page was blank) leaves nothing to carry
-- that page's number, and the NEXT session starts one page too low. Every page of every later
-- session is then off by one against the paper, permanently and silently: exactly the misalign-
-- ment the offset scheme exists to prevent, arriving through the one hole it could not see.
--
-- Holes in the MIDDLE were always fine, because a later page's entries carry the count past them.
-- Only the tail is invisible, and only until something records the reach.
--
-- page_count is that reach: the highest page number this binder has ever been scanned to,
-- including pages that ended up empty. Placement takes the greater of it and the entry-derived
-- maximum, so it can only ever push the next session FORWARD, never pull it back over pages that
-- already hold cards. A device that has never heard of the column contributes the entry-derived
-- answer, which is exactly today's behaviour: the two are safe to mix.
--
-- Not a birth field, unlike the entry columns beside it. It belongs to the unit and changes over
-- its life (every session extends it), so it rides the unit's ordinary whole-row last-write-wins
-- exactly like name, insertion_order and the grid. Two devices scanning the same binder offline
-- resolve to one of their two answers rather than the max; both are >= the entry-derived floor,
-- so the worst case is a gap in numbering, which the scheme already tolerates by design.
--
-- Nullable, no default, no CHECK: a rejected row poisons the whole sync batch (see 20260827130000).

alter table public.storage_units add column if not exists page_count integer;

comment on column public.storage_units.page_count is
  'Highest page number this binder has been scanned to, INCLUDING pages whose cards were all '
  'discarded. Placement uses max(page_count, highest page among entries), so a fully-discarded '
  'tail page no longer shifts the next session down one. Null = unknown (never scanned by a '
  'client that records it); the entry-derived maximum is then the whole answer, as before.';

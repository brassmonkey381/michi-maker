-- Which scan session filed this card.
--
-- WHAT IT UNLOCKS. A committed session is currently unrecoverable as a set: entries carry when the
-- scanner saw them (scanned_at) and where they went (storage_id/page/pos), and a session can be
-- guessed at by clustering timestamps. A guess is fine for a report and useless for an operation.
-- Owner 2026-08-29 wants to act on a session after the fact: re-sort the block it added, move the
-- pages it created onto different page numbers, debug what it did. Every one of those needs the
-- exact set, because acting on a set that is one card wrong is worse than not acting.
--
-- The session key already exists on the device (the review's own sessionKey, "s<base36>"), is
-- already carried to the write in SubmitDest, and was being dropped on the floor at exactly the
-- moment it could have been recorded.
--
-- A BIRTH FIELD, like scan_path and the placement columns beside it: written in the same addEntry
-- call that creates the row, never afterwards. Whole-row last-write-wins erases a field added
-- later (see 20260828120000's header), and a session id that some devices have and others do not
-- would make session operations act on partial sets, which is the one thing this exists to
-- prevent.
--
-- NOT UNIQUE, no FK, no CHECK: the key is minted on device, two devices can legitimately mint the
-- same one (it is a timestamp in base36, not a uuid), and a sync batch that can be rejected is a
-- sync batch that stops forever. Collisions cost a merged listing, which is visible and harmless;
-- a poisoned queue is neither.
--
-- Null means "filed before this shipped, or not by a batched session at all": every live add,
-- photo add, browse add and manual add has no session and never will. A sessions view shows what
-- it can and says so.

alter table public.portfolio_entries add column if not exists scan_session text;

comment on column public.portfolio_entries.scan_session is
  'The batched scan session that filed this lot (the review''s sessionKey). Groups a committed '
  'session exactly, so it can be re-sorted, re-placed or inspected as the set it was. Null for '
  'live/photo/browse/manual adds and for anything filed before 2026-08-29.';

-- The one query a sessions view makes: this user's sessions, newest first. Partial, because most
-- rows will never carry a session and there is no reason to index their absence.
create index if not exists portfolio_entries_session_idx
  on public.portfolio_entries (user_id, scan_session) where scan_session is not null;

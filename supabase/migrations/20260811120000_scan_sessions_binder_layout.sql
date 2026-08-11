-- scan_sessions: the digital binder a run reconstructed, as the DEVICE understood it live.
--
-- WHY A COLUMN AND NOT A DERIVATION. Everything else about a run is re-derivable from the frames,
-- and deliberately so. This is not: it is the loop's OWN answer to "what binder did I just look at",
-- produced online from evidence that no longer exists by the time the analysis runs (which pockets
-- it was tracking, when it decided a page had turned, what it had pooled per pocket at that moment).
-- Re-deriving it offline answers a different question - what a BETTER segmenter would have found -
-- and conflating the two is exactly how a loop bug hides behind a good offline reconstruction.
--
-- SHAPE (documented, not constrained; a new field should not need a migration):
--   {
--     "grid":  { "rows": 3, "cols": 4 },        -- inferred, per page (a page may differ)
--     "pages": [
--       { "index": 1,
--         "from_seq": 5, "to_seq": 14,          -- the frame range the page was on screen
--         "frames": 10,
--         "grid": { "rows": 3, "cols": 4 },
--         "slots": [
--           { "slot": 0, "row": 0, "col": 0,
--             "card_id": "226383",              -- pooled winner, null if the slot never resolved
--             "score": 0.71,                    -- pooled evidence, mean per look
--             "margin": 0.06,                   -- lead over the runner-up, mean per look
--             "looks": 9,                       -- frames this pocket was detected in
--             "committed": true,                -- did it actually reach the collection
--             "box": { "ymin": .., "xmin": .., "ymax": .., "xmax": .. }   -- mean, normalized
--           }, ...
--         ] }, ...
--     ]
--   }
--
-- Nullable and additive. Null means the run predates binder tracking, or was a riffle, or was a
-- binder run in which no page ever resolved - all three are legitimately "no binder here".

alter table public.scan_sessions
  add column if not exists binder_layout jsonb;

comment on column public.scan_sessions.binder_layout is
  'The digital binder the live loop reconstructed: pages, inferred grid shape, and the pooled '
  'best card per pocket, with the frame range each page was on screen. The DEVICE''s own live '
  'understanding, not an offline reconstruction - the two answer different questions and the '
  'difference between them is the loop bug. Shape documented in the migration, not constrained. '
  'Null for riffles, pre-tracking runs, and binder runs where no page resolved.';

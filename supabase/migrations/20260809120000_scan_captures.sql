-- Full per-capture detection record for ML training (app project piikwvntldytjejxmcla).
--
-- Today's scan_feedback (20260715120000) only stores a row for a card a HUMAN confirmed or
-- corrected — so auto-added cards, low-confidence detections, and anything the user didn't touch
-- leave no trace, and the OD's complete per-frame output is never persisted. That makes both the
-- review report and OD training incomplete (you can't audit misses OR false positives from a
-- subset). This table fixes that at the source: ONE row per image capture, with EVERY detection
-- the detector produced and what became of it.
--
-- Two producers, distinguished by `source`:
--   'live'       — written by the app at scan time; dispositions are the REAL user outcomes.
--   'redetected' — reconstructed offline by the backfill (re-running OD+embedder on a stored frame).
--                  Human-confirmed labels are carried over from scan_feedback by IOU match; every
--                  other box's disposition is INFERRED from current-model confidence, not the real
--                  session — good detector/box training data, not a trusted recognition label.
--
-- Storage: the single full frame (and any per-detection crops) live in the existing PRIVATE
-- `scan-feedback` bucket under `<uid>/<capture_id>-*.jpg` — the bucket's owner-prefix policies
-- already cover that path, so no new bucket is needed. Training reads via the service role (bypasses
-- RLS + private bucket), exactly like scan_feedback.
--
-- Idempotent (safe to re-run / safe if an earlier version was already applied): if-not-exists table,
-- add-column-if-not-exists for later columns, drop-then-create policies.

create table if not exists public.scan_captures (
  id              uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL: a capture is training data and outlives the account that made it
  -- (same stance as scan_feedback.owner_id).
  owner_id        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  -- The ONE full uncropped frame for this capture (uploaded once, unlike scan_feedback which
  -- re-uploads it per corrected card). Bucket key in `scan-feedback`.
  full_path       text,
  model_set       text,        -- embedder set, e.g. 'v3-e95'
  od_set          text,        -- detector set, e.g. 'od-v3'
  platform        text,        -- 'ios' | 'android' | 'web' — deployment domain matters for training
  -- EVERY detection the OD produced for this frame, in detector order. Each element:
  --   {
  --     "box":         { "ymin":n, "xmin":n, "ymax":n, "xmax":n },   -- normalized 0..1
  --     "score":       number,                                       -- OD objectness/confidence
  --     "candidates":  [ { "cardId":"123", "similarity":n, "index":n }, ... ],  -- embedder top-K
  --     "disposition": "auto_added"|"confirmed"|"corrected"|"skipped"|"low_confidence"|"unresolved",
  --     "final_card_id": "123" | null,     -- what it was recorded as (null if not added)
  --     "crop_path":   "<uid>/<capture_id>-detN-crop.jpg" | null     -- optional per-box crop
  --   }
  -- Shape is documented, not constrained, so the client can evolve dispositions without a migration.
  detections      jsonb not null default '[]'::jsonb,
  -- Cheap denormalized count for filtering/reporting ("multi-card frames", "empty captures").
  detection_count integer generated always as (jsonb_array_length(detections)) stored
);

-- Later columns via add-if-not-exists so this migration also upgrades a table created by an earlier
-- version of the file (before `source` existed).
alter table public.scan_captures
  add column if not exists source        text not null default 'live'
    check (source in ('live', 'redetected'));
alter table public.scan_captures
  add column if not exists redetected_at timestamptz;   -- when a 'redetected' row was backfilled; null for live
alter table public.scan_captures
  add column if not exists reviewed_at   timestamptz;   -- set once a human reviews the capture in the tool; excludes it from the next report

comment on table public.scan_captures is
  'One row per scan image capture with EVERY OD detection + disposition. source=live (app, real outcomes) or redetected (offline backfill, inferred). Superset of scan_feedback; feeds the review tool + training. Read for training via the service role.';

create index if not exists scan_captures_owner_created_idx  on public.scan_captures (owner_id, created_at desc);
create index if not exists scan_captures_created_idx        on public.scan_captures (created_at desc);
create index if not exists scan_captures_odset_idx          on public.scan_captures (od_set);
create index if not exists scan_captures_source_created_idx on public.scan_captures (source, created_at desc);
-- The review tool reads only unreviewed captures — a partial index keeps that query fast as the
-- reviewed pile grows.
create index if not exists scan_captures_unreviewed_idx on public.scan_captures (created_at desc) where reviewed_at is null;

alter table public.scan_captures enable row level security;

-- Owner-scoped, append-only from the client (no update/delete policy — the ledger is immutable
-- client-side, same as scan_feedback / analytics_events). The studio/training path uses service role.
drop policy if exists "own scan_captures insert" on public.scan_captures;
create policy "own scan_captures insert" on public.scan_captures
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "own scan_captures select" on public.scan_captures;
create policy "own scan_captures select" on public.scan_captures
  for select to authenticated using ((select auth.uid()) = owner_id);

grant select, insert on public.scan_captures to authenticated;

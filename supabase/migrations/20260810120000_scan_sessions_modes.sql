-- scan_sessions: experiment mode, the loop parameters in effect, and dropped-frame accounting.
--
-- WHY. The capture is meant to be RE-DERIVED against offline: pull the raw per-frame signal and
-- replay alternative tracking/fusion policies over it. Two things were missing for that.
--
--   1. `params` — the tuning constants the loop actually ran with (confidence thresholds, topK,
--      re-arm window, sticky-frame count, cadence). Without them a recording cannot be replayed,
--      and worse, the shipped policy's own result cannot be reproduced — so a re-derived strategy
--      has no baseline to beat. Recorded per session because they are constant for a run.
--
--   2. `mode` — which experiment a run belongs to. A binder flip is 9 static cards dwelling for
--      seconds, scored on precision/recall over a grid. A riffle is one card at a time entering
--      and leaving fast, where the failure modes are double-adds and cards missed entirely, and
--      the metric is a multiset with duplicates. Same capture mechanism, different ground truth
--      and different scoring, so the analysis has to be able to filter.
--
--   3. `dropped_frames` — the upload queue drops its tail under a stalled uplink. For a binder
--      that is a small gap; in a riffle the dropped frames ARE the events being studied, so a
--      recording that silently lost some is not safe to score. Persist the count so the harness
--      can refuse to score a lossy run instead of quietly under-reporting recall.
--
-- All nullable and additive; existing sessions and the 'redetected' backfill are untouched.

alter table public.scan_sessions
  add column if not exists mode text;

-- Documented, not constrained: a new experiment should not need a migration. Known values today
-- are 'binder_flip' and 'ruffle'; null means a run recorded before modes existed.
comment on column public.scan_sessions.mode is
  'Which experiment this run belongs to (binder_flip | ruffle). Null for pre-mode recordings.';

alter table public.scan_sessions
  add column if not exists params jsonb;

comment on column public.scan_sessions.params is
  'The loop tuning constants in effect for this run, e.g. {detectionThreshold, similarityThreshold, '
  'confidenceMargin, topK, rearmMs, stickyFrames, gapMs, maxCards}. Required to replay the run '
  'offline and to reproduce the shipped policy as a baseline. Shape documented, not constrained.';

alter table public.scan_sessions
  add column if not exists dropped_frames integer;

comment on column public.scan_sessions.dropped_frames is
  'Frames the upload queue dropped under backpressure. Greater than zero means the recording has '
  'gaps and recall figures from it are a floor, not a measurement.';

create index if not exists scan_sessions_mode_created_idx
  on public.scan_sessions (mode, created_at desc)
  where mode is not null;

-- ── scan_captures: per-pass timing ───────────────────────────────────────────────────────────────
-- Its own column rather than a key inside `detections`, because "how many looks would a faster loop
-- have had at this card" is a per-frame question asked across a whole run, and that reads far better
-- as a column than as a probe into every row's array payload.
alter table public.scan_captures
  add column if not exists timing jsonb;

comment on column public.scan_captures.timing is
  'Per-pass wall time: {inference_ms, gap_ms}. gap_ms is null on the first frame of a session. '
  'Detect+embed+match latency is the cadence ceiling, and therefore how many looks a fast-moving '
  'card gets at all - the binding constraint for riffle scanning.';

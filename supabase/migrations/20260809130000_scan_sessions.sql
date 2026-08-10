-- scan_sessions — a temporal grouping over scan_captures for the live-loop experiment.
--
-- WHY. scan_captures is one row per frame; on its own it has no notion that a run of frames is a
-- single continuous camera pass over a binder. The live-loop research (accurately track each card's
-- box across frames and fuse its classification over time) needs the frames of ONE pass tied
-- together and ordered, plus a place to hang the human ground truth for that pass. This migration
-- adds that grouping without disturbing the existing per-frame ledger:
--   * a scan_sessions row per recorded pass (device, timing, model/detector sets, a human label,
--     and a ground_truth blob filled in later during curation);
--   * session_id / seq / captured_at on scan_captures, so a session's frames reconstruct in the
--     exact order and timing the device saw them. All three are NULLABLE — existing live captures
--     and every 'redetected' backfill row keep working untouched (session_id stays null).
--
-- Storage is unchanged: frames still live in the private 'scan-feedback' bucket under <uid>/...,
-- and the offline curation/training tools read cross-project via the service role. RLS keeps a user
-- to their own sessions; sessions are owner-updatable (unlike the append-only captures ledger) so
-- the app can stamp ended_at / frame_count when a pass finishes and curation can attach ground_truth.

-- ── scan_sessions ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.scan_sessions (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL: a recorded session outlives the account, same as the captures it
  -- groups, so the run stays usable as training/eval data if the user later deletes their account.
  owner_id     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Stamped by the app when the pass stops (idle, manual, or error); null while a session is open.
  ended_at     timestamptz,
  platform     text,                       -- 'ios' | 'android' | 'web'
  model_set    text,                       -- embedder set, e.g. 'v3-e95'
  od_set       text,                       -- detector set, e.g. 'od-v3'
  -- A human-friendly name for the run, e.g. 'Binder A · pages 1-5'. Free text, set by the operator.
  label        text,
  note         text,
  -- The curated ground truth for this pass, attached offline (service role). Shape is documented,
  -- not constrained, so the curation format can evolve without a migration — e.g.
  --   { "cards": [ { "slot": "p1r1c1", "card_id": "123", "name": "..." }, ... ],
  --     "page_count": 5, "cards_per_page": 9 }
  ground_truth jsonb,
  -- Denormalized counts the app fills in as the run ends; cheap headers for the review UI.
  frame_count  integer,
  card_count   integer
);

comment on table public.scan_sessions is
  'One continuous live-scan pass (the binder-flip experiment). Groups + orders scan_captures via '
  'scan_captures.session_id/seq and holds the curated ground_truth for offline strategy eval.';

alter table public.scan_sessions enable row level security;

-- Owner-scoped, and (unlike scan_captures) UPDATE-able by the owner: the app stamps ended_at /
-- frame_count when the pass finishes. ground_truth is attached later by the service role, which
-- bypasses RLS. No DELETE policy — sessions are kept.
drop policy if exists "own scan_sessions insert" on public.scan_sessions;
create policy "own scan_sessions insert" on public.scan_sessions
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "own scan_sessions select" on public.scan_sessions;
create policy "own scan_sessions select" on public.scan_sessions
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "own scan_sessions update" on public.scan_sessions;
create policy "own scan_sessions update" on public.scan_sessions
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert, update on public.scan_sessions to authenticated;

create index if not exists scan_sessions_owner_created_idx
  on public.scan_sessions (owner_id, created_at desc);

-- ── scan_captures: attach to a session, ordered ────────────────────────────────────────────────────
-- All nullable; add-if-not-exists so re-running is safe and pre-session rows are untouched.
alter table public.scan_captures
  add column if not exists session_id  uuid references public.scan_sessions(id) on delete set null;
alter table public.scan_captures
  add column if not exists seq          integer;   -- frame index within the session, 0-based
alter table public.scan_captures
  add column if not exists captured_at  timestamptz; -- device capture time (real per-frame timing;
                                                     -- created_at is the server insert time, which
                                                     -- background uploads can reorder)

-- The analysis harness pulls one session's frames in order; this serves that query directly.
create index if not exists scan_captures_session_seq_idx
  on public.scan_captures (session_id, seq)
  where session_id is not null;

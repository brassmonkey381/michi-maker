-- scan session deletion — make deleting a session actually delete its frames.
--
-- WHAT WAS WRONG. Three separate half-links, and no mechanism joining them:
--   * scan_captures.session_id was ON DELETE SET NULL, so deleting a session ORPHANED its frame
--     rows rather than removing them. The offline tool worked around it by hand, deleting captures
--     first and sessions second (backfill/tools/scan-session-delete.mjs).
--   * scan_sessions had no DELETE policy at all ("sessions are kept"), so a user could never
--     remove their own.
--   * Storage has no foreign key to anything. Deleting every row in Postgres left every JPEG in
--     the private scan-feedback bucket exactly where it was — scan-session-delete.mjs says so in
--     its closing note: "They are orphaned and harmless."
--
-- Harmless while the only frames are the developer's own. Not harmless the moment real users opt
-- in to sharing scans: those objects are identity-linked (the storage key starts with the user id)
-- and an erasure request that leaves them behind is not an erasure.
--
-- HOW IT WORKS NOW. Deleting a scan_sessions row:
--   1. fires a BEFORE DELETE trigger that snapshots every known object key into a queue table;
--   2. cascades to scan_captures (the rows, not the objects);
--   3. leaves the objects for a janitor to remove through the Storage API.
--
-- WHY A QUEUE AND NOT A DIRECT DELETE. Objects in Supabase Storage must be removed through the
-- Storage API, not by deleting rows from storage.objects — a SQL delete there leaves the actual
-- files behind in the backing store, which would trade a visible orphan for an invisible one. So
-- the database cannot do this itself, and whatever does it is a network call that can fail halfway.
-- A queue makes that survivable: the intent is recorded durably at the moment of deletion, retried
-- until it succeeds, and auditable afterwards — which is exactly what an erasure request needs to
-- be able to demonstrate. Deleting inline from the client instead would put the durability of an
-- erasure on a phone that can be backgrounded mid-request.
--
-- WHY NOT GARBAGE-COLLECT BY ABSENCE (sweep the bucket, delete objects whose session is gone).
-- It costs a full bucket scan that grows with adoption, and it deletes by INFERENCE rather than by
-- recorded intent — no trail of who asked for what, when. Worse here specifically: session frames
-- share their uid folder with scan_feedback correction photos, which are irreplaceable training
-- data under a different retention stance. One wrong regex and the sweeper eats them.
--
-- Idempotent, per the convention in this directory: if-not-exists, drop-then-create.

-- ── 1. captures die with their session ───────────────────────────────────────────────────────────
-- Was ON DELETE SET NULL. That stance came from scan_captures.owner_id, where it is still correct
-- (a capture outlives the ACCOUNT that made it). A session is different: it is not a person, it is
-- a grouping, and a capture whose session was deleted is not anonymised training data — it is a
-- fragment with no ground truth, no ordering and no policy context. The 'redetected' backfill rows
-- keep session_id null and are untouched by this.
do $$
declare fk text;
begin
  select conname into fk
    from pg_constraint
   where conrelid = 'public.scan_captures'::regclass
     and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.scan_captures'::regclass
                            and attname = 'session_id')];
  if fk is not null then
    execute format('alter table public.scan_captures drop constraint %I', fk);
  end if;
end $$;

alter table public.scan_captures
  add constraint scan_captures_session_id_fkey
  foreign key (session_id) references public.scan_sessions(id) on delete cascade;

-- ── 2. the deletion queue ────────────────────────────────────────────────────────────────────────
-- Service-role only: RLS on, and deliberately ZERO policies and ZERO grants. Nothing but the
-- janitor (which bypasses RLS) can read or write it. It records what a user asked to have erased,
-- which is itself worth not exposing.
create table if not exists public.scan_storage_deletions (
  id           bigint generated always as identity primary key,
  session_id   uuid not null,
  -- The '<uid>' folder the objects live under. Taken from owner_id when it is still there, and
  -- otherwise recovered from a stored key — a session whose account was already deleted (owner_id
  -- SET NULL) still has frames to remove, and that is the case most likely to matter.
  owner_prefix text,
  -- Exact keys known at enqueue time. A belt: the janitor also LISTS, because an upload whose row
  -- insert failed leaves an object no row ever pointed at.
  paths        text[],
  enqueued_at  timestamptz not null default now(),
  attempts     int not null default 0,
  last_error   text,
  done_at      timestamptz
);

comment on table public.scan_storage_deletions is
  'Durable queue of scan-feedback objects to remove after a scan_sessions row was deleted. Drained '
  'by the scan-janitor edge function through the Storage API (objects cannot be deleted in SQL).';

alter table public.scan_storage_deletions enable row level security;

-- The janitor claims work with `done_at is null` ordered by id; this serves that directly.
create index if not exists scan_storage_deletions_pending_idx
  on public.scan_storage_deletions (id)
  where done_at is null;

-- ── 3. enqueue on delete ─────────────────────────────────────────────────────────────────────────
-- BEFORE DELETE, not AFTER: the cascade in step 1 removes the capture rows as part of this same
-- statement, and their full_path values are the only record of which objects exist. After the
-- cascade there is nothing left to snapshot.
create or replace function public.enqueue_scan_storage_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths text[];
begin
  select array_agg(full_path) filter (where full_path is not null)
    into v_paths
    from public.scan_captures
   where session_id = old.id;

  insert into public.scan_storage_deletions (session_id, owner_prefix, paths)
  values (
    old.id,
    coalesce(old.owner_id::text, split_part(v_paths[1], '/', 1)),
    v_paths
  );
  return old;
end $$;

drop trigger if exists scan_sessions_enqueue_storage_delete on public.scan_sessions;
create trigger scan_sessions_enqueue_storage_delete
  before delete on public.scan_sessions
  for each row execute function public.enqueue_scan_storage_deletion();

-- ── 4. a user may delete their own sessions ──────────────────────────────────────────────────────
-- Reverses "No DELETE policy — sessions are kept" from 20260809130000. That stance was written when
-- the only sessions were the developer's; it cannot survive users opting in to share scans, because
-- withdrawing consent has to be able to take the data with it.
--
-- No matching policy is needed on scan_captures: the cascade runs as the table owner during
-- referential integrity, which does not consult RLS. The append-only captures ledger stays
-- append-only for clients.
drop policy if exists "own scan_sessions delete" on public.scan_sessions;
create policy "own scan_sessions delete" on public.scan_sessions
  for delete to authenticated using ((select auth.uid()) = owner_id);

grant delete on public.scan_sessions to authenticated;

-- ── 5. drain the queue on a schedule ─────────────────────────────────────────────────────────────
-- Guarded exactly like the reclaim job in 20260721120000: pg_cron is already enabled on this
-- project, pg_net is NOT yet. Enable pg_net (Dashboard -> Database -> Extensions), store the
-- janitor secret in Vault, then re-run this block. Until then the queue simply accumulates and can
-- be drained by invoking the function by hand — pending work is never lost, only deferred.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not enabled — scan-storage janitor NOT scheduled.';
  elsif not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net not enabled — scan-storage janitor NOT scheduled. Enable pg_net, add the '
                 'vault secret scan_janitor_secret, and re-run this block.';
  elsif not exists (select 1 from vault.decrypted_secrets where name = 'scan_janitor_secret') then
    raise notice 'vault secret scan_janitor_secret missing — scan-storage janitor NOT scheduled.';
  else
    perform cron.unschedule('scan-storage-janitor')
      where exists (select 1 from cron.job where jobname = 'scan-storage-janitor');
    perform cron.schedule('scan-storage-janitor', '*/10 * * * *', $j$
      select net.http_post(
        url     := 'https://piikwvntldytjejxmcla.supabase.co/functions/v1/scan-janitor',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-janitor-secret',
                     (select decrypted_secret from vault.decrypted_secrets
                       where name = 'scan_janitor_secret')),
        body    := '{}'::jsonb);
    $j$);
  end if;
end $$;

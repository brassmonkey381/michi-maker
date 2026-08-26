/**
 * scan-janitor — removes the storage objects belonging to deleted scan sessions.
 *
 *  POST {} → { ok: true, claimed: n, objectsRemoved: n, failed: n }
 *
 * WHY A FUNCTION AND NOT A TRIGGER. Objects in Supabase Storage have to be removed through the
 * Storage API; deleting rows from `storage.objects` in SQL leaves the actual files behind in the
 * backing store. So the database can record the INTENT to erase (it does — a BEFORE DELETE trigger
 * on scan_sessions fills public.scan_storage_deletions) but it cannot carry it out. This drains
 * that queue.
 *
 * CALLED BY pg_cron every 10 minutes, and safe to invoke by hand at any time. It is idempotent:
 * a row already stamped `done_at` is never claimed again, and removing an object that is already
 * gone is not an error in the Storage API. Re-running after a partial failure resumes.
 *
 * ── Two layouts, both handled ─────────────────────────────────────────────────────────────────
 * Frames were originally uploaded FLAT inside the user's folder, with the session id as a filename
 * prefix:
 *     <uid>/<session_id>-f0000-full.jpg
 * and are now uploaded into a folder per session:
 *     <uid>/<session_id>/f0000-full.jpg
 * Both are swept: the snapshotted `paths` cover whatever the capture rows recorded, and then the
 * bucket is LISTED two ways — by search within the uid folder (catches the flat layout) and by the
 * session folder prefix (catches the nested one) — until both come back empty. The listing pass is
 * not redundant with `paths`: an upload whose row insert failed leaves an object that no row ever
 * pointed at, and that object is exactly as identity-linked as the rest.
 *
 * ── What it will not do ───────────────────────────────────────────────────────────────────────
 * It only ever removes keys that match a session's own frames. `scan-feedback` correction photos
 * live in the SAME uid folders under a different naming scheme and are held under a different
 * retention stance; the search terms here are session ids, so those are never in scope. A blind
 * "delete everything under <uid>" would be simpler and would eat them.
 *
 * A failure is recorded (`attempts`, `last_error`) and retried on the next run, up to MAX_ATTEMPTS,
 * after which the row is left pending-but-unclaimed for a human. It is never silently dropped: the
 * whole point of the queue is that an erasure request cannot evaporate.
 *
 * Auth: JWT verification is OFF (the caller is pg_cron, which has no user). Access is gated on a
 * shared secret in the `x-janitor-secret` header, matched against SCAN_JANITOR_SECRET. Deploy with
 *     supabase functions deploy scan-janitor --no-verify-jwt
 *
 * Secrets: SCAN_JANITOR_SECRET, plus APP_SECRET_KEY (see _shared/keys.ts).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { secretKey } from '../_shared/keys.ts';

const BUCKET = 'scan-feedback';
/** Storage remove() takes up to 1,000 keys per call. */
const REMOVE_CHUNK = 1000;
/** list() pages at 100; drain rather than page, because each removal shifts the listing. */
const LIST_PAGE = 100;
/** Runaway guard on the drain loop, not an expected limit: 100 rounds = 10k objects per listing. */
const MAX_ROUNDS = 100;
/** Sessions claimed per invocation. Cron runs every 10 minutes; a backlog drains across runs. */
const BATCH = 25;
/** After this many failures the row stops being claimed and waits for a human. */
const MAX_ATTEMPTS = 8;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface QueueRow {
  id: number;
  session_id: string;
  owner_prefix: string | null;
  paths: string[] | null;
  attempts: number;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const expected = Deno.env.get('SCAN_JANITOR_SECRET');
  if (!expected) return json({ error: 'not_configured' }, 500);
  if (req.headers.get('x-janitor-secret') !== expected) return json({ error: 'forbidden' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { persistSession: false },
  });

  const { data: rows, error: claimErr } = await admin
    .from('scan_storage_deletions')
    .select('id, session_id, owner_prefix, paths, attempts')
    .is('done_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('id', { ascending: true })
    .limit(BATCH);

  if (claimErr) {
    console.error('[scan-janitor] claim failed', claimErr);
    return json({ error: 'claim_failed' }, 500);
  }

  let objectsRemoved = 0;
  let failed = 0;

  for (const row of (rows ?? []) as QueueRow[]) {
    try {
      objectsRemoved += await eraseSession(admin, row);
      const { error } = await admin
        .from('scan_storage_deletions')
        .update({ done_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id);
      if (error) throw error;
    } catch (e) {
      failed += 1;
      const message = e instanceof Error ? e.message : String(e);
      console.error('[scan-janitor] session', row.session_id, 'failed', message);
      // Bump attempts so a permanently broken row eventually stops being retried, rather than
      // occupying a claim slot every ten minutes forever.
      await admin
        .from('scan_storage_deletions')
        .update({ attempts: row.attempts + 1, last_error: message.slice(0, 500) })
        .eq('id', row.id);
    }
  }

  console.log(`[scan-janitor] claimed=${rows?.length ?? 0} removed=${objectsRemoved} failed=${failed}`);
  return json({ ok: true, claimed: rows?.length ?? 0, objectsRemoved, failed });
});

/**
 * Remove every object belonging to one deleted session. Throws on the first storage error, which
 * leaves the row pending — a partial erase that reports success is the one outcome worth avoiding.
 */
async function eraseSession(
  admin: ReturnType<typeof createClient>,
  row: QueueRow,
): Promise<number> {
  let removed = 0;

  // 1. The keys the capture rows recorded. Cheapest and most precise pass; usually removes
  //    everything, leaving the listings below to confirm rather than to find.
  const known = (row.paths ?? []).filter(Boolean);
  for (let i = 0; i < known.length; i += REMOVE_CHUNK) {
    const chunk = known.slice(i, i + REMOVE_CHUNK);
    const { error } = await admin.storage.from(BUCKET).remove(chunk);
    if (error) throw error;
    removed += chunk.length;
  }

  // Without a uid folder there is nothing to list — a session with no owner_id and no stored path
  // has no recoverable prefix. The known-paths pass above was the whole job.
  if (!row.owner_prefix) return removed;

  // 2. Flat legacy layout: <uid>/<session_id>-f0000-full.jpg. `search` filters within the folder,
  //    so a session id finds exactly its own frames and never a scan_feedback photo.
  removed += await drain(admin, row.owner_prefix, row.session_id, (name) => `${row.owner_prefix}/${name}`);

  // 3. Nested layout: <uid>/<session_id>/f0000-full.jpg — the whole folder is this session's.
  const folder = `${row.owner_prefix}/${row.session_id}`;
  removed += await drain(admin, folder, undefined, (name) => `${folder}/${name}`);

  return removed;
}

/** List-and-remove until the listing comes back empty. */
async function drain(
  admin: ReturnType<typeof createClient>,
  prefix: string,
  search: string | undefined,
  key: (name: string) => string,
): Promise<number> {
  let removed = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data: files, error } = await admin.storage
      .from(BUCKET)
      .list(prefix, search ? { limit: LIST_PAGE, search } : { limit: LIST_PAGE });
    if (error) throw error;
    if (!files?.length) break;
    // list() also reports pseudo-folders, which have no id and cannot be removed by key. In the
    // flat-layout pass that is the session's own folder showing up beside its files; skipping it
    // is correct, because pass 3 handles that folder's contents directly.
    const paths = files.filter((f) => f.id !== null).map((f) => key(f.name));
    if (!paths.length) break;
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
    if (rmErr) throw rmErr;
    removed += paths.length;
  }
  return removed;
}

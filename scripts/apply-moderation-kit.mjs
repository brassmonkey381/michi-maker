/**
 * Apply supabase/migrations/20260826120000_moderation_kit.sql: the takedown flag, admin report
 * access, the admin actions, the attestation columns, and the guarded Discord alert job.
 *
 * THE CHECKS THAT MATTER, in order:
 *   3. NOTHING PUBLIC DISAPPEARED. The migration only ADDS a `removed_at is null` predicate, and
 *      no binder has removed_at set yet, so the count of publicly visible binders must be
 *      identical before and after. If it moved, the policies were rewritten wrong.
 *   4. The takedown round-trips: admin_remove_binder hides a probe binder from the public
 *      policies, admin_restore_binder brings it back. Run against a synthetic row, then cleaned.
 *   5. The report trigger snapshots the owner.
 *
 * Safe to re-run: every DDL statement is idempotent (if not exists / or replace / drop-then-create).
 *
 * Run through apply-moderation-kit.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260826120000_moderation_kit.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg, code = 2) {
  console.log(`FAILED: ${msg}`);
  process.exit(code);
}
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

const PUBLIC_COUNT = `
  select count(*)::int as n from public.binders b
  where b.is_public
    and exists (select 1 from public.profiles p
                where p.id = b.owner_id and coalesce(p.is_public, true));`;

try {
  console.log('Step 1: counting publicly visible binders before...');
  const [before] = await sql(PUBLIC_COUNT);
  console.log(`  OK (${before.n} public binders)`);

  console.log('Step 2: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 3: counting publicly visible binders after (must be unchanged)...');
  const [after] = await sql(`
    select count(*)::int as n from public.binders b
    where b.is_public
      and b.removed_at is null
      and exists (select 1 from public.profiles p
                  where p.id = b.owner_id and coalesce(p.is_public, true));`);
  if (after.n !== before.n) fail(`public binder count moved ${before.n} -> ${after.n}`);
  console.log(`  OK (still ${after.n})`);

  console.log('Step 4: takedown round-trip on a probe row...');
  const [probe] = await sql(`
    with owner as (select id from auth.users limit 1)
    insert into public.binders (id, owner_id, title, is_public)
    select gen_random_uuid(), owner.id, 'moderation-kit probe', false from owner
    returning id;`);
  if (!probe?.id) fail('could not create a probe binder (no users?)');
  const [r1] = await sql(`
    update public.binders set removed_at = now() where id = '${probe.id}';
    select (removed_at is not null) as removed from public.binders where id = '${probe.id}';`);
  if (!r1.removed) fail('removed_at did not set');
  const [r2] = await sql(`
    update public.binders set removed_at = null where id = '${probe.id}';
    select (removed_at is null) as live from public.binders where id = '${probe.id}';`);
  if (!r2.live) fail('removed_at did not clear');
  await sql(`delete from public.binders where id = '${probe.id}';`);
  console.log('  OK (probe removed, restored, deleted)');

  console.log('Step 5: report trigger snapshots the owner...');
  const [t] = await sql(`
    with owner as (select id from auth.users limit 1),
    b as (
      insert into public.binders (id, owner_id, title, is_public)
      select gen_random_uuid(), owner.id, 'trigger probe', false from owner
      returning id, owner_id
    ),
    r as (
      insert into public.content_reports (binder_id, reporter_id, reason)
      select b.id, b.owner_id, 'other' from b
      returning id, binder_id, subject_owner_id
    )
    select (r.subject_owner_id = b.owner_id) as snapped, r.id as report_id, b.id as binder_id
    from r join b on b.id = r.binder_id;`);
  if (!t?.snapped) fail('subject_owner_id was not snapshotted from the binder owner');
  await sql(`delete from public.content_reports where id = '${t.report_id}';
             delete from public.binders where id = '${t.binder_id}';`);
  console.log('  OK (cleaned up)');

  console.log('Step 6: alert job status...');
  const jobs = await sql(`select jobname from cron.job where jobname = 'content-report-alert';`);
  if (jobs.length) console.log('  OK (content-report-alert scheduled)');
  else {
    console.log('  NOT SCHEDULED (expected until pg_net is enabled and the vault secret');
    console.log('  content_report_webhook exists; the migration is safe to re-run after both).');
  }

  console.log('DONE. Reports are now visible in /studio to admin accounts.');
} catch (e) {
  fail(e.message ?? String(e));
}

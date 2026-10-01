/**
 * Apply supabase/migrations/20260925120000_scan_path_keep.sql to the live user-data project, so a
 * scan path written late (tcgscan-app lib/scan-hold) cannot be nulled by a stale device's push.
 *
 * Step 3 proves it on a real row INSIDE A ROLLED-BACK BLOCK: it nulls one entry's scan_path and
 * checks the trigger put it back with updated_at moved on, then raises to roll everything back.
 * Nothing is left changed.
 *
 * Run through tcgscan/apply-scan-path-keep.ps1, which loads the token without printing it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla'; // tcgscan-michi-maker (user data)
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260925120000_scan_path_keep.sql');

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
  if (!res.ok) {
    const err = new Error(`${res.status} ${text.slice(0, 400)}`);
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : [];
}

console.log('Step 1: reading the migration...');
let migration;
try {
  migration = readFileSync(MIGRATION, 'utf8');
} catch (e) {
  fail(`cannot read ${MIGRATION}: ${e.message}`);
}
console.log(`  OK (${(migration.length / 1024).toFixed(1)} KB)`);

console.log('Step 2: applying the migration...');
try {
  await sql(migration);
  const [row] = await sql(`
    select count(*)::int as n from pg_trigger
    where tgname = 'portfolio_entries_keep_scan_path' and not tgisinternal
  `);
  if (row.n !== 1) fail(`trigger not found after apply (count ${row.n})`, 3);
  console.log('  OK (trigger portfolio_entries_keep_scan_path is in place)');
} catch (e) {
  fail(`apply: ${e.message}`, 3);
}

console.log('Step 3: proving it on a real row, rolled back...');
try {
  await sql(`
    do $$
    declare r record; kept text; stamp timestamptz;
    begin
      select id, user_id, scan_path, updated_at into r
        from public.portfolio_entries where scan_path is not null limit 1;
      if r.id is null then raise exception 'NO_ROW_WITH_A_PATH'; end if;
      update public.portfolio_entries set scan_path = null
        where id = r.id and user_id = r.user_id
        returning scan_path, updated_at into kept, stamp;
      if kept is distinct from r.scan_path then raise exception 'PATH_NOT_KEPT'; end if;
      if stamp <= r.updated_at then raise exception 'STAMP_NOT_MOVED'; end if;
      raise exception 'ROLLBACK_OK';
    end $$;
  `);
  fail('the proof block did not roll back (it should always raise)', 4);
} catch (e) {
  const body = String(e.body ?? e.message);
  if (body.includes('ROLLBACK_OK')) console.log('  OK (path kept, updated_at moved on, then rolled back: nothing changed)');
  else if (body.includes('NO_ROW_WITH_A_PATH')) console.log('  SKIPPED (no entry has a scan path yet; the trigger is in place)');
  else fail(`proof: ${body.slice(0, 300)}`, 4);
}

console.log('Done.');

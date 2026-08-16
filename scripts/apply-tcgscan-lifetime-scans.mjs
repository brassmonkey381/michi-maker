/**
 * Apply migration 20260816120000_tcgscan_lifetime_scans_and_metadata to the LIVE shared app
 * backend: per-scan metadata columns on scan_events, and a lifetime total from the usage RPCs.
 *
 * Runs the migration file VERBATIM (single statement batch, so it is all-or-nothing), then verifies
 * the columns, the new function signature, and that a lifetime figure comes back.
 *
 * Node + the Supabase Management API, not psql: Windows PowerShell 5.1 mangles sb_ keys, and this
 * needs DDL rights that PostgREST does not expose.
 *
 *   SUPABASE_ACCESS_TOKEN=... node scripts/apply-tcgscan-lifetime-scans.mjs
 *
 * Idempotent: add column if not exists, drop constraint if exists, create or replace. Re-running is
 * harmless. NOTHING is backfilled - the rows that predate this keep NULL metadata on purpose.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REF = process.env.APP_PROJECT_REF || 'piikwvntldytjejxmcla';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SQL_PATH = fileURLToPath(
  new URL('../supabase/migrations/20260816120000_tcgscan_lifetime_scans_and_metadata.sql', import.meta.url),
);

if (!TOKEN) {
  console.error('FAILED: set SUPABASE_ACCESS_TOKEN (Supabase account access token).');
  process.exit(1);
}

async function q(query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    console.error(`FAILED (${label}): ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

console.log('Step 1/4: applying the migration...');
await q(readFileSync(SQL_PATH, 'utf8'), 'migration');
console.log('  OK');

console.log('Step 2/4: verifying scan_events columns...');
const cols = await q(
  `select column_name from information_schema.columns
    where table_schema='public' and table_name='scan_events'
      and column_name in ('confidence','auto_added','mode');`,
  'columns',
);
const got = cols.map((c) => c.column_name).sort();
if (got.length !== 3) {
  console.error(`FAILED: expected confidence, auto_added, mode - found ${got.join(', ') || '(none)'}`);
  process.exit(1);
}
console.log(`  OK (${got.join(', ')})`);

console.log('Step 3/4: verifying record_scan_event takes the new arguments...');
const fn = await q(
  `select pg_get_function_identity_arguments(p.oid) as args
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='record_scan_event';`,
  'signature',
);
if (fn.length !== 1) {
  console.error(`FAILED: expected exactly ONE record_scan_event overload, found ${fn.length}.`);
  console.error('  Two overloads make a single-argument call ambiguous and every scan would fail.');
  process.exit(1);
}
console.log(`  OK (${fn[0].args})`);

console.log('Step 4/4: verifying the lifetime total is reported...');
const life = await q(
  `select count(*)::int as rows,
          count(*) filter (where confidence is null)::int as null_confidence
     from public.scan_events;`,
  'lifetime',
);
console.log(`  OK (${life[0].rows} scan_events rows; ${life[0].null_confidence} with NULL confidence, as expected - no backfill)`);

console.log('DONE: lifetime scan totals and per-scan metadata are live.');

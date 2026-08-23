/**
 * Apply supabase/migrations/20260823120000_discover_feed.sql to the live user-data project and
 * verify it, then prove the new RPCs are reachable by an anonymous visitor.
 *
 * WHY THE MANAGEMENT API. The migration is DDL (a column, a trigger, two functions); PostgREST
 * has no path for that. `POST /v1/projects/{ref}/database/query` does, and it takes the personal
 * access token already in tcgscan.secrets, so nothing new has to be issued or stored.
 *
 * WHY THE ANON VERIFY AT THE END. Every RPC here is called by signed-out visitors on /discover.
 * A missing `grant execute ... to anon` fails exactly there and nowhere else, so the check that
 * matters is a real anonymous call, not an owner-level one.
 *
 * Run through apply-discover-feed.ps1, which loads the token without printing it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla'; // tcgscan-michi-maker (user data)
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260823120000_discover_feed.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const anonKey = process.env.APP_PUBLISHABLE_KEY;
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

function fail(msg, code = 2) {
  console.log(`FAILED: ${msg}`);
  process.exit(code);
}

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

console.log('Step 1: reading the migration...');
let migration;
try {
  migration = readFileSync(MIGRATION, 'utf8');
} catch (e) {
  fail(`cannot read ${MIGRATION}: ${e.message}`);
}
console.log(`  OK (${(migration.length / 1024).toFixed(1)} KB)`);

console.log('Step 2: counting public binders before the backfill...');
try {
  const [row] = await sql(
    "select count(*) filter (where is_public) as public_binders, " +
      "count(*) filter (where is_public and made_public_at is not null) as already_stamped " +
      'from public.binders',
  );
  console.log(`  OK (${row.public_binders} public, ${row.already_stamped} already stamped)`);
} catch (e) {
  // The column not existing yet is the normal first-run case, not an error.
  if (/made_public_at/.test(e.message)) console.log('  OK (column not present yet, first run)');
  else fail(`pre-count: ${e.message}`);
}

console.log('Step 3: applying the migration...');
try {
  await sql(migration);
  console.log('  OK');
} catch (e) {
  fail(`apply: ${e.message}`, 3);
}

console.log('Step 4: verifying the column, the trigger and the backfill...');
try {
  const [row] = await sql(`
    select
      (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'binders'
          and column_name = 'made_public_at') as has_column,
      (select count(*) from pg_trigger
        where tgname = 'binders_made_public' and not tgisinternal) as has_trigger,
      (select count(*) from public.binders where is_public) as public_binders,
      (select count(*) from public.binders where is_public and made_public_at is null) as unstamped
  `);
  if (Number(row.has_column) !== 1) fail('made_public_at column missing after apply', 4);
  if (Number(row.has_trigger) !== 1) fail('binders_made_public trigger missing after apply', 4);
  if (Number(row.unstamped) !== 0) fail(`${row.unstamped} public binders left unstamped`, 4);
  console.log(`  OK (${row.public_binders} public binders, all stamped)`);
} catch (e) {
  fail(`verify schema: ${e.message}`, 4);
}

console.log('Step 5: verifying both RPCs answer an ANONYMOUS caller...');
if (!anonKey) {
  console.log('  SKIPPED (APP_PUBLISHABLE_KEY not set, cannot test the anon grant)');
} else {
  const base = 'https://piikwvntldytjejxmcla.supabase.co/rest/v1/rpc';
  const calls = [
    ['discover_binders', { p_sort: 'recent', p_limit: 3, p_contest: null }],
    ['discover_binders', { p_sort: 'likes', p_limit: 3, p_contest: null }],
    ['contest_entry_feed', { p_contest: 'first-annual-2026', p_limit: 3 }],
  ];
  for (const [name, body] of calls) {
    const res = await fetch(`${base}/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) fail(`anon ${name}(${JSON.stringify(body)}): ${res.status} ${text.slice(0, 300)}`, 5);
    const rows = JSON.parse(text);
    console.log(`  OK ${name} ${JSON.stringify(body.p_sort ?? body.p_contest)} -> ${rows.length} rows`);
  }
}

console.log('DONE: /discover can now order by publish date, by likes, and feed contest entries.');

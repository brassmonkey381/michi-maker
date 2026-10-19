/**
 * Apply supabase/migrations/20261018150000_test_account_set.sql and prove it.
 *
 * The Studio user list timed out for two weeks because the test-account predicate ran once per
 * event row. This applies the set-based rewrite, then measures the exact query the RPC runs
 * (without the is_admin() gate, which the Management API cannot satisfy) and fails if it would
 * still miss the authenticated role's 8s statement timeout.
 *
 *   1. Apply. Re-runnable: create or replace, index if not exists.
 *   2. The four functions exist and read the new set.
 *   3. The user-list body for michi and tcgscan completes well inside 8s.
 *   4. The filter still excludes what it did: qa-rig and example.com accounts.
 *
 * No row is written. Run with SUPABASE_ACCESS_TOKEN in the environment:
 *   node scripts/apply-test-account-set.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261018150000_test_account_set.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set.');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

console.log('Step 1: apply the migration');
await sql(readFileSync(MIGRATION, 'utf8'));
console.log('  applied');

console.log('Step 2: the functions read the set');
const defs = await sql(`
  select p.proname, pg_get_functiondef(p.oid) like '%test_account_ids%' as uses_set
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('test_account_ids', 'is_test_account', 'admin_event_funnel', 'admin_recent_users');
`);
if (defs.length !== 4) fail(`expected 4 functions, found ${defs.length}`);
for (const d of defs) if (d.proname !== 'test_account_ids' && !d.uses_set) fail(`${d.proname} does not read test_account_ids()`);
console.log('  all four present; the three callers read test_account_ids()');

console.log('Step 3: the user list is fast again');
for (const app of ['michi', 'tcgscan']) {
  const t = Date.now();
  const rows = await sql(`
    select count(*)::int as n from (
      select e.user_id
      from public.analytics_events e
      where e.app = '${app}'
        and not exists (select 1 from public.test_account_ids() t where t = e.user_id)
      group by e.user_id
    ) x;
  `);
  const ms = Date.now() - t;
  console.log(`  ${app}: ${rows[0].n} users in ${ms} ms (round trip included)`);
  if (ms > 6000) fail(`${app} list took ${ms} ms; the 8s authenticated timeout is still at risk`);
}

console.log('Step 4: the exclusion still bites');
const set = await sql(`select count(*)::int as n from public.test_account_ids();`);
const probe = await sql(`
  select
    (select count(*)::int from auth.users where lower(email) like '%@example.com') as example_users,
    (select count(distinct user_id)::int from public.analytics_events where props->>'surface' = 'qa-rig' and user_id is not null) as rig_users;
`);
console.log(`  ${set[0].n} test accounts in the set (${probe[0].example_users} example.com, ${probe[0].rig_users} qa-rig, overlap possible)`);
if (set[0].n === 0 && (probe[0].example_users || probe[0].rig_users)) fail('the set is empty but test accounts exist');

console.log('OK: Studio user list and funnel are set-filtered; reload /studio.');

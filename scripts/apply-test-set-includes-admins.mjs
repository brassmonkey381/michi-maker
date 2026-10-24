/**
 * Apply supabase/migrations/20261024120000_test_set_includes_admins.sql and prove it.
 *
 *   1. Apply (create or replace; re-runnable).
 *   2. test_account_ids(): authenticated yes, anon no.
 *   3. Every admin profile is now in the set, and the set did not shrink.
 *   4. admin_recent_users (body, is_admin() gate replaced by true) lists no admin for either app,
 *      and still runs well inside the 8s authenticated timeout.
 *
 * No row is written. Run with SUPABASE_ACCESS_TOKEN in the environment:
 *   node scripts/apply-test-set-includes-admins.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261024120000_test_set_includes_admins.sql');
const PREVIOUS = join(here, '..', 'supabase', 'migrations', '20261019120000_studio_people_not_guests.sql');
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

console.log('Step 0: size of the set before');
const before = (await sql('select count(*)::int as n from public.test_account_ids();'))[0].n;
console.log(`  ${before} account(s)`);

console.log('Step 1: apply the migration');
await sql(readFileSync(MIGRATION, 'utf8'));
console.log('  applied');

console.log('Step 2: test_account_ids is authenticated-only');
const [priv] = await sql(`
  select has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
         has_function_privilege('anon', p.oid, 'execute') as anon_ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'test_account_ids';`);
if (!priv) fail('test_account_ids is missing');
if (!priv.auth_ok) fail('test_account_ids is not executable by authenticated');
if (priv.anon_ok) fail('test_account_ids is executable by anon');
console.log('  authenticated yes, anon no');

console.log('Step 3: every admin profile is in the set; the set did not shrink');
const [chk] = await sql(`
  select (select count(*)::int from public.test_account_ids()) as after,
         (select count(*)::int from public.profiles p where p.is_admin) as admins,
         (select count(*)::int from public.profiles p where p.is_admin
             and not exists (select 1 from public.test_account_ids() t where t = p.id)) as admins_missing;`);
if (chk.after < before) fail(`set shrank from ${before} to ${chk.after}`);
if (chk.admins_missing) fail(`${chk.admins_missing} admin profile(s) not in the set`);
console.log(`  ${chk.after} account(s) now (${chk.admins} admin profile(s), all included)`);

console.log('Step 4: the /studio user list holds no admin, and is fast');
const prev = readFileSync(PREVIOUS, 'utf8');
const m = prev.match(/create (?:or replace )?function public\.admin_recent_users\([^$]*?\$\$([\s\S]*?)\$\$;/);
if (!m) fail('could not find admin_recent_users in 20261019120000');
for (const app of ['michi', 'tcgscan']) {
  const q = m[1].replace(/public\.is_admin\(\)/g, 'true').replace(/p_app/g, `'${app}'`).replace(/p_limit/g, '200');
  const t = Date.now();
  const rows = await sql(q);
  const ms = Date.now() - t;
  if (ms > 6000) fail(`user list ${app} took ${ms} ms`);
  if (rows.length) {
    const [a] = await sql(`select count(*)::int as n from public.profiles p where p.is_admin and p.id in (${rows.map((r) => `'${r.user_id}'`).join(', ')});`);
    if (a.n) fail(`user list ${app} still holds ${a.n} admin account(s)`);
  }
  console.log(`  ${app}: ${rows.length} rows in ${ms} ms, no admin${rows[0]?.username ? `, top @${rows[0].username}` : ''}`);
}
console.log('OK');

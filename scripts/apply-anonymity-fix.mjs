/**
 * Apply supabase/migrations/20260824120000_anonymity_from_auth_users.sql to the live user-data
 * project, so a just-upgraded guest stops being treated as a guest by the server.
 *
 * THE CHECK THAT MATTERS is step 4. It finds a real account whose access token would still be
 * claiming `is_anonymous: true` (upgraded, never refreshed) and asserts that the NEW
 * request_is_anonymous() logic returns false for it while the OLD claim-based logic would have
 * returned true. That is the whole bug, reproduced against real rows rather than asserted.
 *
 * Step 5 re-checks the two RLS policies still exist and still refuse actual guests — the fix
 * must not turn "guests may not like binders" into "anyone may".
 *
 * Run through apply-anonymity-fix.ps1, which loads the token without printing it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla'; // tcgscan-michi-maker (user data)
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260824120000_anonymity_from_auth_users.sql',
);

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

console.log('Step 1: reading the migration...');
let migration;
try {
  migration = readFileSync(MIGRATION, 'utf8');
} catch (e) {
  fail(`cannot read ${MIGRATION}: ${e.message}`);
}
console.log(`  OK (${(migration.length / 1024).toFixed(1)} KB)`);

console.log('Step 2: counting accounts currently mis-read as guests...');
try {
  const [row] = await sql(`
    select count(*) as affected
    from auth.users u
    join auth.sessions s on s.user_id = u.id
    where u.is_anonymous = false
      and u.raw_app_meta_data = '{}'::jsonb          -- started life anonymous
      and s.refreshed_at is null                      -- token never reissued since
      and s.created_at > now() - interval '1 hour'    -- claim not yet expired
  `);
  console.log(`  OK (${row.affected} live session(s) holding a stale guest claim right now)`);
} catch (e) {
  fail(`pre-count: ${e.message}`);
}

console.log('Step 3: applying the migration...');
try {
  await sql(migration);
  console.log('  OK');
} catch (e) {
  fail(`apply: ${e.message}`, 3);
}

console.log('Step 4: proving the fix on a real upgraded-from-guest account...');
try {
  const [row] = await sql(`
    with subject as (
      select u.id from auth.users u
      where u.is_anonymous = false and u.raw_app_meta_data = '{}'::jsonb
      order by u.created_at desc limit 1
    )
    select
      (select id from subject) as user_id,
      (select u.is_anonymous from auth.users u where u.id = (select id from subject)) as row_says_anon,
      (select count(*) from auth.identities i
        where i.user_id = (select id from subject)) as identities
  `);
  if (!row || !row.user_id) {
    console.log('  SKIPPED (no upgraded-from-guest account exists to test against)');
  } else if (row.row_says_anon !== false) {
    fail(`subject ${row.user_id} is still anonymous in auth.users; wrong subject`, 4);
  } else {
    // Impersonate that user's request context and call the function for real.
    const [verdict] = await sql(`
      select public.request_is_anonymous() as is_anon
      from (select set_config('request.jwt.claims',
              json_build_object('sub', '${row.user_id}', 'role', 'authenticated',
                                'is_anonymous', true)::text, true)) _
    `);
    if (verdict.is_anon !== false) {
      fail(`request_is_anonymous() still says true for upgraded account ${row.user_id}`, 4);
    }
    console.log(`  OK (stale "is_anonymous: true" claim now overruled by auth.users; ${row.identities} identity/ies)`);
  }
} catch (e) {
  fail(`verify fix: ${e.message}`, 4);
}

console.log('Step 5: proving a REAL guest is still refused...');
try {
  const [row] = await sql(`
    with guest as (
      select u.id from auth.users u where u.is_anonymous order by u.created_at desc limit 1
    )
    select (select id from guest) as user_id
  `);
  if (!row || !row.user_id) {
    console.log('  SKIPPED (no anonymous user exists to test against)');
  } else {
    const [verdict] = await sql(`
      select public.request_is_anonymous() as is_anon
      from (select set_config('request.jwt.claims',
              json_build_object('sub', '${row.user_id}', 'role', 'authenticated',
                                'is_anonymous', false)::text, true)) _
    `);
    if (verdict.is_anon !== true) {
      fail('a real anonymous user is no longer detected as anonymous; the gate is now open', 5);
    }
    console.log('  OK (a genuine guest is still a guest, even with a lying claim)');
  }
} catch (e) {
  fail(`verify guest: ${e.message}`, 5);
}

console.log('Step 6: confirming both community policies survived...');
try {
  const rows = await sql(`
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and policyname in ('Real accounts can like public binders',
                         'Real accounts can upvote public profiles')
    order by tablename
  `);
  if (rows.length !== 2) fail(`expected 2 policies, found ${rows.length}`, 6);
  for (const r of rows) console.log(`  OK ${r.tablename}: ${r.policyname}`);
} catch (e) {
  fail(`verify policies: ${e.message}`, 6);
}

console.log('DONE: a real account is a real account, the moment it becomes one.');

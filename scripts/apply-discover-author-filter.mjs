/**
 * Apply supabase/migrations/20260823140000_discover_author_filter.sql to the live user-data
 * project: discover_binders gains p_author / p_exclude_author so Discover can put the house
 * account's reference binders in their own section.
 *
 * THE CHECK THAT MATTERS is step 5. This migration DROPS discover_binders and recreates it with
 * two extra parameters, and the client already in production calls it with the original three.
 * PostgREST resolves by the argument names supplied, so a three-argument call should still match
 * the new function through its defaults — but "should" is not "does", and getting it wrong takes
 * Discover's main section down until the next deploy. So the applier makes that exact call.
 *
 * Run through apply-discover-author-filter.ps1, which loads the token without printing it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla'; // tcgscan-michi-maker (user data)
const AUTHOR = 'michimaker';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260823140000_discover_author_filter.sql',
);

const token = process.env.SUPABASE_ACCESS_TOKEN;
const anonKey = process.env.MICHI_PUBLISHABLE_KEY;

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

console.log(`Step 2: checking @${AUTHOR} exists and what it has published...`);
try {
  const [row] = await sql(`
    select
      (select count(*) from public.profiles where lower(username) = '${AUTHOR}') as profile,
      (select count(*) from public.binders b
         join public.profiles p on p.id = b.owner_id
        where lower(p.username) = '${AUTHOR}' and b.is_public
          and b.archived_at is null and coalesce(b.is_demo, false) = false) as public_binders
  `);
  if (Number(row.profile) !== 1) {
    fail(`expected exactly one @${AUTHOR} profile, found ${row.profile}`, 2);
  }
  console.log(`  OK (profile found, ${row.public_binders} public binders)`);
  if (Number(row.public_binders) === 0) {
    console.log('  NOTE: the section will stay hidden until that account publishes something.');
  }
} catch (e) {
  fail(`author check: ${e.message}`);
}

console.log('Step 3: applying the migration...');
try {
  await sql(migration);
  console.log('  OK');
} catch (e) {
  fail(`apply: ${e.message}`, 3);
}

console.log('Step 4: verifying exactly one discover_binders, with five arguments...');
try {
  const rows = await sql(`
    select pronargs, pg_get_function_identity_arguments(oid) as args
    from pg_proc
    where proname = 'discover_binders'
      and pronamespace = 'public'::regnamespace
  `);
  if (rows.length !== 1) fail(`expected 1 discover_binders, found ${rows.length}`, 4);
  if (Number(rows[0].pronargs) !== 5) fail(`expected 5 args, found ${rows[0].pronargs}`, 4);
  console.log(`  OK (${rows[0].args})`);
} catch (e) {
  fail(`verify function: ${e.message}`, 4);
}

console.log('Step 5: verifying anonymous calls, including the DEPLOYED 3-argument one...');
if (!anonKey) {
  console.log('  SKIPPED (MICHI_PUBLISHABLE_KEY not set, cannot test the anon grant)');
} else {
  const base = `https://${PROJECT_REF}.supabase.co/rest/v1/rpc/discover_binders`;
  const calls = [
    ['already-deployed client (3 args)', { p_sort: 'recent', p_limit: 3, p_contest: null }],
    ['main section (excludes house)', { p_sort: 'recent', p_limit: 3, p_exclude_author: AUTHOR }],
    ['main section by likes', { p_sort: 'likes', p_limit: 3, p_exclude_author: AUTHOR }],
    ['house section', { p_sort: 'recent', p_limit: 3, p_author: AUTHOR }],
  ];
  for (const [label, body] of calls) {
    const res = await fetch(base, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) fail(`anon ${label}: ${res.status} ${text.slice(0, 300)}`, 5);
    const rows = JSON.parse(text);
    const names = [...new Set(rows.map((r) => r.author_name))].join(', ') || 'none';
    console.log(`  OK ${label} -> ${rows.length} rows (${names})`);
  }
}

console.log('DONE: Discover can scope a section to one author, or leave one out.');

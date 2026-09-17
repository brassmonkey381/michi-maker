/**
 * Apply supabase/migrations/20260916120000_allow_copies.sql to the live app project and prove it:
 * binders gain a boolean `allow_copies`, off.
 *
 * Safe to re-run: add column if not exists. Nothing else moves: the binder count is the same
 * before and after and no binder gains the permission.
 *
 * DDL goes through the management API with SUPABASE_ACCESS_TOKEN in the environment; the .ps1
 * wrapper in the session scratchpad loads it without printing it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260916120000_allow_copies.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg) {
  console.log(`FAILED: ${msg}`);
  process.exitCode = 2;
  throw new Error(msg);
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

const COLUMN = `select data_type from information_schema.columns
  where table_schema = 'public' and table_name = 'binders' and column_name = 'allow_copies';`;

try {
  console.log('Step 1: what is there now...');
  const before = await sql(COLUMN);
  if (before.length && before[0].data_type !== 'boolean') fail(`binders.allow_copies exists as ${before[0].data_type}, not boolean. Stopping.`);
  console.log(`  column ${before.length ? 'already present' : 'absent'}`);
  const [{ n }] = await sql('select count(*)::int as n from public.binders;');
  console.log(`  binders: ${n}`);

  console.log('Step 2: apply the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  const after = await sql(COLUMN);
  if (after.length !== 1 || after[0].data_type !== 'boolean') fail('column not present as boolean after apply');
  console.log('  binders.allow_copies is boolean');

  console.log('Step 3: nothing else moved...');
  const [{ n2 }] = await sql('select count(*)::int as n2 from public.binders;');
  const [{ set }] = await sql('select count(*)::int as set from public.binders where allow_copies;');
  if (n2 !== n) fail(`binder count changed: ${n} -> ${n2}`);
  if (set !== 0) fail(`${set} binders unexpectedly allow copies`);
  console.log(`  binders: ${n2}, allowing copies: 0`);
  console.log('DONE: binders.allow_copies is live.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

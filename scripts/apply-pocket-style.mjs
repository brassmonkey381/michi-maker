/**
 * Apply supabase/migrations/20260914120000_pocket_style.sql to the live app project and prove it:
 * binder_pages and binder_slots gain nullable text `sleeve` and `art_backing`.
 *
 * Safe to re-run: add column if not exists. Nothing else moves: row counts are the same before
 * and after and no row gains a value.
 *
 * DDL goes through the management API with SUPABASE_ACCESS_TOKEN in the environment; the .ps1
 * wrapper in the session scratchpad loads it without printing it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260914120000_pocket_style.sql');

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

const COLUMNS = `
  select table_name, column_name, data_type from information_schema.columns
   where table_schema = 'public' and table_name in ('binder_pages', 'binder_slots')
     and column_name in ('sleeve', 'art_backing') order by 1, 2;`;

try {
  console.log('Step 1: what is there now...');
  const before = await sql(COLUMNS);
  for (const c of before) if (c.data_type !== 'text') fail(`${c.table_name}.${c.column_name} exists as ${c.data_type}, not text. Stopping.`);
  console.log(`  ${before.length} of 4 columns already present`);
  const [{ p }] = await sql('select count(*)::int as p from public.binder_pages;');
  const [{ s }] = await sql('select count(*)::int as s from public.binder_slots;');
  console.log(`  pages: ${p}, slots: ${s}`);

  console.log('Step 2: apply the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  const after = await sql(COLUMNS);
  if (after.length !== 4) fail(`expected 4 columns after apply, found ${after.length}`);
  console.log('  4 columns present, all text');

  console.log('Step 3: nothing else moved...');
  const [{ p2 }] = await sql('select count(*)::int as p2 from public.binder_pages;');
  const [{ s2 }] = await sql('select count(*)::int as s2 from public.binder_slots;');
  const [{ set }] = await sql(`select (select count(*) from public.binder_pages where sleeve is not null or art_backing is not null)
    + (select count(*) from public.binder_slots where sleeve is not null or art_backing is not null) as set;`);
  if (p2 !== p || s2 !== s) fail(`row counts changed: pages ${p}->${p2}, slots ${s}->${s2}`);
  if (Number(set) !== 0) fail(`${set} rows unexpectedly have a value`);
  console.log(`  pages: ${p2}, slots: ${s2}, rows with a value: 0`);
  console.log('DONE: pocket and page sleeve / art_backing columns are live.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

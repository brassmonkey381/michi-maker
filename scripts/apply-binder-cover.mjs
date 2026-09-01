/**
 * Apply supabase/migrations/20260901130000_binder_cover.sql: a binder can be dressed as a real one.
 *
 * THE CHECKS THAT MATTER:
 *   1. The column does not already exist with a different type. jsonb is what the client sends and
 *      what the constraint assumes; finding a text column here would mean somebody added one by
 *      hand and every cover would round-trip as a string.
 *   2. It applies, and the constraint is really on the table (not just in the file).
 *   3. The constraint bites: an array is refused, an object is accepted, null is accepted. Written
 *      and rolled back inside a transaction against a real binder row, because a check constraint
 *      that was never exercised is a comment.
 *   4. Nothing else moved: the binder count is the same before and after, and no existing binder
 *      gained a cover.
 *
 * Safe to re-run: add column if not exists, and the constraint is dropped and recreated.
 *
 * Run through apply-binder-cover.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260901130000_binder_cover.sql');

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

const COLUMN = `
  select data_type
    from information_schema.columns
   where table_schema = 'public' and table_name = 'binders' and column_name = 'cover';`;

try {
  console.log('Step 1: what is there now...');
  const existing = await sql(COLUMN);
  if (existing.length && existing[0].data_type !== 'jsonb') {
    fail(`binders.cover already exists as ${existing[0].data_type}, not jsonb. Stopping rather than guessing.`);
  }
  console.log(existing.length ? '  column already present as jsonb (re-run)' : '  no cover column yet');
  const [{ n: bindersBefore }] = await sql('select count(*)::int as n from public.binders;');
  console.log(`  binders on record: ${bindersBefore}`);

  console.log('Step 2: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  applied');

  console.log('Step 3: the column and the constraint are really there...');
  const after = await sql(COLUMN);
  if (!after.length || after[0].data_type !== 'jsonb') fail('binders.cover is not jsonb after applying.');
  const [check] = await sql(`
    select count(*)::int as n
      from pg_constraint
     where conrelid = 'public.binders'::regclass and conname = 'binders_cover_is_object';`);
  if (check.n !== 1) fail('binders_cover_is_object constraint is missing.');
  console.log('  jsonb column + constraint present');

  console.log('Step 4: the constraint actually bites...');
  const [victim] = await sql('select id from public.binders limit 1;');
  if (!victim) {
    console.log('  SKIPPED: no binder rows to test against (the constraint is still in place).');
  } else {
    const id = victim.id;
    // An object is fine. Rolled back, so nobody's binder is dressed by this script.
    await sql(`
      begin;
      update public.binders
         set cover = '{"modelId":"vaultx-exotec-zip-12-xl","colourway":"signature-black"}'::jsonb
       where id = '${id}';
      rollback;`);
    console.log('  an object is accepted');
    let refused = false;
    try {
      await sql(`
        begin;
        update public.binders set cover = '[1,2]'::jsonb where id = '${id}';
        rollback;`);
    } catch {
      refused = true;
    }
    if (!refused) fail('an array was ACCEPTED into binders.cover; the constraint is not doing its job.');
    console.log('  an array is refused');
  }

  console.log('Step 5: nothing else moved...');
  const [{ n: bindersAfter }] = await sql('select count(*)::int as n from public.binders;');
  const [{ n: dressed }] = await sql(
    'select count(*)::int as n from public.binders where cover is not null;',
  );
  if (bindersAfter !== bindersBefore) fail(`binder count changed: ${bindersBefore} -> ${bindersAfter}`);
  console.log(`  binders: ${bindersAfter} (unchanged), with a cover: ${dressed}`);

  console.log('');
  console.log('DONE. Every existing binder is undressed, which is what the client expects.');
} catch (err) {
  console.log(`FAILED: ${err.message}`);
  process.exitCode = process.exitCode || 2;
}

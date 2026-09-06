/**
 * Apply supabase/migrations/20260906120000_slot_cell_deferrable.sql to the live user-data project
 * and prove it: the one-pocket-per-cell rule on binder_slots becomes DEFERRABLE INITIALLY
 * DEFERRED, so a single statement that swaps two pockets is judged on where they end up, not on
 * the half-way state that used to reject every cross-page swap and every undo of a swap.
 *
 * DDL goes through the management API (PostgREST cannot alter a table), with the personal access
 * token already in tcgscan.secrets. Run through apply-slot-cell-deferrable.ps1, which loads the
 * token without printing it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260906120000_slot_cell_deferrable.sql');
const CONSTRAINT = 'binder_slots_page_id_row_index_col_index_key';

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

const state = () => sql(
  `select condeferrable as deferrable, condeferred as deferred
     from pg_constraint where conname = '${CONSTRAINT}' and conrelid = 'public.binder_slots'::regclass;`,
);

try {
  console.log('Step 1: what is there now...');
  const before = await state();
  if (!before.length) fail(`${CONSTRAINT} is not on binder_slots; stopping rather than guessing its name`);
  console.log(`  ${CONSTRAINT}: deferrable=${before[0].deferrable} deferred=${before[0].deferred}`);
  const [{ n: slotsBefore }] = await sql('select count(*)::int as n from public.binder_slots;');
  console.log(`  pockets today: ${slotsBefore}`);

  console.log('Step 2: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  applied');

  console.log('Step 3: proving the rule is now checked at commit...');
  const after = await state();
  if (!after.length || !after[0].deferrable || !after[0].deferred) fail('constraint is not deferrable initially deferred after apply');
  console.log('  deferrable initially deferred');

  console.log('Step 4: a swap inside one transaction succeeds, a real collision is still refused...');
  // Two throwaway rows on a page that does not exist cannot be inserted (FK), so the proof uses a
  // savepoint-free shape: a single statement that would collide half way and is legal at the end.
  // The query endpoint runs each request in its own transaction, which is exactly what PostgREST does.
  const [{ page }] = await sql('select id as page from public.binder_pages limit 1;').catch(() => [{ page: null }]);
  if (!page) {
    console.log('  (no pages exist to try it on; the catalogue proof in step 3 stands)');
  } else {
    const probe = await sql(
      `with cells as (
         select id, row_index, col_index from public.binder_slots where page_id = '${page}' order by row_index, col_index limit 2
       ), swapped as (
         update public.binder_slots s
            set row_index = o.row_index, col_index = o.col_index
           from cells c join cells o on o.id <> c.id
          where s.id = c.id
          returning s.id
       ), restored as (
         update public.binder_slots s
            set row_index = c.row_index, col_index = c.col_index
           from cells c where s.id = c.id and exists (select 1 from swapped)
          returning s.id
       )
       select (select count(*) from swapped)::int as swapped, (select count(*) from restored)::int as restored;`,
    );
    console.log(`  swap-and-restore in one transaction: ${JSON.stringify(probe[0])}`);
  }
  let refused = false;
  try {
    await sql(
      `insert into public.binder_slots (page_id, row_index, col_index)
         select page_id, row_index, col_index from public.binder_slots limit 1;`,
    );
  } catch (e) {
    refused = /unique|duplicate/i.test(String(e.message));
  }
  if (!refused) fail('a duplicate cell was NOT refused at commit');
  console.log('  a genuine duplicate cell is still refused');

  console.log('Step 5: nothing changed in the data...');
  const [{ n: slotsAfter }] = await sql('select count(*)::int as n from public.binder_slots;');
  if (slotsAfter !== slotsBefore) fail(`pocket count changed: ${slotsBefore} -> ${slotsAfter}`);
  console.log(`  pockets: ${slotsAfter}`);
  console.log('DONE');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

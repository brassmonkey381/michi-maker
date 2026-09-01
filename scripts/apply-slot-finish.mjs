/**
 * Apply supabase/migrations/20260901120000_slot_finish.sql: binder_slots.finish, the print finish
 * a POCKET depicts — so a card can be known to be holo without the collector having to own it.
 *
 * THE CHECKS THAT MATTER, and why each one is here rather than assumed:
 *   2. The column exists, is TEXT, is nullable, has no default and carries no constraint. Text
 *      because the vocabulary is unenforced by design; nullable because most pockets will never
 *      set one; unconstrained because a rejected row poisons the whole slot upsert.
 *   3. A slot insert WITHOUT the column still lands — every client already in the wild writes that
 *      shape, and it must keep working while the new one rolls out — and one WITH it round-trips
 *      the value. Both are probed against the live schema inside a transaction that is rolled
 *      back, so the probe cannot leave a row behind even if it fails halfway.
 *
 * Deploy order is not negotiable: this must be LIVE before a client that writes `finish` ships.
 * PostgREST rejects a payload naming a column the table lacks, and the save path deletes before it
 * inserts — which is how 2026-08-29 turned a type mismatch into a binder with no cards in it.
 *
 * Safe to re-run: idempotent DDL, and the probes clean up after themselves.
 *
 * Run through apply-slot-finish.ps1 at the workspace root (it loads the token silently).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260901120000_slot_finish.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg) {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
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

try {
  console.log('Step 1/3: applying the migration (idempotent DDL)...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2/3: verifying the column is the shape the client assumes...');
  const [col] = await sql(`
    select data_type, is_nullable, column_default
      from information_schema.columns
     where table_schema = 'public' and table_name = 'binder_slots' and column_name = 'finish';`);
  if (!col) fail('the finish column does not exist after applying the migration');
  if (col.data_type !== 'text') fail(`expected text, found ${col.data_type}`);
  if (col.is_nullable !== 'YES') fail('the column must be nullable — most pockets never set one');
  if (col.column_default !== null) fail(`expected no default, found ${col.column_default}`);
  const constraints = await sql(`
    select conname from pg_constraint
     where conrelid = 'public.binder_slots'::regclass
       and pg_get_constraintdef(oid) ilike '%finish%';`);
  if (constraints.length) fail(`the column must carry no constraint; found ${constraints.map((c) => c.conname).join(', ')}`);
  console.log('  OK — text, nullable, no default, no constraint');

  console.log('Step 3/3: probing that OLD and NEW slot writes both land (rolled back)...');
  const probe = await sql(`
    begin;
    create temporary table _probe_ids (id uuid) on commit drop;
    with b as (
      insert into public.binders (owner_id, title)
      select id, '__probe__' from auth.users limit 1
      returning id
    ), p as (
      insert into public.binder_pages (binder_id, position, rows, cols)
      select id, 0, 3, 3 from b returning id, binder_id
    ), old_shape as (
      insert into public.binder_slots (page_id, row_index, col_index, slot_type, card_id)
      select id, 0, 0, 'card', 'probe-old' from p
      returning id, finish
    ), new_shape as (
      insert into public.binder_slots (page_id, row_index, col_index, slot_type, card_id, finish)
      select id, 0, 1, 'card', 'probe-new', 'Reverse Holofoil' from p
      returning id, finish
    )
    select (select finish is null from old_shape) as old_write_ok,
           (select finish from new_shape) as new_write_value;
    rollback;`);
  const row = Array.isArray(probe) ? probe.find((r) => r && 'old_write_ok' in r) : null;
  if (!row) fail('the probe returned nothing — could not confirm slot writes');
  if (row.old_write_ok !== true) fail('a slot insert WITHOUT finish did not leave it null');
  if (row.new_write_value !== 'Reverse Holofoil') fail(`finish did not round-trip; got ${row.new_write_value}`);
  console.log('  OK — old writes unaffected, new writes round-trip');

  console.log('');
  console.log('DONE. binder_slots.finish is live; the client may now write it.');
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exit(1);
}

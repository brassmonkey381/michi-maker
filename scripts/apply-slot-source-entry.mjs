/**
 * Apply supabase/migrations/20260829120000_slot_source_entry.sql: binder_slots.source_entry_id,
 * the soft pointer from a rebuilt pocket to the owned copy (portfolio_entries row) it depicts —
 * what lets each pocket show ITS copy's scan instead of the card's newest.
 *
 * THE CHECKS THAT MATTER:
 *   2. The column exists, is uuid, nullable, has NO default, and joins NO constraint — an entry
 *      is deleted by lot removal, collection delete, and sync replaceAll, and none of those may
 *      fail or cascade into binders over a display hint. Dangling is legal; display falls back.
 *   3. A slot insert WITHOUT the column still lands (every existing write path in the wild), and
 *      one WITH it round-trips the value — both probed against the live schema in a rolled-back
 *      transaction, so the probe leaves nothing behind by construction.
 *
 * Safe to re-run: idempotent DDL.
 *
 * Run through apply-slot-source-entry.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260829120000_slot_source_entry.sql');

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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: the column, and that nothing about it can reject a row...');
  const [col] = await sql(`
    select data_type, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'binder_slots'
      and column_name = 'source_entry_id';`);
  if (!col) fail('source_entry_id is missing');
  if (col.data_type !== 'uuid') fail(`source_entry_id is ${col.data_type}, expected uuid`);
  if (col.is_nullable !== 'YES') fail('source_entry_id is NOT NULL');
  if (col.column_default !== null) fail(`source_entry_id has a default (${col.column_default})`);
  const cons = await sql(`
    select c.conname from pg_constraint c
    where c.conrelid = 'public.binder_slots'::regclass
      and exists (
        select 1 from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where a.attname = 'source_entry_id');`);
  if (cons.length) fail(`source_entry_id joined a constraint: ${cons.map((c) => c.conname).join(', ')}`);
  console.log('  OK (uuid, nullable, no default, no constraint)');

  console.log('Step 3: probing both slot-insert shapes, rolled back...');
  // service-level SQL bypasses RLS, which is fine: the question here is the SCHEMA (does the
  // column reject either write shape), not the policies — those are unchanged by this migration.
  const probe = await sql(`
    begin;
    with owner as (select id from auth.users limit 1),
    b as (insert into public.binders (id, user_id, title)
            select gen_random_uuid(), id, '__probe_slot_source_entry' from owner returning id),
    p as (insert into public.binder_pages (id, binder_id, position, rows, cols)
            select gen_random_uuid(), id, 0, 3, 4 from b returning id),
    s_old as (insert into public.binder_slots (id, page_id, row_index, col_index, slot_type, card_id)
            select gen_random_uuid(), id, 0, 0, 'card', 'probe-card' from p returning id),
    s_new as (insert into public.binder_slots
              (id, page_id, row_index, col_index, slot_type, card_id, source_entry_id)
            select gen_random_uuid(), id, 0, 1, 'card', 'probe-card',
                   '00000000-0000-0000-0000-000000000001' from p
            returning source_entry_id)
    select (select count(*) from s_old) as old_ok, (select source_entry_id from s_new) as round_trip;
    rollback;`);
  const row = Array.isArray(probe) ? probe[0] : null;
  if (!row || Number(row.old_ok) !== 1) fail('the without-column insert did not land');
  if (row.round_trip !== '00000000-0000-0000-0000-000000000001') {
    fail(`the with-column insert did not round-trip (${row?.round_trip})`);
  }
  console.log('  OK (old shape lands, new shape round-trips, transaction rolled back)');

  console.log('');
  console.log('Done. binder_slots.source_entry_id is live; rebuilt binders stamp it from now on.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

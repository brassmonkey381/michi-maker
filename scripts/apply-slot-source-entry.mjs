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
  // uuid was this migration's first cut; 20260831150000 rewrote it to text because entry ids are
  // client-minted lot-... strings and the uuid column silently rejected every stamp. Either type
  // passes here so this applier stays safe to re-run; the demote-stamp applier asserts text.
  if (col.data_type !== 'uuid' && col.data_type !== 'text')
    fail(`source_entry_id is ${col.data_type}, expected uuid or text`);
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
  // The raise-to-roll-back idiom from apply-demote-placed.mjs: the whole probe lives in one
  // do-block that ends by raising, so PostgreSQL unwinds every insert whatever the outcome —
  // nothing can be left behind by a probe that dies halfway. Service-level SQL bypasses RLS,
  // which is fine: the question here is the SCHEMA (can the column reject either write shape),
  // and this migration touches no policy.
  const probe = await sql(`
    do $probe$
    declare
      v_user uuid; v_binder uuid; v_page uuid; v_old uuid; v_new uuid; v_back uuid;
    begin
      select id into v_user from auth.users limit 1;
      if v_user is null then raise exception 'PROBE-SKIP: no user to own a probe binder'; end if;

      insert into public.binders (owner_id, title, layout_style, is_public)
        values (v_user, 'probe slot source entry', 'freeform', false) returning id into v_binder;
      insert into public.binder_pages (binder_id, position, rows, cols)
        values (v_binder, 0, 3, 4) returning id into v_page;

      -- The shape every write path in the wild sends: no source_entry_id at all.
      insert into public.binder_slots (page_id, row_index, col_index, slot_type, card_id)
        values (v_page, 0, 0, 'card', 'probe-card-source-entry') returning id into v_old;
      if v_old is null then raise exception 'PROBE-FAIL: the without-column insert did not land'; end if;

      -- The shape slotRow sends from now on.
      insert into public.binder_slots
          (page_id, row_index, col_index, slot_type, card_id, source_entry_id)
        values (v_page, 0, 1, 'card', 'probe-card-source-entry',
                '00000000-0000-0000-0000-000000000001') returning id into v_new;
      select source_entry_id into v_back from public.binder_slots where id = v_new;
      if v_back is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
        raise exception 'PROBE-FAIL: stamp did not round-trip (got %)', v_back;
      end if;

      -- A dangling pointer must be legal: no FK means an id no entry has is still storable.
      update public.binder_slots
        set source_entry_id = '00000000-0000-0000-0000-000000000002' where id = v_old;

      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(probe).includes('PROBE-OK')) {
    console.log('  OK (old shape lands, stamp round-trips, dangling allowed, all rolled back)');
  } else if (String(probe).includes('PROBE-SKIP')) {
    console.log('  SKIPPED (no user to own a probe binder)');
  } else {
    fail(`slot probe: ${String(probe).slice(0, 400)}`);
  }

  console.log('');
  console.log('Done. binder_slots.source_entry_id is live; rebuilt binders stamp it from now on.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

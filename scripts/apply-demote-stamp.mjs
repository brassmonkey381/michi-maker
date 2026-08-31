/**
 * Apply supabase/migrations/20260831150000_demote_clears_stamp.sql: a demoted pocket lets go of
 * the copy it claimed.
 *
 * THE CHECKS THAT MATTER:
 *   1. Before/after counts of the rows the one-time repair targets (card pockets stamped but not
 *      from_collection - a state only the old demote ever wrote). After must be zero; the delta
 *      is how many locked-away copies were freed.
 *   2. THE COLUMN IS TEXT AND A REAL lot-... ID ROUND-TRIPS. The column shipped as uuid while
 *      every client mints text ids, so every stamp 400'd silently and the live table held zero
 *      stamps. The probe writes an actual lot-prefixed string (a well-formed-uuid probe is
 *      exactly what let this slip) and rolls back.
 *   3. THE VICTIM PREDICATE PLANS. String-matching pg_get_functiondef proves nothing about
 *      executability: plpgsql plans lazily, so a type-mismatched comparison (42883) hides until
 *      the first real demotion at COMMIT of a user's delete. A limit-0 select containing the
 *      function's exact predicate forces parse analysis now.
 *   4. The new function body actually clears the stamp and ranks dead/unstamped victims first,
 *      and the trigger wiring is untouched (deferred constraint trigger on collections DELETE).
 *   5. Kept-ARTWORK stamps are untouched: the rebuild importer legitimately stamps artwork
 *      pockets without from_collection, and the repair must not have swept them.
 *
 * Safe to re-run: create-or-replace DDL, an idempotent type change, and the repair matches zero
 * rows the second time.
 *
 * Run through apply-demote-stamp.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260831150000_demote_clears_stamp.sql',
);

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

const CENSUS = `
  select
    (select count(*) from public.binder_slots
      where source_entry_id is not null and card_id is not null
        and from_collection is distinct from true) as damaged,
    (select count(*) from public.binder_slots
      where source_entry_id is not null and card_id is null) as artwork_stamps,
    (select count(*) from public.binder_slots
      where source_entry_id is not null and card_id is not null) as card_stamps;`;

try {
  console.log('Step 1: the state before (what the repair will touch)...');
  const [before] = await sql(CENSUS);
  console.log(`  demote-damaged card pockets (stamp kept, from_collection off): ${before.damaged}`);
  console.log(`  stamped card pockets total : ${before.card_stamps}`);
  console.log(`  stamped artwork pockets    : ${before.artwork_stamps} (must not change)`);

  console.log('Step 2: applying the migration (function + one-time repair)...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 3: the column is text and a real lot-... id round-trips...');
  const [col] = await sql(`
    select data_type, is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'binder_slots'
      and column_name = 'source_entry_id';`);
  if (!col) fail('source_entry_id is missing');
  if (col.data_type !== 'text')
    fail(`source_entry_id is ${col.data_type}, expected text (the uuid first cut rejected every stamp)`);
  if (col.is_nullable !== 'YES') fail('source_entry_id is NOT NULL');
  const [probe] = await sql(`
    do $probe$
    declare
      v_page uuid; v_back text;
    begin
      select id into v_page from public.binder_pages limit 1;
      if v_page is null then raise exception 'PROBE-SKIP: no page to hang a probe slot on'; end if;
      insert into public.binder_slots (page_id, row_index, col_index, slot_type, card_id, source_entry_id)
      values (v_page, 97, 97, 'card', 'probe-demote-stamp', 'lot-probe-not-a-uuid')
      returning source_entry_id into v_back;
      if v_back is distinct from 'lot-probe-not-a-uuid' then
        raise exception 'PROBE-FAIL: stamp did not round-trip (got %)', v_back;
      end if;
      raise exception 'PROBE-OK';
    end $probe$;`).then(() => [{ ok: false, note: 'do-block returned without raising' }])
    .catch((e) => {
      if (String(e.message).includes('PROBE-OK')) return [{ ok: true }];
      if (String(e.message).includes('PROBE-SKIP')) return [{ ok: true, note: 'skipped (empty table)' }];
      return [{ ok: false, note: e.message }];
    });
  if (!probe.ok) fail(`lot-id round-trip probe: ${probe.note}`);
  console.log(`  OK${probe.note ? ` (${probe.note})` : ' (lot-... stored and rolled back)'}`);

  console.log('Step 4: the function clears stamps, ranks dead victims first, and its predicate PLANS...');
  const [fn] = await sql(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'demote_unowned_placements';`);
  if (!fn) fail('demote_unowned_placements is missing');
  if (!fn.def.includes('source_entry_id = null')) fail('the demote does not clear the stamp');
  if (!fn.def.includes('pe.user_id = b2.owner_id'))
    fail('victim EXISTS is not owner-scoped');
  // Force parse analysis of the exact victim predicate: a type mismatch raises 42883 HERE
  // instead of inside the deferred trigger at commit of a user's collection delete.
  await sql(`
    select 1
      from public.binder_slots s2
      join public.binder_pages p2 on p2.id = s2.page_id
      join public.binders b2 on b2.id = p2.binder_id
     where s2.source_entry_id is not null
       and exists (select 1 from public.portfolio_entries pe
                    where pe.user_id = b2.owner_id and pe.id = s2.source_entry_id)
     limit 0;`);
  console.log('  OK (predicate plans cleanly)');

  console.log('Step 5: the trigger wiring is untouched...');
  const [trg] = await sql(`
    select t.tgname, t.tgdeferrable, t.tginitdeferred
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'collections'
      and t.tgname = 'collections_demote_placements';`);
  if (!trg) fail('collections_demote_placements trigger is missing');
  if (!trg.tgdeferrable || !trg.tginitdeferred) fail('trigger is no longer deferred to commit');
  console.log('  OK (deferred constraint trigger on collections DELETE)');

  console.log('Step 6: the state after...');
  const [after] = await sql(CENSUS);
  console.log(`  demote-damaged card pockets: ${after.damaged}`);
  console.log(`  stamped card pockets total : ${after.card_stamps}`);
  console.log(`  stamped artwork pockets    : ${after.artwork_stamps}`);
  if (Number(after.damaged) !== 0) fail(`${after.damaged} damaged pocket(s) survived the repair`);
  if (Number(after.artwork_stamps) !== Number(before.artwork_stamps))
    fail('artwork stamps changed - the repair swept rows it must not touch');
  const freed = Number(before.damaged) - Number(after.damaged);
  console.log(`  -> ${freed} locked-away cop${freed === 1 ? 'y' : 'ies'} freed for placement.`);

  console.log('DONE.');
} catch (err) {
  if (process.exitCode !== 2) console.log(`FAILED: ${err.message}`);
  process.exitCode = 2;
}

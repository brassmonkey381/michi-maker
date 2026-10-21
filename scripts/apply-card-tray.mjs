/**
 * Apply supabase/migrations/20261022120000_card_tray.sql and prove it on the admin's own binders
 * AS THE ADMIN (RLS on): move one card pocket into its binder's tray through reseat_slots, read
 * it back as a tray row that no page lists, move it back to its cell. The page ends exactly as it
 * started.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { adminSql, appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261022120000_card_tray.sql');
const j = (x) => JSON.stringify(x);

step(1, 'applying the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
console.log('  OK');

step(2, 'the column, the constraint and the four owner policies are in place');
const [col] = await appSql(`
  select is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'binder_slots' and column_name = 'page_id';`);
if (!col || col.is_nullable !== 'YES') fail('binder_slots.page_id is still NOT NULL');
const [bcol] = await appSql(`
  select 1 as ok from information_schema.columns
   where table_schema = 'public' and table_name = 'binder_slots' and column_name = 'binder_id';`);
if (!bcol) fail('binder_slots.binder_id is missing');
const [chk] = await appSql(`select 1 as ok from pg_constraint where conname = 'binder_slots_page_or_tray';`);
if (!chk) fail('the page-or-tray check is missing');
const pols = await appSql(`
  select policyname, qual, with_check from pg_policies
   where schemaname = 'public' and tablename = 'binder_slots'
     and policyname in ('Slots of owned binders are viewable','Owners can insert slots','Owners can update slots','Owners can delete slots');`);
if (pols.length !== 4) fail(`expected 4 owner policies, found ${pols.length}`);
for (const p of pols) {
  const text = `${p.qual ?? ''} ${p.with_check ?? ''}`;
  if (!text.includes('binder_id')) fail(`policy "${p.policyname}" does not know the tray path`);
}
console.log('  OK');

step(3, 'a card goes to the tray and back, as the admin, through reseat_slots');
const [pick] = await appSql(`
  select s.id, s.page_id, b.id as binder_id, s.row_index, s.col_index
    from public.binder_slots s
    join public.binder_pages pg on pg.id = s.page_id
    join public.binders b on b.id = pg.binder_id
    join public.profiles pr on pr.id = b.owner_id
   where pr.username = 'fakemichi' and s.slot_type = 'card' and s.card_id is not null
     and s.row_span = 1 and s.col_span = 1
   order by s.created_at limit 1;`);
if (!pick) {
  console.log('  no card pocket to probe with; the function is in place');
} else {
  const toTray = j([{ id: pick.id, binder_id: pick.binder_id, row_index: 0, col_index: 0 }]);
  const [a] = await adminSql(`select public.reseat_slots('${toTray}'::jsonb) as n;`);
  if (a.n !== 1) fail(`to tray: moved ${a.n}`);
  const [mid] = await appSql(`select page_id, binder_id, col_index from public.binder_slots where id = '${pick.id}';`);
  if (mid.page_id !== null || mid.binder_id !== pick.binder_id) fail(`the tray move did not land: ${j(mid)}`);
  // Nobody else can see it: the public-viewing policy goes through a page, and there is none.
  const [seen] = await appSql(`
    select count(*)::int as n from public.binder_slots s
     where s.id = '${pick.id}' and exists (
       select 1 from public.binder_pages pg where pg.id = s.page_id);`);
  if (seen.n !== 0) fail('a tray row still joins to a page');
  const back = j([{ id: pick.id, page_id: pick.page_id, row_index: pick.row_index, col_index: pick.col_index }]);
  const [b] = await adminSql(`select public.reseat_slots('${back}'::jsonb) as n;`);
  if (b.n !== 1) fail(`back to the page: moved ${b.n}`);
  const [end] = await appSql(`select page_id, binder_id, row_index, col_index from public.binder_slots where id = '${pick.id}';`);
  if (end.page_id !== pick.page_id || end.binder_id !== null || end.row_index !== pick.row_index || end.col_index !== pick.col_index) fail(`the pocket did not come back: ${j(end)}`);
  console.log('  OK: to the tray and back, one transaction each, page unchanged');
}

console.log('DONE.');

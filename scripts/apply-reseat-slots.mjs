/**
 * Apply supabase/migrations/20261021120000_reseat_slots.sql and prove it on the admin's own
 * binders: swap the first two card pockets of a page in one call, read the result, swap them back.
 * The page ends exactly as it started.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appSql, fail, step } from './lib/michi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261021120000_reseat_slots.sql');
const j = (x) => JSON.stringify(x);

step(1, 'applying the migration');
await appSql(readFileSync(MIGRATION, 'utf8'));
console.log('  OK');

step(2, 'the function exists and runs as the caller');
const [fn] = await appSql(`
  select p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reseat_slots';`);
if (!fn) fail('reseat_slots is missing');
if (fn.definer) fail('reseat_slots must be security invoker');
console.log('  OK');

step(3, 'two pockets trade cells in one call, then trade back');
const PICK = `
  create temp table probe_two as
    select s.id, s.page_id, s.row_index, s.col_index
      from public.binder_slots s
      join public.binder_pages pg on pg.id = s.page_id
      join public.binders b on b.id = pg.binder_id
      join public.profiles pr on pr.id = b.owner_id
     where pr.username = 'fakemichi' and s.slot_type = 'card' and s.card_id is not null
       and s.row_span = 1 and s.col_span = 1
       and (select count(*) from public.binder_slots x where x.page_id = s.page_id and x.slot_type = 'card') >= 2
     order by s.page_id, s.row_index, s.col_index limit 2;`;
const SWAP = `
  select public.reseat_slots((
    select jsonb_agg(jsonb_build_object('id', me.id, 'page_id', me.page_id, 'row_index', o.row_index, 'col_index', o.col_index))
      from probe_two me join public.binder_slots o on o.id <> me.id and o.id in (select id from probe_two)));`;
const rows = await appSql(`
  ${PICK}
  ${SWAP}
  create temp table probe_mid as select id, row_index, col_index from public.binder_slots where id in (select id from probe_two);
  ${SWAP}
  select t.id, t.row_index as r0, t.col_index as c0, m.row_index as r1, m.col_index as c1,
         s.row_index as r2, s.col_index as c2
    from probe_two t join probe_mid m on m.id = t.id join public.binder_slots s on s.id = t.id
   order by t.row_index, t.col_index;`);
if (rows.length < 2) {
  console.log('  no page with two card pockets to probe with; the function is in place');
} else {
  const [a, b] = rows;
  if (!(a.r1 === b.r0 && a.c1 === b.c0 && b.r1 === a.r0 && b.c1 === a.c0)) fail(`the swap did not land: ${j(rows)}`);
  if (!(a.r2 === a.r0 && a.c2 === a.c0 && b.r2 === b.r0 && b.c2 === b.c0)) fail(`the swap back did not land: ${j(rows)}`);
  console.log('  OK: swapped and restored in two single-transaction calls');
}
console.log('DONE.');

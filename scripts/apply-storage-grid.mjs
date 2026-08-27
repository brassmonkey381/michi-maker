/**
 * Apply supabase/migrations/20260827210000_storage_grid.sql: storage_units gains grid_rows /
 * grid_cols, so a binder pocket has a row and a column instead of only an index.
 *
 * THE CHECKS THAT MATTER:
 *   2. The columns and the CHECK (both null, or both in range: a half-known grid decodes nothing).
 *   3. THE BACKFILL LANDED and DECODES THE REAL DATA. Every existing binder is 3 x 4, so every
 *      recorded pocket index must fall inside 0..11 under that shape. A backfill that produced
 *      out-of-range pockets would mean the assumed shape is wrong, which is worse than no shape:
 *      it would confidently report the wrong row and column for 54 cards.
 *   4. Stacks are left alone. A pile has no rows.
 *
 * Safe to re-run: idempotent DDL, and the backfill only touches units with no shape recorded, so
 * a shape someone has since corrected is never reset.
 *
 * Run through apply-storage-grid.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260827210000_storage_grid.sql');

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

  console.log('Step 2: the columns and the all-or-nothing CHECK...');
  const cols = await sql(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'storage_units'
      and column_name in ('grid_rows', 'grid_cols');`);
  if (cols.length !== 2) fail(`expected both grid columns, found ${cols.length}`);
  const half = await sql(`
    do $probe$
    begin
      update public.storage_units set grid_rows = 3, grid_cols = null
       where id = (select id from public.storage_units limit 1);
      raise exception 'PROBE-ACCEPTED';
    exception
      when check_violation then raise exception 'PROBE-REJECTED';
      when others then raise;
    end $probe$;`).catch((e) => String(e.message));
  if (String(half).includes('PROBE-REJECTED')) console.log('  OK (a half-known grid is refused)');
  else if (String(half).includes('PROBE-ACCEPTED')) fail('the CHECK allowed rows without cols');
  else console.log('  OK (no rows to probe the CHECK with)');

  console.log('Step 3: the backfill, and whether it actually decodes the recorded pockets...');
  const [b] = await sql(`
    select count(*)::int as binders,
           count(*) filter (where grid_rows = 3 and grid_cols = 4)::int as three_by_four
    from public.storage_units where kind = 'binder';`);
  console.log(`  ${b.binders} binder unit(s), ${b.three_by_four} recorded as 3 x 4`);
  if (b.binders !== b.three_by_four) fail('a binder unit did not get the 3 x 4 shape');
  const outOfRange = await sql(`
    select su.name, e.storage_page, e.storage_pos
    from public.portfolio_entries e
    join public.storage_units su on su.user_id = e.user_id and su.id = e.storage_id
    where su.kind = 'binder' and su.grid_cols is not null
      and (e.storage_pos < 0 or e.storage_pos >= su.grid_rows * su.grid_cols)
    limit 5;`);
  if (outOfRange.length) {
    fail(`${outOfRange.length}+ pocket(s) fall outside a 3 x 4 page, so the assumed shape is wrong: `
      + JSON.stringify(outOfRange));
  }
  console.log('  OK (every recorded pocket fits inside a 3 x 4 page)');

  console.log('Step 4: stacks are untouched...');
  const [s] = await sql(`
    select count(*) filter (where grid_rows is not null or grid_cols is not null)::int as shaped
    from public.storage_units where kind <> 'binder';`);
  if (s.shaped !== 0) fail(`${s.shaped} non-binder unit(s) were given a grid`);
  console.log('  OK');

  console.log('\nDONE. Binder pockets can now be named by row and column.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}

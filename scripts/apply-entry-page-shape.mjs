/**
 * Apply supabase/migrations/20260828140000_entry_page_shape.sql: portfolio_entries gains
 * storage_rows / storage_cols, so a scanned binder page carries its own shape and is
 * structurally the same object as a michi binder page.
 *
 * THE CHECKS THAT MATTER:
 *   2. Both columns exist, are nullable, have NO default and join NO constraint. The
 *      batch-poisoning rule: nothing about these may ever reject a sync upsert, and that
 *      includes the 1..6 range michi enforces on its own pages (a scan can infer a phantom 3x5,
 *      and the place to refuse that is the export, not the queue).
 *   3. An insert WITHOUT them still lands (old clients, michi's CSV import).
 *   4. CENSUS of what is already recorded: how many binder entries could be redrawn today, how
 *      many still depend on the unit-level fallback, and whether any recorded shape is outside
 *      michi's 1..6 and so not one-for-one recreatable.
 *
 * Safe to re-run: idempotent DDL, read-only checks.
 *
 * Run through apply-entry-page-shape.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260828140000_entry_page_shape.sql');

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

  console.log('Step 2: both columns, and that neither can reject a row...');
  const cols = await sql(`
    select column_name, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'portfolio_entries'
      and column_name in ('storage_rows', 'storage_cols') order by column_name;`);
  if (cols.length !== 2) fail(`expected 2 columns, found ${cols.map((c) => c.column_name).join(', ') || 'none'}`);
  for (const c of cols) {
    if (c.is_nullable !== 'YES') fail(`${c.column_name} is NOT NULL, which can poison a sync batch`);
    if (c.column_default !== null) fail(`${c.column_name} has a default (${c.column_default})`);
  }
  const cons = await sql(`
    select c.conname from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'portfolio_entries'
      and exists (
        select 1 from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where a.attname in ('storage_rows', 'storage_cols'));`);
  if (cons.length) fail(`shape columns joined constraint(s): ${cons.map((c) => c.conname).join(', ')}`);
  console.log('  OK (both nullable, no defaults, no constraints)');

  console.log('Step 3: an insert without them still lands...');
  const legacy = await sql(`
    do $probe$
    declare v_user uuid; v_rows integer;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then raise exception 'PROBE-SKIP: every user already owns a collection'; end if;
      insert into public.collections (id, user_id, name) values ('probe-col-shape', v_user, 'probe');
      insert into public.portfolio_entries
          (id, collection_id, user_id, card_id, variant, condition, quantity)
        values ('probe-entry-shape', 'probe-col-shape', v_user, 'probe-card', 'Normal', 'Near Mint', 1);
      select storage_rows into v_rows from public.portfolio_entries
        where user_id = v_user and id = 'probe-entry-shape';
      if v_rows is not null then raise exception 'PROBE-FAIL: storage_rows defaulted to %', v_rows; end if;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(legacy).includes('PROBE-OK')) console.log('  OK (rolled back)');
  else if (String(legacy).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`legacy insert probe: ${String(legacy).slice(0, 300)}`);

  console.log('Step 4: what is recorded today (census, nothing is written)...');
  const [c] = await sql(`
    select
      count(*) filter (where e.storage_id is not null and e.storage_page is not null)::int as binder_entries,
      count(*) filter (where e.storage_cols is not null)::int as with_own_shape,
      count(*) filter (where e.storage_cols is null and u.grid_cols is not null)::int as unit_fallback,
      count(*) filter (where e.storage_cols is null and u.grid_cols is null)::int as no_shape_at_all
    from public.portfolio_entries e
    left join public.storage_units u on u.user_id = e.user_id and u.id = e.storage_id
    where e.storage_id is not null and e.storage_page is not null;`);
  console.log(`  binder entries: ${c.binder_entries}`);
  console.log(`     own page shape: ${c.with_own_shape}   unit fallback: ${c.unit_fallback}   no shape: ${c.no_shape_at_all}`);
  // michi's binder_pages constrains rows/cols to 1..6. A shape outside it is honest data that
  // simply cannot be drawn as a michi page, so the export has to refuse it rather than round it.
  const wide = await sql(`
    select 'entry' as src, storage_rows as r, storage_cols as c, count(*)::int as n
      from public.portfolio_entries
     where storage_cols is not null and (storage_rows > 6 or storage_cols > 6
            or storage_rows < 1 or storage_cols < 1)
     group by 1, 2, 3
    union all
    select 'unit', grid_rows, grid_cols, count(*)::int
      from public.storage_units
     where grid_cols is not null and (grid_rows > 6 or grid_cols > 6)
     group by 1, 2, 3;`);
  if (wide.length) {
    for (const w of wide) console.log(`     NOT MICHI-DRAWABLE: ${w.src} ${w.r}x${w.c} (${w.n}) - outside michi's 1..6`);
  } else {
    console.log('     every recorded shape fits michi\'s 1..6, so every binder is recreatable');
  }

  console.log('\nDONE. Pages can carry their own shape; the client can start recording it.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}

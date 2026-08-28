/**
 * Apply supabase/migrations/20260828150000_storage_unit_page_count.sql: storage_units.page_count,
 * the reach a binder has been scanned to, INCLUDING pages whose cards were all discarded.
 *
 * THE CHECKS THAT MATTER:
 *   2. The column exists, is nullable, has no default and joins no constraint (a rejected row
 *      poisons the whole sync batch).
 *   3. An old client's insert - one that has never heard of the column - still lands.
 *   4. CENSUS + SAFETY: for every binder, page_count against the highest page its entries reach.
 *      page_count is only ever allowed to be >= that maximum, because a smaller value would pull
 *      the next session back on top of pages that already hold cards. Anything smaller is
 *      reported as a defect rather than silently tolerated.
 *
 * Safe to re-run: idempotent DDL, read-only checks.
 *
 * Run through apply-page-count.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260828150000_storage_unit_page_count.sql',
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

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: the column, and that it cannot reject a row...');
  const [col] = await sql(`
    select is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'storage_units' and column_name = 'page_count';`);
  if (!col) fail('page_count is missing');
  if (col.is_nullable !== 'YES') fail('page_count is NOT NULL, which can poison a sync batch');
  if (col.column_default !== null) fail(`page_count has a default (${col.column_default})`);
  const cons = await sql(`
    select c.conname from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'storage_units'
      and exists (
        select 1 from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where a.attname = 'page_count');`);
  if (cons.length) fail(`page_count joined constraint(s): ${cons.map((c) => c.conname).join(', ')}`);
  console.log('  OK (nullable, no default, no constraints)');

  console.log('Step 3: an old client\'s insert still lands...');
  const legacy = await sql(`
    do $probe$
    declare v_user uuid; v_pc integer;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then raise exception 'PROBE-SKIP: every user already owns a collection'; end if;
      insert into public.collections (id, user_id, name) values ('probe-col-pc', v_user, 'probe');
      insert into public.storage_units (id, user_id, collection_id, name, kind)
        values ('probe-unit-pc', v_user, 'probe-col-pc', 'probe', 'binder');
      select page_count into v_pc from public.storage_units
        where user_id = v_user and id = 'probe-unit-pc';
      if v_pc is not null then raise exception 'PROBE-FAIL: page_count defaulted to %', v_pc; end if;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(legacy).includes('PROBE-OK')) console.log('  OK (rolled back)');
  else if (String(legacy).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`legacy insert probe: ${String(legacy).slice(0, 300)}`);

  console.log('Step 4: every binder\'s reach against the pages its cards occupy...');
  const rows = await sql(`
    select u.name, u.page_count,
           coalesce(max(e.storage_page), 0)::int as entry_max,
           count(e.id)::int as cards
      from public.storage_units u
      left join public.portfolio_entries e
        on e.user_id = u.user_id and e.storage_id = u.id
     where u.kind = 'binder'
     group by u.id, u.name, u.page_count
     order by u.name;`);
  if (!rows.length) console.log('  (no binders yet)');
  for (const r of rows) {
    const pc = r.page_count == null ? 'unset' : String(r.page_count);
    console.log(`     "${r.name}": reach ${pc}, cards reach page ${r.entry_max} (${r.cards} cards)`);
  }
  // A reach BELOW the entry maximum would pull the next session back onto filled pages. Nothing
  // writes that today (the setter raises only), so finding one means something else did.
  const bad = rows.filter((r) => r.page_count != null && r.page_count < r.entry_max);
  if (bad.length) fail(`${bad.length} binder(s) record a reach below their own cards' pages`);
  console.log('  OK (no binder reaches back over its own filled pages)');

  console.log('\nDONE. A discarded last page no longer shifts the next session.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}

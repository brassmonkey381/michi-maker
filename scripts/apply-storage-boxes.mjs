/**
 * Apply supabase/migrations/20261103120000_storage_boxes_and_codes.sql: kind 'box', a stack's
 * parent_id (its box), and per-account codes (Bi n / Bo n / S n), with the backfill.
 *
 * THE CHECKS THAT MATTER:
 *   2. kind accepts 'box' and still accepts the three old kinds.
 *   3. parent_id and code are nullable, have no default and join no constraint (a rejected row
 *      poisons the whole sync batch).
 *   4. An old client's insert, one that has never heard of either column, still lands.
 *   5. CENSUS: units by kind, stacks left without a box (must be 0), units without a code (must be
 *      0 for binder/box/stack), and duplicate codes (reported, never an error: offline devices can
 *      mint the same number and the client resolves it).
 *
 * Safe to re-run: idempotent DDL, and the backfill only fills what is still empty.
 *
 * Run through apply-storage-boxes.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261103120000_storage_boxes_and_codes.sql');

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

  console.log("Step 2: kind accepts 'box' and the old kinds...");
  const [chk] = await sql(`
    select pg_get_constraintdef(c.oid) as def from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'storage_units' and c.conname = 'storage_units_kind_check';`);
  if (!chk) fail('storage_units_kind_check is missing');
  for (const k of ['binder', 'stack', 'box', 'other']) {
    if (!chk.def.includes(`'${k}'`)) fail(`kind check does not allow '${k}': ${chk.def}`);
  }
  console.log('  OK');

  console.log('Step 3: the new columns cannot reject a row...');
  for (const name of ['parent_id', 'code']) {
    const [col] = await sql(`
      select is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'storage_units' and column_name = '${name}';`);
    if (!col) fail(`${name} is missing`);
    if (col.is_nullable !== 'YES') fail(`${name} is NOT NULL, which can poison a sync batch`);
    if (col.column_default !== null) fail(`${name} has a default (${col.column_default})`);
    const cons = await sql(`
      select c.conname from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname = 'storage_units'
        and exists (
          select 1 from unnest(c.conkey) k
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
          where a.attname = '${name}');`);
    if (cons.length) fail(`${name} joined constraint(s): ${cons.map((c) => c.conname).join(', ')}`);
  }
  console.log('  OK (both nullable, no default, no constraints)');

  console.log("Step 4: an old client's insert still lands...");
  const legacy = await sql(`
    do $probe$
    declare v_user uuid;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then raise exception 'PROBE-SKIP: every user already owns a collection'; end if;
      insert into public.collections (id, user_id, name) values ('probe-col-box', v_user, 'probe');
      insert into public.storage_units (id, user_id, collection_id, name, kind)
        values ('probe-unit-stack', v_user, 'probe-col-box', 'probe', 'stack');
      insert into public.storage_units (id, user_id, collection_id, name, kind, parent_id, code)
        values ('probe-unit-box', v_user, 'probe-col-box', '', 'box', null, 1);
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(legacy).includes('PROBE-OK')) console.log('  OK (old and new shapes both land; rolled back)');
  else if (String(legacy).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`insert probe: ${String(legacy).slice(0, 300)}`);

  console.log('Step 5: census...');
  const kinds = await sql(`select kind, count(*)::int as n from public.storage_units group by kind order by kind;`);
  console.log(`  units: ${kinds.map((k) => `${k.kind} ${k.n}`).join(', ') || 'none'}`);
  const [orphans] = await sql(`select count(*)::int as n from public.storage_units where kind = 'stack' and parent_id is null;`);
  if (orphans.n) fail(`${orphans.n} stack(s) still have no box`);
  const [uncoded] = await sql(`select count(*)::int as n from public.storage_units where kind in ('binder','box','stack') and code is null;`);
  if (uncoded.n) fail(`${uncoded.n} unit(s) still have no code`);
  const dups = await sql(`
    select kind, code, count(*)::int as n from public.storage_units
    where code is not null group by user_id, kind, code having count(*) > 1;`);
  console.log(dups.length ? `  NOTE: ${dups.length} duplicate code(s); the app renumbers the later one` : '  no duplicate codes');
  console.log('  OK');

  console.log('DONE: boxes and codes are live. The app update that uses them can ship now.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

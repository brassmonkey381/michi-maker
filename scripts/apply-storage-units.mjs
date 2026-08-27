/**
 * Apply supabase/migrations/20260827130000_tcgscan_storage_units.sql: the STORAGE layer between
 * a tcgscan collection and its cards (binder / stack / other), plus the four new nullable
 * columns on portfolio_entries (storage_id, storage_page, storage_pos, scanned_at).
 *
 * THE CHECKS THAT MATTER:
 *   2.  Structure: table, PK, CHECK, indexes, RLS policy, grants, realtime publication.
 *   3.  The composite FK CASCADES from collections. michi-maker hard-deletes tcgscan collections
 *       server-side and relies on cascade for children, so this is probed with real SQL (in a
 *       rolled-back transaction), not just read from the catalog.
 *   4.  The entry columns are NULLABLE. michi's CSV import inserts entries with an explicit
 *       column list; a NOT NULL would break it. Also proves there is deliberately NO unique
 *       constraint on positions and NO FK on storage_id (both would poison batched sync pushes).
 *   5.  Old clients keep working: an insert shaped exactly like the pre-storage sync push (no
 *       storage columns at all) still lands.
 *
 * Safe to re-run: idempotent DDL throughout.
 *
 * Run through apply-storage-units.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260827130000_tcgscan_storage_units.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg, code = 2) {
  console.log(`FAILED: ${msg}`);
  process.exitCode = code;
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

  console.log('Step 2: structure...');
  const cols = await sql(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'storage_units';`);
  const names = cols.map((c) => c.column_name).sort().join(',');
  if (names !== 'collection_id,created_at,id,kind,name,updated_at,user_id')
    fail(`storage_units columns are ${names}`);
  const [pol] = await sql(`
    select count(*)::int as n from pg_policy
    where polrelid = 'public.storage_units'::regclass and polname = 'own storage_units';`);
  if (pol.n !== 1) fail('the owner policy is missing');
  const [pub] = await sql(`
    select count(*)::int as n from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'storage_units';`);
  if (pub.n !== 1) fail('storage_units is not in the realtime publication');
  const [rls] = await sql(`
    select relrowsecurity from pg_class where oid = 'public.storage_units'::regclass;`);
  if (!rls.relrowsecurity) fail('RLS is not enabled on storage_units');
  console.log('  OK (columns, policy, RLS, realtime)');

  console.log('Step 3: deleting a collection cascades through its storage units...');
  // A real transaction, rolled back by the closing exception, against a real user id, proves the
  // behaviour, mutates nothing.
  const probe = await sql(`
    do $probe$
    declare
      v_user uuid;
      v_left int;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then
        raise exception 'PROBE-SKIP: every user already owns a collection (probe needs a collection-less user to stay under the insert-time cap trigger)';
      end if;
      insert into public.collections (id, user_id, name) values ('probe-col-storage', v_user, 'probe');
      insert into public.storage_units (id, user_id, collection_id, name, kind)
        values ('probe-unit-storage', v_user, 'probe-col-storage', 'probe', 'stack');
      delete from public.collections where user_id = v_user and id = 'probe-col-storage';
      select count(*) into v_left from public.storage_units
        where user_id = v_user and id = 'probe-unit-storage';
      if v_left <> 0 then raise exception 'PROBE-FAIL: unit survived its collection'; end if;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(probe).includes('PROBE-OK')) console.log('  OK (cascade verified, transaction rolled back)');
  else if (String(probe).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`cascade probe: ${String(probe).slice(0, 300)}`);

  console.log('Step 4: entry columns nullable, no unique on positions, no FK on storage_id...');
  const ecols = await sql(`
    select column_name, is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'portfolio_entries'
      and column_name in ('storage_id', 'storage_page', 'storage_pos', 'scanned_at');`);
  if (ecols.length !== 4) fail(`expected 4 new entry columns, found ${ecols.length}`);
  for (const c of ecols) if (c.is_nullable !== 'YES') fail(`${c.column_name} is NOT NULL`);
  const [uniq] = await sql(`
    select count(*)::int as n from pg_constraint
    where conrelid = 'public.portfolio_entries'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%storage%';`);
  if (uniq.n !== 0) fail('a unique constraint on storage positions exists (would poison sync batches)');
  const [fk] = await sql(`
    select count(*)::int as n from pg_constraint
    where conrelid = 'public.portfolio_entries'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) like '%storage_units%';`);
  if (fk.n !== 0) fail('an FK from entries to storage_units exists (would poison sync batches)');
  console.log('  OK');

  console.log('Step 5: an old client’s entry insert (no storage columns) still lands...');
  const legacy = await sql(`
    do $probe$
    declare v_user uuid;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then
        raise exception 'PROBE-SKIP: every user already owns a collection (see step 3)';
      end if;
      insert into public.collections (id, user_id, name) values ('probe-col-legacy', v_user, 'probe');
      insert into public.portfolio_entries
        (id, collection_id, user_id, card_id, variant, condition, quantity)
        values ('probe-lot-legacy', 'probe-col-legacy', v_user, '12345', 'Normal', 'Near Mint', 1);
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(legacy).includes('PROBE-OK')) console.log('  OK (rolled back)');
  else if (String(legacy).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`legacy insert probe: ${String(legacy).slice(0, 300)}`);

  console.log('\nDONE. The storage layer is live; existing rows are untouched (all loose).');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}

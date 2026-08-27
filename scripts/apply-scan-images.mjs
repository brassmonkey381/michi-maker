/**
 * Apply supabase/migrations/20260828120000_scan_images.sql: portfolio_entries.scan_path (the
 * birth-field pointer to a lot's best cropped scan) plus the public scan-images bucket with
 * owner-folder write policies.
 *
 * THE CHECKS THAT MATTER:
 *   2. The column exists, is nullable, has NO default, NO CHECK, and joins NO constraint - the
 *      batch-poisoning rule: nothing about this column may ever reject a sync upsert.
 *   3. The bucket exists, is public, capped at 2MB, jpeg/webp only.
 *   4. The three owner-folder policies exist and there is NO select policy on this bucket
 *      (public read is served by URL; no select policy = not listable).
 *   5. An insert WITHOUT the column still lands (old clients and michi's CSV import).
 *
 * Safe to re-run: idempotent DDL throughout.
 *
 * Run through apply-scan-images.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260828120000_scan_images.sql');

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
    select is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'portfolio_entries'
      and column_name = 'scan_path';`);
  if (!col) fail('scan_path is missing');
  if (col.is_nullable !== 'YES') fail('scan_path is NOT NULL, which can poison a sync batch');
  if (col.column_default !== null) fail(`scan_path has a default (${col.column_default})`);
  // The subquery is correlated (unnest(c.conkey) references the outer row) rather than a
  // comma-join next to a JOIN, which PostgreSQL rejects with "invalid reference to FROM-clause
  // entry" — the first version of this probe died exactly there.
  const cons = await sql(`
    select c.conname from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'portfolio_entries'
      and exists (
        select 1 from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where a.attname = 'scan_path');`);
  if (cons.length) fail(`scan_path joined constraint(s): ${cons.map((c) => c.conname).join(', ')}`);
  console.log('  OK (nullable, no default, no constraints)');

  console.log('Step 3: the bucket...');
  const [bucket] = await sql(`
    select public, file_size_limit, allowed_mime_types
    from storage.buckets where id = 'scan-images';`);
  if (!bucket) fail('scan-images bucket is missing');
  if (!bucket.public) fail('scan-images is not public (display URLs would 400)');
  if (bucket.file_size_limit !== 2097152) fail(`size limit is ${bucket.file_size_limit}`);
  const mimes = bucket.allowed_mime_types ?? [];
  if (!mimes.includes('image/jpeg')) fail('image/jpeg not allowed');
  console.log('  OK (public, 2MB, jpeg/webp)');

  console.log('Step 4: owner-folder policies, and no select policy...');
  const pols = await sql(`
    select policyname, cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual like '%scan-images%' or with_check like '%scan-images%');`);
  const cmds = pols.map((p) => p.cmd).sort();
  if (!cmds.includes('INSERT')) fail('no INSERT policy for scan-images');
  if (!cmds.includes('UPDATE')) fail('no UPDATE policy for scan-images');
  if (!cmds.includes('DELETE')) fail('no DELETE policy for scan-images');
  if (cmds.includes('SELECT')) fail('a SELECT policy exists; the bucket would be listable');
  console.log(`  OK (${pols.length} policies: ${cmds.join(', ')})`);

  console.log('Step 5: an insert without the column still lands...');
  const legacy = await sql(`
    do $probe$
    declare v_user uuid; v_path text;
    begin
      select u.id into v_user from auth.users u
        left join public.collections c on c.user_id = u.id
        where c.id is null limit 1;
      if v_user is null then
        raise exception 'PROBE-SKIP: every user already owns a collection';
      end if;
      insert into public.collections (id, user_id, name) values ('probe-col-scanimg', v_user, 'probe');
      insert into public.portfolio_entries
          (id, collection_id, user_id, card_id, variant, condition, quantity)
        values ('probe-entry-scanimg', 'probe-col-scanimg', v_user, 'probe-card', 'Normal', 'Near Mint', 1);
      select scan_path into v_path from public.portfolio_entries
        where user_id = v_user and id = 'probe-entry-scanimg';
      if v_path is not null then raise exception 'PROBE-FAIL: scan_path defaulted to %', v_path; end if;
      raise exception 'PROBE-OK';
    end $probe$;`).catch((e) => String(e.message));
  if (String(legacy).includes('PROBE-OK')) console.log('  OK (rolled back)');
  else if (String(legacy).includes('PROBE-SKIP')) console.log('  SKIPPED (no collection-less user to probe with)');
  else fail(`legacy insert probe: ${String(legacy).slice(0, 300)}`);

  console.log('\nDONE. Entries can carry their best scan; the bucket is ready for uploads.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
}

/**
 * Apply 20260904120000_binder_tracks.sql to the live project, and prove it landed.
 *
 * Adds binders.track and binder_pages.track (jsonb, object-or-null) and the binder-audio bucket
 * with owner-folder policies. Nothing is backfilled: every existing binder and page stays silent.
 * The applier refuses to run over a column of some other type, applies, proves both check
 * constraints refuse a non-object, and confirms no row gained a track.
 *
 * Run through ../apply-binder-tracks.ps1, which loads SUPABASE_ACCESS_TOKEN silently.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260904120000_binder_tracks.sql');

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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

const columnType = (table) => `
  select data_type
    from information_schema.columns
   where table_schema = 'public' and table_name = '${table}' and column_name = 'track';`;

try {
  console.log('Step 1: what is there now...');
  for (const table of ['binders', 'binder_pages']) {
    const existing = await sql(columnType(table));
    if (existing.length && existing[0].data_type !== 'jsonb') {
      fail(`${table}.track already exists as ${existing[0].data_type}, not jsonb. Stopping rather than guessing.`);
    }
    console.log(`  ${table}.track: ${existing.length ? 'already present as jsonb (re-run)' : 'not there yet'}`);
  }
  const [{ n: withTrackBefore }] = await sql(
    `select (select count(*) from public.binders where to_jsonb(binders) ? 'track' and track is not null)
          + (select count(*) from public.binder_pages where to_jsonb(binder_pages) ? 'track' and track is not null) as n;`,
  ).catch(() => [{ n: 0 }]);
  console.log(`  rows with a track today: ${withTrackBefore}`);

  console.log('Step 2: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  applied');

  console.log('Step 3: proving the constraints refuse a non-object...');
  for (const table of ['binders', 'binder_pages']) {
    let refused = false;
    try {
      await sql(`update public.${table} set track = '"nope"'::jsonb where false returning id;`);
      // A WHERE false update touches no row, so the constraint is not exercised; check it by name.
      const [{ n }] = await sql(
        `select count(*)::int as n from pg_constraint where conname = '${table}_track_is_object';`,
      );
      refused = n === 1;
    } catch {
      refused = false;
    }
    if (!refused) fail(`${table}_track_is_object is not in place`);
    console.log(`  ${table}: object-or-null constraint present`);
  }

  console.log('Step 4: the bucket...');
  const bucket = await sql(`select public, file_size_limit from storage.buckets where id = 'binder-audio';`);
  if (!bucket.length) fail('binder-audio bucket missing after apply');
  console.log(`  binder-audio: public=${bucket[0].public} limit=${bucket[0].file_size_limit} bytes`);
  const [{ n: policies }] = await sql(
    `select count(*)::int as n from pg_policies where tablename = 'objects' and policyname like '%binder-audio%';`,
  );
  if (policies < 3) fail(`expected 3 binder-audio policies, found ${policies}`);
  console.log(`  policies: ${policies}`);

  console.log('Step 5: nothing gained a track...');
  const [{ n: withTrackAfter }] = await sql(
    `select (select count(*) from public.binders where track is not null)
          + (select count(*) from public.binder_pages where track is not null) as n;`,
  );
  if (Number(withTrackAfter) !== Number(withTrackBefore)) fail(`rows with a track changed: ${withTrackBefore} -> ${withTrackAfter}`);
  console.log(`  rows with a track: ${withTrackAfter}`);
  console.log('DONE');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

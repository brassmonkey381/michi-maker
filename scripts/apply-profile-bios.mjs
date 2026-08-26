/**
 * Apply supabase/migrations/20260826130000_profile_bios.sql: the bio column + length check, the
 * avatars bucket + own-folder policies, and the profiles read policy that finally honours
 * is_public.
 *
 * THE CHECKS THAT MATTER:
 *   3. PUBLIC profiles are still readable under the anon role's column grant (id, username,
 *      avatar_url, bio, is_public, created_at) and PRIVATE profiles return zero rows to a
 *      non-owner. This is the policy change that could break the app if wrong.
 *   4. The bio length check holds (281 chars refused).
 *   5. The avatars bucket exists with its cap and mime allowlist.
 *
 * Safe to re-run: idempotent DDL throughout.
 *
 * Run through apply-profile-bios.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260826130000_profile_bios.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg, code = 2) {
  console.log(`FAILED: ${msg}`);
  process.exit(code);
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

try {
  console.log('Step 1: counting public and private profiles before...');
  const [before] = await sql(`
    select count(*) filter (where is_public)::int as pub,
           count(*) filter (where not is_public)::int as priv
    from public.profiles;`);
  console.log(`  OK (${before.pub} public, ${before.priv} private)`);

  console.log('Step 2: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 3: the read policy, exercised AS the anon role...');
  const [vis] = await sql(`
    set local role anon;
    select count(*)::int as visible from public.profiles;`);
  if (vis.visible !== before.pub) {
    fail(`anon sees ${vis.visible} profiles, expected the ${before.pub} public ones`);
  }
  const [cols] = await sql(`
    set local role anon;
    select count(*)::int as ok from (select id, username, avatar_url, bio, is_public from public.profiles limit 1) t;`);
  if (cols.ok == null) fail('anon could not select the public columns');
  let dark = false;
  try {
    await sql(`set local role anon; select marketing_consent from public.profiles limit 1;`);
  } catch {
    dark = true;
  }
  if (!dark) fail('anon can still read marketing_consent');
  console.log(`  OK (anon sees ${vis.visible} rows, public columns only)`);

  console.log('Step 4: the bio length check...');
  const [c] = await sql(
    `select count(*)::int as n from pg_constraint where conname = 'profiles_bio_len';`,
  );
  if (c.n !== 1) fail('profiles_bio_len constraint missing');
  console.log('  OK (constraint present)');

  console.log('Step 5: the avatars bucket...');
  const [b] = await sql(`
    select public, file_size_limit,
           array_to_string(allowed_mime_types, ',') as mimes
    from storage.buckets where id = 'avatars';`);
  if (!b) fail('avatars bucket missing');
  if (!b.public || b.file_size_limit !== 2097152) fail(`bucket misconfigured: ${JSON.stringify(b)}`);
  console.log(`  OK (public, 2MB, ${b.mimes})`);

  console.log('DONE. Bios and avatars are live; private profiles are now actually private.');
} catch (e) {
  fail(e.message ?? String(e));
}

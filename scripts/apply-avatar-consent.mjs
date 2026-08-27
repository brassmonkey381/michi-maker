/**
 * Apply supabase/migrations/20260826140000_avatar_consent.sql: stop publishing OAuth profile
 * photos nobody consented to.
 *
 * URGENT-PATH SCRIPT. The containment takes effect the instant step 2 runs, with no deploy: every
 * avatar surface already falls back to the initial circle when avatar_url is null.
 *
 * THE CHECKS THAT MATTER:
 *   1/3. The count of publicly-served avatars must fall to exactly the self-uploaded ones, and
 *        every provider photo must be gone. Reported before and after so the number is on record.
 *   4.   The provider URLs must STILL be recoverable from auth.users.raw_user_meta_data, or the
 *        consent prompt would have nothing to offer and this became a deletion instead of a hold.
 *   5.   A new signup no longer lands with a photo.
 *
 * Safe to re-run: idempotent DDL, and the backfill only ever moves un-consented rows to null.
 *
 * Run through apply-avatar-consent.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260826140000_avatar_consent.sql');
const HOSTED = "'%/storage/v1/object/public/avatars/%'";

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

const CENSUS = `
  select count(*) filter (where avatar_url is not null) as served,
         count(*) filter (where avatar_url is not null and avatar_url not like ${HOSTED}) as provider,
         count(*) filter (where avatar_url is not null and avatar_url like ${HOSTED}) as uploaded
  from public.profiles;`;

try {
  console.log('Step 1: how many avatars are being served right now...');
  const [before] = await sql(CENSUS);
  console.log(`  ${before.served} served (${before.provider} taken from a provider, ${before.uploaded} uploaded by hand)`);

  console.log('Step 2: applying the migration (the exposure ends here)...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 3: what is served now...');
  const [after] = await sql(CENSUS);
  if (after.provider !== 0) fail(`${after.provider} provider photo(s) still served`);
  if (after.uploaded !== before.uploaded) {
    fail(`self-uploaded avatars changed ${before.uploaded} -> ${after.uploaded}; they should be untouched`);
  }
  console.log(`  OK (${after.served} served, all self-uploaded; ${before.provider} provider photo(s) withdrawn)`);

  console.log('Step 4: the withdrawn photos are still offerable back to their owners...');
  const [recover] = await sql(`
    select count(*)::int as recoverable
    from auth.users u
    join public.profiles p on p.id = u.id
    where p.avatar_url is null
      and coalesce(u.raw_user_meta_data ->> 'avatar_url', '') <> '';`);
  if (recover.recoverable < before.provider) {
    fail(`only ${recover.recoverable} of ${before.provider} are recoverable from auth metadata`);
  }
  console.log(`  OK (${recover.recoverable} recoverable, so the consent prompt has something to offer)`);

  console.log('Step 5: a new signup no longer lands with a photo...');
  const [fn] = await sql(`
    select (prosrc not like '%avatar_url%')::boolean as clean
    from pg_proc where proname = 'handle_new_user';`);
  if (!fn?.clean) fail('handle_new_user still copies avatar_url');
  console.log('  OK');

  console.log('Step 6: a public avatar can only be one we host...');
  const [c] = await sql(`
    select count(*)::int as n from pg_constraint where conname = 'profiles_avatar_is_hosted';`);
  if (c.n !== 1) fail('profiles_avatar_is_hosted constraint missing');
  console.log('  OK');

  console.log('\nDONE. No provider photo is public. The consent prompt ships with the next deploy.');
} catch (e) {
  fail(e.message ?? String(e));
}

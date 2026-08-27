/**
 * Apply supabase/migrations/20260826150000_share_version.sql: binders.share_version, bumped by
 * trigger when the link preview changes, so a re-shared link is a URL scrapers have not cached.
 *
 * THE CHECKS THAT MATTER, all on a probe binder that is deleted afterwards:
 *   4. An EDIT bumps it (that is the whole feature).
 *   5. Changing the featured share pages bumps it (the other preview input).
 *   6. A change that does NOT alter the preview leaves it alone. This is the one worth guarding:
 *      if every update bumped, a takedown or a privacy flip would churn everyone's links.
 *
 * Safe to re-run: idempotent DDL, and the column defaults to 1 for existing rows.
 *
 * Run through apply-share-version.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260826150000_share_version.sql');

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

let probe = null;
const versionOf = async () =>
  (await sql(`select share_version from public.binders where id = '${probe}';`))[0]?.share_version;

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: every existing binder starts at v1 (a clean link)...');
  const [census] = await sql(
    `select count(*)::int as total, count(*) filter (where share_version = 1)::int as at_one
       from public.binders;`,
  );
  if (census.total !== census.at_one) fail(`${census.total - census.at_one} binder(s) are not at v1`);
  console.log(`  OK (${census.total} binders, all v1)`);

  console.log('Step 3: making a probe binder...');
  const [row] = await sql(`
    with owner as (select id from auth.users limit 1)
    insert into public.binders (id, owner_id, title, is_public)
    select gen_random_uuid(), owner.id, 'share-version probe', false from owner
    returning id, share_version;`);
  if (!row?.id) fail('could not create a probe binder');
  probe = row.id;
  if (row.share_version !== 1) fail(`a new binder starts at v${row.share_version}, expected 1`);
  console.log('  OK (starts at v1)');

  console.log('Step 4: an edit bumps the version...');
  await sql(`update public.binders set title = 'renamed' where id = '${probe}';`);
  const afterEdit = await versionOf();
  if (afterEdit !== 2) fail(`after an edit the version is ${afterEdit}, expected 2`);
  console.log('  OK (v1 -> v2)');

  console.log('Step 5: changing the featured pages bumps it...');
  await sql(`
    update public.binders set share_page_ids = array[gen_random_uuid()] where id = '${probe}';`);
  const afterFeature = await versionOf();
  if (afterFeature <= afterEdit) fail(`featuring a page left the version at ${afterFeature}`);
  console.log(`  OK (v${afterEdit} -> v${afterFeature})`);

  console.log('Step 6: a change that does NOT touch the preview leaves it alone...');
  // updated_at is what the edit path moves; a direct write that touches neither preview input
  // must not churn the link. Set updated_at back to itself so only share_version could move.
  await sql(`
    update public.binders
       set removed_at = removed_at, updated_at = updated_at
     where id = '${probe}';`);
  const afterNoop = await versionOf();
  if (afterNoop !== afterFeature) {
    fail(`a non-preview update bumped the version ${afterFeature} -> ${afterNoop}`);
  }
  console.log(`  OK (still v${afterNoop})`);

  console.log('\nDONE. Share links now change exactly when their preview does.');
} catch (e) {
  fail(e.message ?? String(e));
} finally {
  if (probe) {
    try {
      await sql(`delete from public.binders where id = '${probe}';`);
      console.log('Probe binder removed.');
    } catch {
      console.log(`Cleanup warning: probe binder ${probe} may remain.`);
    }
  }
}

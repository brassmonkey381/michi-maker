/**
 * Apply 20260826150000_share_version.sql + 20260826160000_preview_freshness.sql:
 * binders.share_version, bumped when the link preview changes so a re-shared link is a URL
 * scrapers have not cached, plus the propagation that makes a card edit count as a change.
 *
 * THE CHECKS THAT MATTER, all on a probe binder that is deleted afterwards:
 *   4. An EDIT bumps it (that is the whole feature).
 *   5. Changing the featured share pages bumps it (the other preview input).
 *   6. A CARD edit bumps it. This is the one that matters and the one that was broken: slot
 *      writes never touched the binders row, so the preview image URL never changed and the CDN
 *      kept serving the old picture while warming reported success.
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
const MIGRATIONS = [
  // In order: the column and its trigger, then the propagation that makes a CARD edit reach the
  // binder row at all. Step 6 fails without the second.
  '20260826150000_share_version.sql',
  '20260826160000_preview_freshness.sql',
].map((f) => join(here, '..', 'supabase', 'migrations', f));

const token = process.env.SUPABASE_ACCESS_TOKEN;
/**
 * Abort the run. THROWS rather than exiting: process.exit skips `finally`, and this script's
 * finally is what deletes the probe binder from the live table. A failed step used to leave that
 * probe behind, and the next run then failed on it.
 */
function fail(msg) {
  throw new Error(msg);
}
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exit(2); // nothing created yet, so nothing to clean up
}

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
let failure = null;
const versionOf = async () =>
  (await sql(`select share_version from public.binders where id = '${probe}';`))[0]?.share_version;

try {
  console.log('Step 1: applying the migrations...');
  for (const m of MIGRATIONS) await sql(readFileSync(m, 'utf8'));
  console.log(`  OK (${MIGRATIONS.length} applied)`);

  console.log('Step 2: where existing binders sit...');
  // Reported, not asserted. Every binder starts at v1 and climbs as it is edited, so "all v1" is
  // true exactly once, on the first run, and asserting it would fail every run after.
  const [census] = await sql(
    `select count(*)::int as total,
            count(*) filter (where share_version = 1)::int as untouched,
            max(share_version)::int as highest
       from public.binders;`,
  );
  console.log(`  ${census.total} binders, ${census.untouched} still at v1, highest v${census.highest}`);

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

  console.log('Step 6: a CARD edit bumps it (the edit that used to go unnoticed)...');
  // The one that was broken. Slot writes go to binder_slots and never touched the binders row, so
  // updated_at did not move, so ogImageUrl's cache key did not move, so the CDN kept serving the
  // old picture and warming re-fetched that same stale entry while reporting success.
  const [page] = await sql(`
    insert into public.binder_pages (binder_id, position, rows, cols)
    values ('${probe}', 0, 3, 3) returning id;`);
  const afterPage = await versionOf();
  if (afterPage <= afterFeature) fail(`adding a page left the version at ${afterPage}`);
  await sql(`
    insert into public.binder_slots
      (page_id, row_index, col_index, row_span, col_span, slot_type, card_id)
    values ('${page.id}', 0, 0, 1, 1, 'card', 'sv1-25');`);
  const afterSlot = await versionOf();
  if (afterSlot <= afterPage) {
    fail(`placing a card left the version at ${afterSlot}: the preview would stay stale`);
  }
  console.log(`  OK (page v${afterFeature} -> v${afterPage}, card -> v${afterSlot})`);

  console.log('\nDONE. Share links now change exactly when their preview does.');
} catch (e) {
  failure = e.message ?? String(e);
} finally {
  // Always, and BEFORE reporting: the probe is a row in the live binders table and must not
  // outlive this process whatever happened above.
  if (probe) {
    try {
      await sql(`delete from public.binders where id = '${probe}';`);
      console.log('Probe binder removed.');
    } catch {
      console.log(`Cleanup warning: probe binder ${probe} may remain (id ${probe}).`);
    }
  }
  if (failure) {
    console.log(`FAILED: ${failure}`);
    process.exit(2);
  }
}

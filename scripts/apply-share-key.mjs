/**
 * Apply 20260826170000_share_key.sql: the shared link's `?v=` becomes a short fingerprint of the
 * preview's inputs instead of a running count of edits.
 *
 * WHY THE COUNTER GOES. It worked, but the day after it landed 20260826160000 made page and slot
 * writes touch the parent binder, so every card placed or moved bumped it — a six-minute-old binder
 * was already at ?v=157. The URL only ever needed to DIFFER when the preview differs; the count
 * published how often someone had edited their page and grew without bound.
 *
 * THE CHECKS THAT MATTER, on a probe binder deleted afterwards:
 *   3. Every binder has a key, and it is exactly the hash of its own preview inputs. This is the
 *      invariant the whole mechanism rests on: if a key can drift from the row it describes, a
 *      shared link stops tracking its picture and nobody finds out.
 *   5. An edit changes it (the feature).
 *   6. Changing the featured pages changes it (the other preview input).
 *   7. A CARD edit changes it — the one that was broken before 20260826160000, where slot writes
 *      never reached the binders row so the preview silently went stale.
 *
 * SAFE TO RUN BEFORE OR AFTER THE DEPLOY, and safe to re-run: the DDL is idempotent, the backfill
 * only fills nulls, and share_version is left in place so the currently deployed code keeps working
 * either way. A follow-up migration drops it once share_key is live.
 *
 * Run through apply-share-key.ps1 (which loads SUPABASE_ACCESS_TOKEN).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260826170000_share_key.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
/** Throws rather than exits: process.exit would skip the finally that deletes the probe binder. */
function fail(msg) {
  throw new Error(msg);
}
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exit(2);
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
const keyOf = async () =>
  (await sql(`select share_key from public.binders where id = '${probe}';`))[0]?.share_key;

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: the census (reported, not asserted)...');
  const [census] = await sql(
    `select count(*)::int as total,
            count(*) filter (where share_key is null)::int as missing,
            count(*) filter (where share_key ~ '^[0-9a-f]{8}$')::int as well_formed
       from public.binders;`,
  );
  console.log(`  ${census.total} binders, ${census.missing} without a key, ${census.well_formed} well-formed`);
  if (census.missing > 0) fail(`${census.missing} binders have no share_key after the backfill`);

  console.log('Step 3: every key matches its own row (the invariant)...');
  const [drift] = await sql(
    `select count(*)::int as n
       from public.binders
      where share_key is distinct from public.binder_share_key(updated_at, share_page_ids);`,
  );
  if (drift.n !== 0) fail(`${drift.n} binders carry a key that is not the hash of their own inputs`);
  console.log('  OK — no row disagrees with its own fingerprint');

  console.log('Step 4: creating a probe binder...');
  const owner = (await sql(`select id from auth.users order by created_at limit 1;`))[0]?.id;
  if (!owner) fail('no user to own the probe binder');
  probe = (
    await sql(
      `insert into public.binders (owner_id, title, layout_style)
       values ('${owner}', 'share_key probe', 'freeform') returning id;`,
    )
  )[0].id;
  const created = await keyOf();
  if (!/^[0-9a-f]{8}$/.test(created || '')) fail(`a new binder got no key on INSERT (got ${created})`);
  console.log(`  OK — created with ${created}`);

  console.log('Step 5: an edit changes the key...');
  await sql(`update public.binders set title = 'share_key probe (edited)' where id = '${probe}';`);
  const afterEdit = await keyOf();
  if (afterEdit === created) fail('editing the binder did not change its key');
  console.log(`  OK — ${created} -> ${afterEdit}`);

  console.log('Step 6: changing the featured pages changes the key...');
  const page = (
    await sql(
      `insert into public.binder_pages (binder_id, position, rows, cols)
       values ('${probe}', 0, 3, 3) returning id;`,
    )
  )[0].id;
  const afterPage = await keyOf();
  await sql(
    `update public.binders set share_page_ids = array['${page}']::uuid[] where id = '${probe}';`,
  );
  const afterFeatured = await keyOf();
  if (afterFeatured === afterPage) fail('featuring a page did not change the key');
  console.log(`  OK — ${afterPage} -> ${afterFeatured}`);

  console.log('Step 7: a CARD edit changes the key...');
  const before = await keyOf();
  await sql(
    `insert into public.binder_slots (page_id, row_index, col_index, row_span, col_span, slot_type, card_id)
     values ('${page}', 0, 0, 1, 1, 'card', 'base1-4');`,
  );
  const afterCard = await keyOf();
  if (afterCard === before) fail('placing a card did not reach the binder row (preview would go stale)');
  console.log(`  OK — ${before} -> ${afterCard}`);

  console.log('\nDONE. `?v=` is a fingerprint; every binder agrees with its own.');
} catch (e) {
  failure = e;
  console.log(`\nFAILED: ${e.message}`);
} finally {
  if (probe) {
    // Pages and slots cascade from the binder.
    await sql(`delete from public.binders where id = '${probe}';`).catch(() => {});
    console.log('  (probe binder removed)');
  }
  if (failure) process.exit(1);
}

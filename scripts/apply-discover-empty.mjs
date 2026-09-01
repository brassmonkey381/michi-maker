/**
 * Apply supabase/migrations/20260901120000_discover_hides_empty.sql: Discover skips binders with
 * no filled pockets.
 *
 * THE CHECKS THAT MATTER:
 *   1. A census FIRST, so the change is a known quantity rather than a hope: how many public
 *      binders hold nothing, who owns them, and how many would also fall out at a threshold of 3
 *      (the owner's possible next step).
 *   2. The feed actually shrinks by exactly the empty ones, and every binder it still returns has
 *      at least one pocket.
 *   3. The old three-argument call still resolves — the deployed client calls discover_binders
 *      with p_sort/p_limit/p_contest only, and the two author parameters default.
 *   4. Nothing else moved: same row shape, and the author filters still work.
 *
 * Safe to re-run: create-or-replace, and the index is if-not-exists.
 *
 * Run through apply-discover-empty.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260901120000_discover_hides_empty.sql',
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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

/** Public, non-archived, non-demo binders by how many pockets they hold. */
const CENSUS = `
  with pub as (
    select b.id, b.title, p.username,
           (select count(*)
              from public.binder_pages pg
              join public.binder_slots s on s.page_id = pg.id
             where pg.binder_id = b.id) as pockets
      from public.binders b
      join public.profiles p on p.id = b.owner_id
     where b.is_public and coalesce(p.is_public, true)
       and b.archived_at is null and coalesce(b.is_demo, false) = false
  )
  select count(*) as public_binders,
         count(*) filter (where pockets = 0) as empty_binders,
         count(*) filter (where pockets between 1 and 2) as under_three,
         count(distinct username) filter (where pockets = 0) as owners_affected
    from pub;`;

try {
  console.log('Step 1: census BEFORE (what this will hide)...');
  const [before] = await sql(CENSUS);
  console.log(`  public binders in Discover today : ${before.public_binders}`);
  console.log(`  with ZERO filled pockets         : ${before.empty_binders}  <- hidden by this`);
  console.log(`  with 1 or 2 pockets              : ${before.under_three}  (would also go at a threshold of 3)`);
  console.log(`  distinct owners with an empty one: ${before.owners_affected}`);

  console.log('Step 2: how the feed looks now...');
  const [feedBefore] = await sql(
    `select count(*) as n from public.discover_binders('recent', 1000);`,
  );
  console.log(`  discover_binders('recent', 1000) returns ${feedBefore.n}`);

  console.log('Step 3: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 4: the feed dropped exactly the empty binders...');
  const [feedAfter] = await sql(
    `select count(*) as n from public.discover_binders('recent', 1000);`,
  );
  const dropped = Number(feedBefore.n) - Number(feedAfter.n);
  console.log(`  now returns ${feedAfter.n} (dropped ${dropped}, expected ${before.empty_binders})`);
  if (dropped !== Number(before.empty_binders)) {
    fail(`dropped ${dropped} but ${before.empty_binders} binders were empty`);
  }

  console.log('Step 5: every binder still in the feed holds at least one pocket...');
  const [leak] = await sql(`
    select count(*) as n
      from public.discover_binders('recent', 1000) d
     where not exists (
       select 1 from public.binder_pages pg
         join public.binder_slots s on s.page_id = pg.id
        where pg.binder_id = d.binder_id
     );`);
  if (Number(leak.n) !== 0) fail(`${leak.n} empty binder(s) still in the feed`);
  console.log('  OK (none)');

  console.log('Step 6: the deployed three-argument call still resolves...');
  const [legacy] = await sql(
    `select count(*) as n from public.discover_binders('recent', 40, null);`,
  );
  console.log(`  OK (returned ${legacy.n} row(s))`);

  console.log('Step 7: the author filters still work...');
  const [authors] = await sql(`
    select
      (select count(*) from public.discover_binders('recent', 1000, null, 'michimaker')) as only_house,
      (select count(*) from public.discover_binders('recent', 1000, null, null, 'michimaker')) as without_house;`);
  console.log(`  only @michimaker: ${authors.only_house}   without @michimaker: ${authors.without_house}`);

  console.log('DONE.');
} catch (err) {
  if (process.exitCode !== 2) console.log(`FAILED: ${err.message}`);
  process.exitCode = 2;
}

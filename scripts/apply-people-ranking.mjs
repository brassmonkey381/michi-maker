/**
 * Apply supabase/migrations/20260830120000_people_ranking.sql: how the People window is populated
 * and searched.
 *
 * THE CHECKS THAT MATTER:
 *   2. The old two-argument call still resolves. The window in the field calls
 *      search_profiles(p_query, p_limit); p_offset has a default, so it must keep working for
 *      every client that has not taken the update yet.
 *   3. The privacy gate still holds, in BOTH modes. This is the one property that must not have
 *      moved: a private profile stays out of an empty query and out of a query that names it.
 *   4. Wildcards are escaped: a search for `%` used to match everyone and must now match nobody.
 *   5. CENSUS, and the reason to run this with eyes open. The browse list now qualifies on owning
 *      a publicly visible binder. If that cuts far more deeply than expected, the fix is one line
 *      (drop the qualification and let the ranking carry it), so the numbers are printed rather
 *      than assumed. It also reports where a named account lands in the new browse order, which
 *      is the question that started this.
 *
 * Safe to re-run: the DDL drops and recreates, the checks are read-only.
 *
 * Run through apply-people-ranking.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
/** The account whose absence from the scroll list prompted all this. */
const SUBJECT = process.env.PEOPLE_SUBJECT || 'rileyuy';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260830120000_people_ranking.sql',
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
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: the signature, and that an un-updated client still resolves...');
  const [sig] = await sql(`
    select pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as result
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_profiles';`);
  if (!sig) fail('search_profiles is missing');
  if (!sig.args.includes('p_offset')) fail(`no p_offset in signature: ${sig.args}`);
  if (!sig.result.includes('binder_votes')) fail(`no binder_votes in result: ${sig.result}`);
  const legacy = await sql(`select count(*) as n from public.search_profiles('', 5);`);
  console.log(`  OK (${sig.args}); two-arg call returned ${legacy[0].n} row(s)`);

  console.log('Step 3: the privacy gate, in both modes...');
  const [priv] = await sql(`
    with hidden as (
      select pr.username from public.profiles pr
      where coalesce(pr.is_public, true) = false and coalesce(pr.username, '') <> ''
      limit 1
    )
    select
      (select username from hidden) as who,
      (select count(*) from public.search_profiles('', 100000)
        where username = (select username from hidden)) as in_browse,
      (select count(*) from public.search_profiles(coalesce((select username from hidden), '~none~'), 100)
        where username = (select username from hidden)) as in_search;`);
  if (!priv.who) {
    console.log('  SKIPPED (no private named profile exists to probe with)');
  } else if (Number(priv.in_browse) || Number(priv.in_search)) {
    fail(`a private profile leaked (browse=${priv.in_browse}, search=${priv.in_search})`);
  } else {
    console.log('  OK (a private profile appears in neither mode)');
  }

  console.log('Step 4: wildcards are escaped...');
  const [wild] = await sql(`
    select (select count(*) from public.search_profiles('%', 100000)) as pct,
           (select count(*) from public.search_profiles('', 100000)) as browse;`);
  if (Number(wild.pct) > 0) fail(`a search for '%' still matched ${wild.pct} profile(s)`);
  console.log("  OK (a search for '%' matches nobody; it used to match everyone)");

  console.log('Step 5: census...');
  const [c] = await sql(`
    select
      (select count(*) from public.profiles
        where coalesce(is_public, true) and coalesce(username, '') <> '') as public_named,
      (select count(*) from public.search_profiles('', 1000000)) as browsable,
      (select count(distinct b.owner_id) from public.binders b
        where b.is_public and b.removed_at is null) as with_public_binder;`);
  const cut = Number(c.public_named) - Number(c.browsable);
  console.log(`  public + named profiles : ${c.public_named}`);
  console.log(`  browsable (has a binder): ${c.browsable}`);
  console.log(`  held back by the filter : ${cut}`);
  if (Number(c.browsable) === 0 && Number(c.public_named) > 0) {
    console.log('  WARNING: the qualification filter empties the browse list. Relax it (drop the');
    console.log('           "t.q is not null or ..." clause) and let the ranking carry the order.');
  }

  console.log(`Step 6: where does @${SUBJECT} land?`);
  const [s] = await sql(`
    select
      (select coalesce(is_public, true) from public.profiles where username = ${q(SUBJECT)})
        as is_public,
      (select rn from public.search_profiles('', 1000000)
         with ordinality as t(id, username, avatar_url, upvotes, binder_votes, rn)
       where t.username = ${q(SUBJECT)}) as browse_rank,
      (select count(*) from public.binders b
        join public.profiles pr on pr.id = b.owner_id
       where pr.username = ${q(SUBJECT)} and b.is_public and b.removed_at is null)
        as public_binders;`);
  if (s.is_public === null) {
    console.log(`  no profile with username ${SUBJECT}`);
  } else {
    console.log(`  profile is_public : ${s.is_public}`);
    console.log(`  public binders    : ${s.public_binders}`);
    console.log(`  browse rank       : ${s.browse_rank ?? 'not in the browse list'}`);
    if (s.browse_rank && Number(s.browse_rank) <= 30) {
      console.log('  -> now visible on the first page, where before it was cut at 30.');
    } else if (s.browse_rank) {
      console.log(`  -> reachable by paging (page ${Math.ceil(Number(s.browse_rank) / 30)}).`);
    }
  }

  console.log('DONE.');
} catch (err) {
  if (process.exitCode !== 2) console.log(`FAILED: ${err.message}`);
  process.exitCode = 2;
}

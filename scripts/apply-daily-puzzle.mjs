/**
 * Applies supabase/migrations/20260923140000_daily_puzzle.sql, then proves the protections hold.
 *
 * THE CHECKS ARE THE POINT. This migration exists to keep the tag vocabulary off the client, and
 * "the SQL ran without error" says nothing about whether it does. So after applying it, this asks
 * the database the questions an attacker would: can the answers table be read as an ordinary
 * signed-in caller, does grading leak which word was right, can tomorrow be graded early. Each is
 * asserted, and anything it writes it deletes.
 *
 *   node scripts/apply-daily-puzzle.mjs        (through the .ps1 wrapper, which loads the token)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PROJECT_REF = 'piikwvntldytjejxmcla';
const MIGRATION = '20260923140000_daily_puzzle.sql';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function run(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}
async function sql(query) {
  const r = await run(query);
  if (!r.ok) fail(`query refused (${r.status}): ${r.text.slice(0, 500)}`);
  return JSON.parse(r.text);
}
/** For the checks that are SUPPOSED to be refused: a success here is the bug. */
async function sqlExpectingError(query, what) {
  const r = await run(query);
  if (r.ok) fail(`${what}: the database ALLOWED it, which is the thing this guards against`);
  return r.text;
}

step(1, `applying ${MIGRATION}`);
const migration = readFileSync(join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8');
await sql(migration);
console.log('  applied');

step(2, 'the tables, the policies and the grants are there');
const tables = await sql(`
  select c.relname as table, c.relrowsecurity as rls,
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('daily_puzzles','daily_puzzle_answers','puzzle_plays','puzzle_vocabulary')
   order by c.relname;
`);
for (const t of tables) console.log(`  ${t.table.padEnd(22)} rls=${t.rls}  policies=${t.policies}`);
if (tables.length !== 4) fail(`expected 4 tables, found ${tables.length}`);
if (tables.some((t) => !t.rls)) fail('a table came back without row level security');
const answers = tables.find((t) => t.table === 'daily_puzzle_answers');
// One policy, and it is the privileged write. A SELECT policy here would be the whole hole.
const answerPolicies = await sql(`
  select policyname, cmd from pg_policies
   where schemaname = 'public' and tablename = 'daily_puzzle_answers';
`);
if (answerPolicies.some((p) => p.cmd === 'SELECT')) {
  fail('daily_puzzle_answers has a SELECT policy, so the answers are readable by clients');
}
console.log(`  daily_puzzle_answers has no SELECT policy (${answerPolicies.length} policy total), so no client can read it`);

step(3, 'seeding a puzzle to test against');
const seeded = await sql(`
  with p as (
    insert into public.daily_puzzles (publish_on, theme_count, card_ids, rows, cols, hint)
    values (date '1999-01-01', 2, array['84032','86300'], 2, 2, 'a test row, deleted at the end')
    on conflict (publish_on) do update set theme_count = excluded.theme_count
    returning id
  )
  insert into public.daily_puzzle_answers (puzzle_id, themes)
  select id, array['flowers','city'] from p
  on conflict (puzzle_id) do update set themes = excluded.themes
  returning puzzle_id as id;
`);
const puzzleId = seeded[0].id;
const future = await sql(`
  with p as (
    insert into public.daily_puzzles (publish_on, theme_count, card_ids, rows, cols)
    values (date '2999-01-01', 2, array['84032'], 2, 2)
    on conflict (publish_on) do update set theme_count = excluded.theme_count
    returning id
  )
  insert into public.daily_puzzle_answers (puzzle_id, themes)
  select id, array['secret','words'] from p
  on conflict (puzzle_id) do update set themes = excluded.themes
  returning puzzle_id as id;
`);
const futureId = future[0].id;
console.log(`  published puzzle ${puzzleId}`);
console.log(`  unpublished puzzle ${futureId} (publish_on 2999-01-01)`);

step(4, 'what an ordinary signed-in caller can and cannot reach');
// The management API connects as postgres, so `set local role authenticated` is how these checks
// get to stand where a client stands: PostgREST does exactly the same thing per request.
//
// A DENIAL HERE IS AN EMPTY SET, NOT AN ERROR. Row level security with no SELECT policy filters
// every row away rather than refusing the statement, so the assertion is "zero rows came back"
// and not "the query failed". Asserting the wrong one of those is how a test like this passes
// while the data walks out, so the row is seeded first and its absence is what proves the point.
const leak = await sql(`
  set local role authenticated;
  select puzzle_id, themes from public.daily_puzzle_answers;
`);
if (leak.length !== 0) fail(`a client read ${leak.length} answer row(s): ${JSON.stringify(leak).slice(0, 200)}`);
const seededCount = await sql('select count(*)::int as n from public.daily_puzzle_answers;');
if (Number(seededCount[0].n) < 2) fail('the check is vacuous: there were no answer rows to hide');
console.log(`  ${seededCount[0].n} answer row(s) exist, and a client reads 0 of them`);

const published = await sql(`
  set local role authenticated;
  select count(*)::int as n from public.daily_puzzles where publish_on <= current_date;
`);
console.log(`  published puzzles a client can see: ${published[0].n}`);
const hidden = await sql(`
  set local role authenticated;
  select count(*)::int as n from public.daily_puzzles where publish_on = date '2999-01-01';
`);
if (Number(hidden[0].n) !== 0) fail('an unpublished puzzle is visible to a client');
console.log('  the unpublished puzzle is invisible to a client');

step(5, 'grading tells you how many, never which');
const cols = await sql(`
  select string_agg(p.parameter_name || ' ' || p.data_type, ', ' order by p.ordinal_position) as sig
    from information_schema.parameters p
   where p.specific_schema = 'public'
     and p.specific_name like 'grade_puzzle_guess%' and p.parameter_mode = 'OUT';
`);
console.log(`  grade_puzzle_guess returns: ${cols[0]?.sig ?? '(none)'}`);
if ((cols[0]?.sig ?? '').includes('theme')) fail('the grading function returns the answer');

// End to end, standing where a signed-in player stands: role and a jwt claim, so auth.uid() is
// real and the play row can satisfy its foreign key.
const PLAYER = '689143c4-5d32-4905-991e-c894f9cf2620'; // @fakemichi
const asPlayer = (body) => `set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${PLAYER}","role":"authenticated"}', true);
  ${body}`;

const half = await sql(asPlayer(`select * from public.grade_puzzle_guess('${puzzleId}'::uuid, array['flowers','beach']);`));
console.log(`  one right of two -> ${JSON.stringify(half[0])}`);
if (half[0].correct !== false || Number(half[0].matched) !== 1 || Number(half[0].of) !== 2) {
  fail('a half-right guess was not graded as one of two');
}
if (JSON.stringify(half[0]).toLowerCase().includes('city')) fail('grading leaked the word that was missed');

const whole = await sql(asPlayer(`select * from public.grade_puzzle_guess('${puzzleId}'::uuid, array['CITY ',' flowers']);`));
console.log(`  both, cased and spaced oddly, in the other order -> ${JSON.stringify(whole[0])}`);
if (whole[0].correct !== true) fail('a correct guess was not accepted');

// The freeze: a correct play must not be walked backwards by a later wrong guess.
await sql(asPlayer(`select * from public.grade_puzzle_guess('${puzzleId}'::uuid, array['nonsense']);`));
const frozen = await sql(`select correct, matched from public.puzzle_plays where puzzle_id = '${puzzleId}'::uuid;`);
if (!frozen[0]?.correct) fail('a wrong guess after a correct one unset the correct flag');
console.log('  a later wrong guess does not undo the correct one');

const early = await sqlExpectingError(
  asPlayer(`select * from public.grade_puzzle_guess('${futureId}'::uuid, array['secret','words']);`),
  'grading an unpublished puzzle',
);
console.log(`  an unpublished puzzle refuses to grade: ${early.slice(0, 80).replace(/\s+/g, ' ')}`);

const todayAnswer = await sql(`select public.puzzle_answer('${puzzleId}'::uuid) as a;`);
console.log(`  puzzle_answer for a puzzle published today: ${JSON.stringify(todayAnswer[0].a)}`);

step(6, 'cleaning up the test rows');
// The plays go with the puzzle by cascade; named here so the deletion is not taken on trust.
await sql(`delete from public.puzzle_plays where puzzle_id in ('${puzzleId}'::uuid, '${futureId}'::uuid);`);
await sql(`delete from public.daily_puzzles where publish_on in (date '1999-01-01', date '2999-01-01');`);
const left = await sql(`
  select count(*)::int as n from public.daily_puzzles
   where publish_on in (date '1999-01-01', date '2999-01-01');
`);
if (Number(left[0].n) !== 0) fail('the test rows did not delete');
console.log('  gone (the answers went with them by cascade)');

console.log('\nOK: the daily puzzle schema is live, and the answers are not reachable by a client.');

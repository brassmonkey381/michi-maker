/**
 * Applies supabase/migrations/20260924120000_puzzle_admin.sql and checks the gate actually gates.
 *
 * EVERY ONE OF THESE FUNCTIONS IS SECURITY DEFINER, which means it runs as its owner and the only
 * thing standing between a caller and the answers table is the `is_admin()` line at the top. So the
 * check that matters is not "does it work for an admin", it is "does it refuse everyone else", and
 * that is asserted per function rather than assumed from the one that was easiest to test.
 *
 *   node scripts/apply-puzzle-admin.mjs      (through the .ps1 wrapper, which loads the token)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PROJECT_REF = 'piikwvntldytjejxmcla';
const MIGRATION = '20260924120000_puzzle_admin.sql';

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
  return { ok: res.ok, status: res.status, text: await res.text() };
}
async function sql(query) {
  const r = await run(query);
  if (!r.ok) fail(`query refused (${r.status}): ${r.text.slice(0, 400)}`);
  return JSON.parse(r.text);
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

step(1, `applying ${MIGRATION}`);
await sql(readFileSync(join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8'));
console.log('  applied');

step(2, 'finding an admin, a non-admin, and a page to publish from');
const [admin] = await sql(`select id, username from public.profiles where is_admin order by created_at limit 1;`);
if (!admin) fail('no admin profile to test with');
const [other] = await sql(`select id, username from public.profiles where not is_admin order by created_at limit 1;`);
if (!other) fail('no non-admin profile to test with');
const [page] = await sql(`
  select p.id, p.title, b.title as binder
    from public.binder_pages p
    join public.binders b on b.id = p.binder_id
   where b.owner_id = ${q(admin.id)}
     and (select count(*) from public.binder_slots s
           where s.page_id = p.id and s.slot_type = 'card' and s.card_id is not null) > 0
   order by b.title, p.position limit 1;
`);
if (!page) fail(`the admin (@${admin.username}) owns no page with cards on it`);
console.log(`  admin @${admin.username}, non-admin @${other.username}`);
console.log(`  publishing from "${page.binder}" / "${page.title ?? '(untitled)'}"`);

const as = (uid, body) => `set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
  ${body}`;

step(3, 'the non-admin is refused by every one of them');
// COUNTED, NOT LISTED. This endpoint merges the result sets of every statement it is given, so a
// `select * from ...` that correctly returns nothing leaves the preceding `select set_config(...)`
// as the only row in the reply, and a naive "no rows came back" check reads that as a leak. It did,
// on the first run. Asking for a count means the assertion is about one number that is always there.
const CALLS = [
  ['admin_puzzle_list', 'select count(*)::int as n from public.admin_puzzle_list(5);', 'empty'],
  ['admin_puzzle_sources', 'select count(*)::int as n from public.admin_puzzle_sources();', 'empty'],
  ['admin_vocabulary', 'select count(*)::int as n from public.admin_vocabulary(5);', 'empty'],
  ['admin_publish_puzzle', `select public.admin_publish_puzzle(date '1998-01-01', '${page.id}'::uuid, array['x','y']);`, 'error'],
  ['admin_unpublish_puzzle', `select public.admin_unpublish_puzzle('${page.id}'::uuid);`, 'error'],
  ['admin_set_binder_showcase', `select public.admin_set_binder_showcase('${page.id}'::uuid, true);`, 'error'],
  ['admin_set_vocabulary', `select public.admin_set_vocabulary(array['sneaky']);`, 'error'],
];
for (const [name, body, how] of CALLS) {
  const r = await run(as(other.id, body));
  if (how === 'error') {
    // A verb must REFUSE. Returning quietly would be a silent no-op today and a real write the day
    // someone adds a code path that ignores the result.
    if (r.ok) fail(`${name} let a non-admin through`);
    console.log(`  ${name.padEnd(26)} refused`);
  } else {
    // A reader is a `where public.is_admin()`, so it filters to nothing rather than raising.
    if (!r.ok) fail(`${name} errored for a non-admin instead of returning nothing: ${r.text.slice(0, 160)}`);
    const counted = JSON.parse(r.text).find((x) => typeof x.n === 'number');
    if (!counted) fail(`${name}: the check did not get a count back, so it proves nothing`);
    if (counted.n !== 0) fail(`${name} returned ${counted.n} row(s) to a non-admin`);
    console.log(`  ${name.padEnd(26)} returns nothing`);
  }
}
const sneaky = await sql(`select count(*)::int as n from public.puzzle_vocabulary where word = 'sneaky';`);
if (Number(sneaky[0].n) !== 0) fail('the non-admin actually wrote a vocabulary row');

step(4, 'the admin can publish, and it is idempotent on the date');
const pick = (rows, key) => rows.find((r) => r[key] !== undefined)?.[key];
const first = { id: pick(await sql(as(admin.id, `select public.admin_publish_puzzle(date '1998-01-01', '${page.id}'::uuid, array['Flowers ',' CITY'], 'a test row') as id;`)), 'id') };
const again = { id: pick(await sql(as(admin.id, `select public.admin_publish_puzzle(date '1998-01-01', '${page.id}'::uuid, array['flowers','city'], 'edited hint') as id;`)), 'id') };
if (first.id !== again.id) fail('re-publishing the same date made a second puzzle instead of replacing it');
console.log(`  same date, same puzzle id after a second publish: ${first.id}`);
const [row] = await sql(`select theme_count, cardinality(card_ids) as cards, hint from public.daily_puzzles where id = ${q(first.id)};`);
console.log(`  theme_count=${row.theme_count} cards=${row.cards} hint="${row.hint}"`);
if (Number(row.theme_count) !== 2) fail('themes were not normalised to two');

const mine = pick(await sql(as(admin.id, `select public.admin_puzzle_themes(${q(first.id)}) as t;`)), 't');
console.log(`  the author can read the answer back: ${JSON.stringify(mine)}`);
if (!Array.isArray(mine) || mine.length !== 2) fail('the author cannot read the answer they just set');
const theirs = pick(await sql(as(other.id, `select public.admin_puzzle_themes(${q(first.id)}) as t;`)), 't');
if (theirs !== null) fail('a non-admin read the answer');
console.log('  a non-admin reading the same answer gets null');

step(5, 'publishing seeded the vocabulary so the words can be typed');
const vocab = await sql(`select word, suggest from public.puzzle_vocabulary where word in ('flowers','city') order by word;`);
console.log(`  ${vocab.map((v) => `${v.word}(${v.suggest})`).join(' ')}`);
if (vocab.length !== 2) fail('the answer words did not reach the vocabulary');

step(6, 'cleaning up');
await sql(as(admin.id, `select public.admin_unpublish_puzzle(${q(first.id)});`));
const [left] = await sql(`select count(*)::int as n from public.daily_puzzles where publish_on = date '1998-01-01';`);
if (Number(left.n) !== 0) fail('unpublish did not remove the test puzzle');
await sql(`delete from public.puzzle_vocabulary where word in ('flowers','city','sneaky');`);
console.log('  test puzzle and its words are gone');

console.log('\nOK: Studio can author puzzles, and nobody else can.');

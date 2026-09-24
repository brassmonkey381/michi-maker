/**
 * Applies 20260924130000_guess_one_word.sql and checks the matcher on real words.
 *
 * THE FUZZINESS IS THE RISKY PART, in both directions: too tight and a player who typed "flowers"
 * is told they are wrong, too loose and "flower" matches "forest". Both failures are silent, so
 * the acceptances AND the rejections are asserted here against a table of words rather than eyeballed.
 *
 *   node scripts/apply-guess-one-word.mjs      (through the .ps1 wrapper, which loads the token)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const PROJECT_REF = 'piikwvntldytjejxmcla';
const MIGRATION = '20260924130000_guess_one_word.sql';

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
  return { ok: res.ok, text: await res.text() };
}
async function sql(query) {
  const r = await run(query);
  if (!r.ok) fail(`query refused: ${r.text.slice(0, 400)}`);
  return JSON.parse(r.text);
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const pick = (rows, key) => rows.find((r) => r[key] !== undefined)?.[key];

step(1, `applying ${MIGRATION}`);
await sql(readFileSync(join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8'));
console.log('  applied');

step(2, 'what the matcher accepts and refuses');
// [guess, theme, shouldMatch]
const CASES = [
  ['flowers', 'flowers', true],
  ['Flowers ', 'flowers', true],
  ['flower', 'flowers', true],
  ['flowers', 'flower', true],
  ['flowerz', 'flowers', true],
  ['citty', 'city', true],
  ['white kyurem', 'White Kyurem', true],
  ['under water', 'underwater', true],
  ['flower', 'forest', false],
  ['city', 'clouds', false],
  ['ocean', 'storm', false],
  ['cat', 'car', false],
  // The pair that sets the threshold: both are plausible theme words, so a fuzziness loose enough
  // to accept this would mark a wrong answer right.
  ['night', 'light', false],
  ['snow', 'show', false],
  ['rain', 'ruins', false],
  ['', 'flowers', false],
];
const checks = CASES.map(([g, t], i) => `select ${i} as i, public.puzzle_words_match(${q(g)}, ${q(t)}) as m`).join(' union all ');
const rows = await sql(`${checks} order by i;`);
let bad = 0;
for (const [i, [g, t, want]] of CASES.entries()) {
  const got = rows.find((r) => Number(r.i) === i)?.m;
  const ok = got === want;
  if (!ok) bad += 1;
  console.log(`  ${ok ? 'ok  ' : 'BAD '} ${String(`"${g}"`).padEnd(16)} vs ${String(`"${t}"`).padEnd(16)} -> ${got} (wanted ${want})`);
}
if (bad) fail(`${bad} matcher case(s) came out wrong`);

step(3, 'a whole game, one word at a time');
const [admin] = await sql(`select id from public.profiles where is_admin order by created_at limit 1;`);
const [page] = await sql(`
  select p.id from public.binder_pages p
    join public.binders b on b.id = p.binder_id
   where b.owner_id = ${q(admin.id)}
     and (select count(*) from public.binder_slots s
           where s.page_id = p.id and s.slot_type = 'card' and s.card_id is not null) > 0
   order by b.title, p.position limit 1;
`);
const as = (uid, body) => `set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
  ${body}`;
const pid = pick(
  await sql(as(admin.id, `select public.admin_publish_puzzle(date '1997-01-01', '${page.id}'::uuid, array['flowers','city'], 'test') as id;`)),
  'id',
);

const guess = async (word) => {
  const rows = await sql(as(admin.id, `select hit, matched_word, found_count, total, solved from public.guess_puzzle_word('${pid}'::uuid, ${q(word)});`));
  return rows.find((r) => r.hit !== undefined) ?? {};
};

const wrong = await guess('ocean');
console.log(`  "ocean"   -> hit=${wrong.hit} found=${wrong.found_count}/${wrong.total}`);
if (wrong.hit !== false || Number(wrong.found_count) !== 0) fail('a wrong word counted');

const near = await guess('flowerz');
console.log(`  "flowerz" -> hit=${near.hit} matched=${near.matched_word} found=${near.found_count}/${near.total}`);
if (near.hit !== true || near.matched_word !== 'flowers') fail('a near miss was not accepted');

const dup = await guess('flower');
console.log(`  "flower"  -> hit=${dup.hit} found=${dup.found_count}/${dup.total}  (already had it)`);
if (Number(dup.found_count) !== 1) fail('re-guessing a found word counted twice');

const last = await guess('City');
console.log(`  "City"    -> hit=${last.hit} found=${last.found_count}/${last.total} solved=${last.solved}`);
if (last.solved !== true) fail('the game did not complete');

const after = await guess('nonsense');
const [row] = await sql(`select correct, matched from public.puzzle_plays where puzzle_id = '${pid}'::uuid;`);
console.log(`  a later wrong guess leaves it solved: correct=${row.correct} matched=${row.matched}`);
if (!row.correct || Number(row.matched) !== 2) fail('a solved play was walked backwards');
if (after.solved !== true) fail('a solved play stopped reporting solved');

step(4, 'the old all-at-once grader is gone');
const [g] = await sql(`select count(*)::int as n from pg_proc where proname = 'grade_puzzle_guess';`);
console.log(`  grade_puzzle_guess definitions remaining: ${g.n}`);
if (Number(g.n) !== 0) fail('the superseded grader is still there');

step(5, 'cleaning up');
await sql(as(admin.id, `select public.admin_unpublish_puzzle('${pid}'::uuid);`));
await sql(`delete from public.puzzle_vocabulary where word in ('flowers','city');`);
console.log('  gone');

console.log('\nOK: one word at a time, near misses accepted, a win cannot be undone.');

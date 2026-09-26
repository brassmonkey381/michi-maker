/**
 * Apply 20260926120000_puzzle_synonyms.sql and seed the table from src/data/puzzleSynonyms.ts.
 *
 *   node scripts/puzzles/seed-synonyms.mjs            (reports, writes nothing)
 *   node scripts/puzzles/seed-synonyms.mjs --apply
 *
 * THE .ts FILE IS THE DEFINITION and this is a copy of it, so the seed is a full replace rather
 * than an upsert: a word removed from the list has to disappear from the table too, and an upsert
 * would leave it behind grading guesses nobody can see in the source any more.
 *
 * THE CHECK THAT MATTERS runs the REAL `public.puzzle_words_match` over the cases from the unit
 * test, in both directions. Asserting the rows landed would pass just as well if the function had
 * not been replaced, or if it consulted the table in a way that never fires.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, appSql, fail, q, step, textArray } from '../lib/michi.mjs';
import { familyList, sameFamily } from '../../src/data/puzzleSynonyms.ts';

const APPLY = process.argv.includes('--apply');

step(1, 'the list, from the app');
const families = familyList();
const rows = families.flatMap(({ family, words }) => words.map((word) => ({ word, family })));
console.log(`  ${families.length} families, ${rows.length} words`);
console.log(`  ${families.map((f) => f.family).join(', ')}`);

// The unit test asserts this too; repeated here because a bad seed is worse than a failing test.
const seen = new Map();
for (const r of rows) {
  if (seen.has(r.word)) fail(`"${r.word}" is in both ${seen.get(r.word)} and ${r.family}`);
  seen.set(r.word, r.family);
}

if (!APPLY) {
  console.log('\nOK: nothing written. Re-run with --apply.');
  process.exit(0);
}

step(2, 'applying the migration');
await appSql(readFileSync(join(ROOT, 'supabase', 'migrations', '20260926120000_puzzle_synonyms.sql'), 'utf8'));
console.log('  applied');

step(3, 'replacing the table contents');
const values = rows.map((r) => `(${q(r.word)}, ${q(r.family)})`).join(',\n    ');
await appSql(`
  delete from public.puzzle_synonyms where word <> all(${textArray(rows.map((r) => r.word))});
  insert into public.puzzle_synonyms (word, family) values
    ${values}
  on conflict (word) do update set family = excluded.family;
`);
const [count] = await appSql('select count(*)::int as n from public.puzzle_synonyms;');
console.log(`  ${count.n} row(s) in the table`);
if (Number(count.n) !== rows.length) fail(`expected ${rows.length} rows, found ${count.n}`);

step(4, 'asking the real matcher the cases the unit test covers');
const CASES = [
  // [guess, theme, should match] — the owner's example first.
  ['forest', 'tree', true],
  ['lake', 'water', true],
  ['trees', 'forest', true],
  ['ice', 'snow', true],
  ['sky', 'clouds', true],
  ['clouds', 'sky', true],
  ['mountains', 'mountain', true],
  ['flowers', 'flower', true],
  ['citty', 'city', true],        // the typo rule still works
  ['night', 'light', false],      // and still refuses the pair that sets its ceiling
  ['cup', 'food', false],
  ['kitchen', 'house', false],
  ['fire', 'water', false],
  ['city', 'house', false],
];
const answers = await appSql(`
  select g, t, public.puzzle_words_match(g, t) as matched
    from (values ${CASES.map(([g, t]) => `(${q(g)}, ${q(t)})`).join(', ')}) as v(g, t);
`);
const got = new Map(answers.map((a) => [`${a.g}|${a.t}`, a.matched]));
let bad = 0;
for (const [g, t, want] of CASES) {
  const server = got.get(`${g}|${t}`);
  const local = sameFamily(g, t);
  const ok = server === want;
  if (!ok) bad += 1;
  console.log(
    `  ${ok ? 'ok  ' : 'BAD '} "${g}" as "${t}": server ${server}, wanted ${want}`
    + `${local !== server && want ? '' : ''}`,
  );
}
if (bad) fail(`${bad} case(s) did not grade as intended`);

step(5, 'and the table still cannot be read by a client');
const [pol] = await appSql(`
  select count(*)::int as n from pg_policies
   where schemaname = 'public' and tablename = 'puzzle_synonyms' and cmd in ('SELECT', 'ALL');
`);
const [sel] = await appSql(`
  select count(*)::int as n from pg_policies
   where schemaname = 'public' and tablename = 'puzzle_synonyms' and cmd = 'SELECT';
`);
console.log(`  ${sel.n} select policy (0 is correct), ${pol.n} policy covering reads`);
if (Number(sel.n) > 0) fail('a select policy exists, so the vocabulary is readable');

console.log('\nOK: the synonym table is live and the matcher consults it.');

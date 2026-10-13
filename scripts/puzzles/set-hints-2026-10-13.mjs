/**
 * The approved easy hints for every puzzle published up to 2026-10-17, set through the real RPC.
 *
 *   node scripts/puzzles/set-hints-2026-10-13.mjs            (shows what would change)
 *   node scripts/puzzles/set-hints-2026-10-13.mjs --apply
 *
 * ONE-OFF (owner, 2026-10-13: "the puzzles are kind of hard sometimes, they all need hints"). These
 * 24 were written by hand, reviewed in chat, and rewritten once so that none contains a word the
 * grader accepts ("never use the synonym"). Puzzles scheduled after this get their hint from
 * src/data/puzzleHints.ts at publish time, so this file is not the pattern for the future; it is
 * the record of what was set and why. hintGiveaways is run over every line before anything is
 * written, so the rule holds here too, and the three wordplay hints from September are replaced
 * because the owner asked for easy ones across the board.
 */
import { adminSql, appSql, fail, q, step } from '../lib/michi.mjs';
import { hintGiveaways } from '../../src/data/puzzleHints.ts';

const APPLY = process.argv.includes('--apply');

const HINTS = {
  '2026-09-24': 'Tall buildings, and the florist is busy.',
  '2026-09-25': 'Where ships go, on a bad weather day.',
  '2026-09-26': 'Look up, then look down at your reflection.',
  '2026-09-27': 'Tall trunks below, open blue above.',
  '2026-09-28': 'Something to eat, somewhere to live.',
  '2026-09-29': 'Green ground with something flowing through it.',
  '2026-09-30': 'High ground, and it is cold up there.',
  '2026-10-01': 'Rooftops with branches between them.',
  '2026-10-02': 'Wide open green under a soft white ceiling.',
  '2026-10-03': 'Dark all around you, with a glow breaking in.',
  '2026-10-04': 'Rooftops and what is above them.',
  '2026-10-05': 'A tidy place to grow things, right beside the front door.',
  '2026-10-06': 'Deep among the trunks, with a current running past.',
  '2026-10-07': 'Where the tide breaks against something hard.',
  '2026-10-08': 'Something to pick, growing where the shops are.',
  '2026-10-09': 'White puffs around something tall and steep.',
  '2026-10-10': 'Deep in the dark, where something was built long ago and left.',
  '2026-10-11': 'Green at your feet, thick green all around you.',
  '2026-10-12': 'Dry ground as far as you can see, and what is above it.',
  '2026-10-13': 'Where the tide comes in, under some shade.',
  '2026-10-14': 'Trunks, and something hard and grey underfoot.',
  '2026-10-15': 'Buildings on both sides and asphalt down the middle.',
  '2026-10-16': 'Rooftops in the cold season.',
  '2026-10-17': 'The end of the day, and what floats overhead.',
};

console.log(APPLY ? '*** APPLY: this will write to the live database ***\n' : 'DRY RUN: nothing will be written.\n');

step(1, 'the puzzles and their answers');
const rows = await appSql(`
  select d.id, d.publish_on::text as publish_on, d.hint, a.themes
    from public.daily_puzzles d join public.daily_puzzle_answers a on a.puzzle_id = d.id
   where d.publish_on::text = any(${`array[${Object.keys(HINTS).map(q).join(',')}]::text[]`})
   order by d.publish_on;
`);
const missing = Object.keys(HINTS).filter((d) => !rows.some((r) => r.publish_on === d));
if (missing.length) fail(`no puzzle on ${missing.join(', ')}`);
console.log(`  ${rows.length} puzzle(s)`);

step(2, 'no hint names a word the grader accepts');
let leaks = 0;
for (const r of rows) {
  const bad = hintGiveaways(HINTS[r.publish_on], r.themes);
  if (bad.length) {
    leaks++;
    console.log(`  LEAK ${r.publish_on} (${r.themes.join(' + ')}): ${bad.join(', ')}`);
  }
}
if (leaks) fail(`${leaks} hint(s) give an answer away`);
console.log('  all clean');

step(3, APPLY ? 'setting hints' : 'what would change');
for (const r of rows) {
  const next = HINTS[r.publish_on];
  const same = (r.hint ?? '') === next;
  console.log(`  ${r.publish_on}  ${r.themes.join(' + ')}\n      ${same ? 'unchanged' : `${r.hint ? `"${r.hint}" -> ` : ''}"${next}"`}`);
  if (APPLY && !same) {
    const [out] = await adminSql(`select public.admin_set_puzzle_hint(${q(r.id)}::uuid, ${q(next)}) as hint;`);
    if (out.hint !== next) fail(`${r.publish_on}: stored "${out.hint}"`);
  }
}

if (!APPLY) {
  console.log('\nOK: dry run. Re-run with --apply.');
  process.exit(0);
}

step(4, 'reading back');
const check = await appSql(`
  select publish_on::text as publish_on, hint from public.daily_puzzles
   where publish_on::text = any(${`array[${Object.keys(HINTS).map(q).join(',')}]::text[]`});
`);
const wrong = check.filter((r) => r.hint !== HINTS[r.publish_on]);
if (wrong.length) fail(`${wrong.length} hint(s) did not land: ${wrong.map((r) => r.publish_on).join(', ')}`);
console.log(`\nOK: ${check.length} hint(s) set.`);

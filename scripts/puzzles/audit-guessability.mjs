/**
 * Would a reasonable player's guess be accepted? Reports; writes nothing.
 *
 *   node scripts/puzzles/audit-guessability.mjs
 *   node scripts/puzzles/audit-guessability.mjs --from 2026-09-30
 *
 * THE QUESTION THIS ANSWERS. A puzzle is unfair when the nine cards support a word that is not the
 * answer and is not accepted either. If every card on the "mountain + snow" page is also tagged
 * `ice`, then `ice` is what a lot of people will type, and being told they are wrong is the bad
 * experience: not because they failed to see the picture, but because they saw it and used a
 * different word for it.
 *
 * SO THE RIVALS ARE MEASURED, NOT IMAGINED. For each puzzle this counts every other scene/object
 * tag carried by the nine cards actually on the page. A tag on most of them is a word the page
 * genuinely supports, so it is what a player will reach for. Each rival is then run through the
 * REAL matcher, `public.puzzle_words_match`, rather than a guess at what it does, and reported as
 * accepted or refused.
 *
 * WHAT COUNTS AS A PROBLEM. A rival on nearly every card that the matcher refuses. A rival the
 * matcher accepts is working as intended, and a rival on three cards out of nine is a word the
 * page does not really support, so refusing it is correct.
 */
import { appSql, dataSql, isoDate, q, step, textArray } from '../lib/michi.mjs';

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const FROM = argOf('--from', isoDate(new Date()));

/** A rival on this share of the page is one a player can reasonably read off the cards. */
const STRONG = 0.66;

step(1, `puzzles from ${FROM}`);
const puzzles = await appSql(`
  select d.publish_on, d.card_ids, a.themes
    from public.daily_puzzles d join public.daily_puzzle_answers a on a.puzzle_id = d.id
   where d.publish_on >= ${q(FROM)}::date
   order by d.publish_on;
`);
console.log(`  ${puzzles.length} puzzle(s)`);
if (!puzzles.length) process.exit(0);

step(2, 'what else the cards on each page have in common');
const report = [];
for (const p of puzzles) {
  const n = p.card_ids.length;
  const rows = await dataSql(`
    select split_part(t, ':', 2) as word, count(distinct c.id)::int as hits
      from public.cards_en c, unnest(c.scene_tags) t
     where c.id::text = any(${textArray(p.card_ids)})
       and (t like 'scene:%' or t like 'object:%')
       and split_part(t, ':', 2) !~ '[^a-z]'
     group by 1 order by hits desc, word;
  `);
  // Everything the page supports, minus the answer itself.
  const rivals = rows
    .filter((r) => !p.themes.includes(r.word))
    .filter((r) => r.hits / n >= 0.5);

  // Asked of the REAL matcher, one round trip for the whole page.
  const checks = rivals.length
    ? await appSql(`
        select w, ${p.themes.map((t) => `public.puzzle_words_match(w, ${q(t)})`).join(' or ')} as accepted
          from unnest(${textArray(rivals.map((r) => r.word))}) as w;
      `)
    : [];
  const accepted = new Map(checks.map((c) => [c.w, c.accepted]));

  const strongRefused = rivals.filter((r) => r.hits / n >= STRONG && !accepted.get(r.word));
  report.push({ ...p, n, rivals, accepted, strongRefused });

  console.log(`\n  ${p.publish_on}  answer: ${p.themes.join(' + ')}  (${n} cards)`);
  if (!rivals.length) console.log('    no other word is carried by half the page');
  for (const r of rivals) {
    const share = `${r.hits}/${n}`;
    const verdict = accepted.get(r.word) ? 'accepted' : 'REFUSED ';
    const flag = r.hits / n >= STRONG && !accepted.get(r.word) ? '  <-- a player who says this is told they are wrong' : '';
    console.log(`    ${verdict}  ${share.padEnd(5)} ${r.word}${flag}`);
  }
}

step(3, 'the verdict');
let unfair = 0;
for (const r of report) {
  if (r.strongRefused.length) {
    unfair += 1;
    console.log(`  UNFAIR  ${r.publish_on}  ${r.themes.join(' + ')}: refuses ${r.strongRefused.map((x) => x.word).join(', ')}`);
  } else {
    console.log(`  ok      ${r.publish_on}  ${r.themes.join(' + ')}`);
  }
}
console.log(`\n${unfair} of ${report.length} puzzle(s) refuse a word most of the page supports.`);

/**
 * Build a fortnight of daily puzzles with one command. Dry run by default; --apply writes.
 *
 *   node scripts/puzzles/fill-queue.mjs                    (proposes, writes nothing)
 *   node scripts/puzzles/fill-queue.mjs --days 14 --apply
 *
 * WHAT IT DOES: picks a theme combination for each day, pulls the cards that match it, and writes
 * ONE binder for the whole run under the admin account (owner, 2026-10-18: "1 binder for the next
 * fortnight, all pages 3x3"). Page 1 is blank, so that in double-sided view every day that follows
 * is a spread: the LEFT page is the puzzle itself, the best nine matches, titled with its date; the
 * RIGHT page is nine more matches, titled with the themes, there in case the owner wants to swap a
 * card before the day comes. The share image points at the question marks, the binder is
 * showcased, and each left page is scheduled as that day's puzzle. It stops there. A future-dated
 * puzzle is NOT live: the read policy on `daily_puzzles` is `publish_on <= puzzle_today()`, so a
 * scheduled row is invisible to every player until its morning. Studio lists it so it can be
 * reviewed, edited or unpublished first.
 *
 * Before 2026-10-18 every day got its own binder (26 of them by then), with the puzzle on page 2
 * and the leftover matches spilled across "Also matched" pages. Those binders are left as they are;
 * the puzzles they produced point at them.
 *
 * EVERY PUZZLE GETS AN EASY HINT (owner, 2026-10-13: "they all need hints"). Until then the hint
 * was left for a person to write as wordplay, and twenty-one of twenty-four puzzles shipped with
 * none. The hint is now built from the two answers by src/data/puzzleHints.ts, one plain clue per
 * word and never a word the grader accepts, and it goes in with the publish. A word with no clue
 * yet is reported in step 4 and the puzzle still ships; add the clue there, then set the hint in
 * Studio. Studio can still replace any generated hint with a hand-written one.
 *
 * HOW A COMBINATION IS CHOSEN. Four rules, each of which killed a bad puzzle in testing:
 *   1. Only `scene:` and `object:` tags. The corpus also carries mood:, action:, style:, medium:,
 *      subjects:, scale: and flag:. "tense" and "posing" are real tags, and no player will ever
 *      guess them; a puzzle is only fair when the answer is a thing you can see in the picture.
 *   2. Only illustration rares, special illustration rares and named full arts. On those the card
 *      IS the picture, which is what makes a page worth looking at.
 *   3. Reject a pair where one word implies the other. `trees` + `forest` intersect at almost
 *      every tree card, so the second word adds nothing and the puzzle has no second answer worth
 *      guessing. Measured as overlap over the rarer word's own count.
 *   4. Reject a combination that is too broad or too narrow. Under a full grid there is nothing to
 *      show; far above it the connection stops being visible in nine pictures.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ROOT, adminSql, adminUser, appSql, cardImageUrl, dataSql,
  fail, imageManifest, puzzleToday, addDays, q, step, textArray,
} from '../lib/michi.mjs';
import { caption } from './caption.mjs';
import { HOLIDAYS, SPECIAL_WORDS, holidayOn } from './holidays.mjs';
import { CLUES, hintFor } from '../../src/data/puzzleHints.ts';
import { familyList } from '../../src/data/puzzleSynonyms.ts';

const APPLY = process.argv.includes('--apply');
/**
 * --redo: the days still to come are rebuilt. Every puzzle dated after today is withdrawn (nobody
 * has played it: it was never visible), its fortnight binder goes with it once nothing points at
 * it, and the run fills those days again. For when the picking rules change under a queue that
 * is already scheduled, as they did on 2026-10-18.
 */
const REDO = process.argv.includes('--redo');
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const DAYS = Math.max(1, Math.min(400, Number(argOf('--days', '14'))));
/**
 * --pair-rest <days>: how long before the same two words may be a puzzle again. The default is
 * never (owner, 2026-09-29: "the same PAIR, ever: that is the same puzzle"), which the vocabulary
 * supports for about seven months. A year needs some pairs back; with a rest of 180 days and the
 * page-overlap rule still refusing a page that shares more than a third of its cards, a returning
 * pair is a different page about the same two words, half a year on.
 */
const PAIR_REST_DAYS = Number(argOf('--pair-rest', 'Infinity'));

/** The picture kinds where the artwork is the whole card. */
const ART_KINDS = `('special_illustration_rare','illustration_rare','named_full_art')`;
/**
 * Worth about one place in the order of its kind, among the cards that did not make the first
 * group (see the order by): a full art with a faint theme still edges a windowed one on the spares.
 */
const FULL_ART_BONUS = 0.3;
/** The fainter theme must be in the top three of its kind, which is what the caption carries. */
const MIN_WEAKEST = 0.5;

/**
 * Words that are in the scene/object namespaces but are not things a player can name. Some are
 * compositional ("outlines", "streaks"), some are body parts that belong to the Pokemon rather
 * than the scene ("claws", "wings"), and "abstract" is the absence of a scene.
 */
const UNGUESSABLE = new Set([
  'abstract', 'outlines', 'sparkles', 'streaks', 'swirls', 'light', 'lettering', 'shapes',
  'claws', 'fins', 'wings', 'tail', 'eyes', 'horns', 'fur', 'scales',
  'indoors', 'outdoors', 'background', 'foreground', 'patterns', 'texture',
  // Real places, but not what anyone calls the picture (owner, 2026-10-18: ruins is not intuitive).
  'ruins',
  // The wider vocabulary brought in things that are in pictures without being what a picture is
  // about: furniture, fittings, parts of things, and words that duplicate a better one.
  'arena', 'bag', 'belt', 'bone', 'branch', 'building', 'buildings', 'debris', 'door', 'festival',
  'fossil', 'glasses', 'laboratory', 'leaf', 'log', 'machinery', 'pillars', 'pipes', 'railing',
  'stadium', 'stairs', 'table', 'window', 'windows',
]);

/**
 * Two answer words must never come from one synonym family, and the list is THE SAME ONE the
 * grader uses (src/data/puzzleSynonyms.ts, seeded into public.puzzle_synonyms).
 *
 * It has to be the same list. The grader accepts any word in a family as the answer, so if a
 * puzzle's two answers shared a family, one guess would satisfy either of them: it would count
 * once, the player would be told they were right, and the second theme would be unreachable
 * because the word that reaches it has already been spent. Keeping a second hand-written copy here
 * would mean that invariant held only until the two drifted.
 */
const familyOf = new Map();
for (const { family, words } of familyList()) for (const w of words) familyOf.set(w, family);

console.log(APPLY ? '*** APPLY: this will write to the live database ***\n' : 'DRY RUN: nothing will be written.\n');

// ---------------------------------------------------------------------------

step(1, 'the guessable vocabulary');
/**
 * THE POOL IS EVERY CARD WHERE THE WORD IS PLAINLY THERE (2026-10-18). Until now a word counted
 * only on full arts, which gave 77 words and ran dry after 107 days; a year needs more. A card now
 * counts for a word when the word is in the top three of its kind (scene: or object:) in the tag
 * order, which is the caption and is the same test the page itself applies. Frame does not enter
 * into it here: the page prefers full arts when it is built, but the vocabulary and the pair counts
 * are about whether a page CAN be made of cards where both things are obvious.
 *
 * The namespace a word mostly appears under separates a setting from a prop: `scene:cave` is
 * somewhere the picture happens, `object:bottle` is a thing lying in it. Both are guessable, but
 * two settings make a puzzle worth posting and two props ("leaves + rocks") make one nobody
 * remembers, so the namespace is carried through to the scoring rather than thrown away here.
 *
 * Holiday words (holidays.mjs) join with their own namespace, mood included, and are kept out of
 * ordinary days further down.
 */
const SPECIAL = Object.keys(SPECIAL_WORDS);
const SPECIAL_TAGS = Object.entries(SPECIAL_WORDS).map(([w, ns]) => `${ns}:${w}`);
const TOP3 = `
  with top as (
    select c.id, split_part(u.tag, ':', 2) as word, split_part(u.tag, ':', 1) as ns,
           row_number() over (partition by c.id, split_part(u.tag, ':', 1) order by u.ord) as rk
      from public.cards_en c, unnest(c.scene_tags) with ordinality as u(tag, ord)
     where (u.tag like 'scene:%' or u.tag like 'object:%' or u.tag = any(${textArray(SPECIAL_TAGS)}))
       and split_part(u.tag, ':', 2) !~ '[^a-z]'
  ), t3 as (
    select distinct id, word, ns from top where rk <= 3
  )`;
const vocab = await dataSql(`${TOP3}
  select word, count(distinct id)::int as n, mode() within group (order by ns) as kind
    from t3
   group by 1 having count(distinct id) >= 40 or word = any(${textArray(SPECIAL)})
   order by n desc limit 200;
`);
const words = vocab.filter((v) => !UNGUESSABLE.has(v.word) || SPECIAL_WORDS[v.word]);
const scenes = words.filter((w) => w.kind === 'scene');
console.log(`  ${words.length} usable words (dropped ${vocab.length - words.length} unguessable)`);
console.log(`  ${scenes.length} settings: ${scenes.slice(0, 16).map((w) => w.word).join(', ')} ...`);
console.log(`  ${words.length - scenes.length} props:    ${words.filter((w) => w.kind !== 'scene').slice(0, 12).map((w) => w.word).join(', ')} ...`);
console.log(`  ${SPECIAL.length} holiday words kept back: ${SPECIAL.join(', ')}`);
if (words.length < 20) fail('too few usable words to build a queue from');

step(2, 'what has already been used');
const everyPuzzle = await appSql(`
  select d.id, d.publish_on, a.themes, d.card_ids, d.source_binder_id,
         d.publish_on > public.puzzle_today() as still_to_come
    from public.daily_puzzles d join public.daily_puzzle_answers a on a.puzzle_id = d.id
   order by d.publish_on;
`);
// Under --redo the days still to come are treated as empty: their pairs and pages are not history.
const redone = REDO ? everyPuzzle.filter((r) => r.still_to_come) : [];
const used = everyPuzzle.filter((r) => !redone.includes(r));
const taken = new Set(used.map((r) => r.publish_on));
if (redone.length) {
  console.log(`  --redo: ${redone.length} scheduled day(s) will be rebuilt: ${redone[0].publish_on} to ${redone[redone.length - 1].publish_on}`);
}

/**
 * WHAT COUNTS AS A REPEAT (owner, 2026-09-29: "don't repeat 10-01; if the cards are different,
 * that's ok"). The first version retired both words of every puzzle for good, and with 77 usable
 * words that left NINE fair pairs in the whole vocabulary after one week: the queue was a cliff.
 * So a WORD may come back with a different partner, and three things are refused instead:
 *   1. the same PAIR, ever: that is the same puzzle;
 *   2. a page sharing more than a third of its cards with any earlier page: same puzzle in a
 *      different costume, which is what 10-01 was to 09-28;
 *   3. either word within the last COOLDOWN days: `forest + sky` on Monday and `forest + river`
 *      on Tuesday is a repeat to anyone who played both, whatever the cards.
 */
const COOLDOWN_DAYS = 7;
const MAX_SHARED = 1 / 3;
const pairKey = (a, b) => [a, b].sort().join('+');
/** pair -> the last day it ran, so a rest can be measured from it. */
const pairLastOn = new Map();
for (const r of used) pairLastOn.set(pairKey(r.themes[0], r.themes[1] ?? r.themes[0]), r.publish_on);
const pairResting = (key, on) => {
  const last = pairLastOn.get(key);
  return last !== undefined && dayGap(last, on) < PAIR_REST_DAYS;
};
const usedPairs = new Set(pairLastOn.keys());
const usedPages = used.map((r) => ({ on: r.publish_on, ids: new Set(r.card_ids) }));
const today = puzzleToday();
/** Words used within COOLDOWN_DAYS either side of `on`, across history and this run so far. */
const dayGap = (a, b) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const restingOn = (on, extra) =>
  new Set([...used, ...extra].filter((r) => dayGap(r.publish_on, on) < COOLDOWN_DAYS).flatMap((r) => r.themes));
console.log(`  ${used.length} puzzle(s) so far; ${usedPairs.size} pair(s) used, resting ${Number.isFinite(PAIR_REST_DAYS) ? `${PAIR_REST_DAYS} days` : 'for good'}`);
console.log(`  resting on ${today}: ${[...restingOn(today, [])].sort().join(', ') || '(none)'}`);

/**
 * A page needs something to choose FROM. A 2x2 with exactly four matching cards is not curated,
 * it is whatever matched, and the last few puzzles of a long run were exactly that. Two spare
 * candidates is the floor: enough that the weakest card on the page was left off for a reason.
 */
const MIN_SPARE = 2;

step(3, 'scoring every pair');
const names = words.map((w) => w.word);
const counts = new Map(words.map((w) => [w.word, w.n]));
const pairs = await dataSql(`${TOP3}
  select a.word as w1, b.word as w2, count(distinct a.id)::int as n
    from t3 a join t3 b on b.id = a.id and b.word > a.word
   where a.word = any(${textArray(names)}) and b.word = any(${textArray(names)})
   group by 1, 2 having count(distinct a.id) >= 12
   order by n desc;
`);
console.log(`  ${pairs.length} pair(s) with at least 12 cards showing both plainly`);

/**
 * A pair is worth publishing when it fills a grid without being a near-synonym of itself. The
 * score prefers a set a little larger than the grid (so the page is the pick of the bunch rather
 * than everything that matched) and penalises implication.
 *
 * EVERY PAGE IS 3x3 (owner, 2026-10-18). A 2x2 used to be the fallback for a thin pair; it made a
 * weaker post and an odd spread beside nine spares, so a pair that cannot fill nine is skipped.
 */
const GRID = () => ({ rows: 3, cols: 3, size: 9 });
const kindOf = new Map(words.map((w) => [w.word, w.kind]));
const scored = [];
for (const p of pairs) {
  // Under twelve there is no page and no spares; far above 150 the link stops being visible.
  const special = Boolean(SPECIAL_WORDS[p.w1] || SPECIAL_WORDS[p.w2]);
  if (p.n < 12 || (p.n > 150 && !special)) continue;
  const rarer = Math.min(counts.get(p.w1) ?? 0, counts.get(p.w2) ?? 0);
  const implies = rarer ? p.n / rarer : 1;
  // Rule 3: one word gives the other away. A holiday pair gets more room, because its page is
  // about the day: tender + flowers (44%) is a Valentine's page, celebrating + festive (98%) is
  // still one word twice.
  if (implies > (special ? 0.60 : 0.40)) continue;
  // Two words for the same thing is a trick, not a puzzle.
  const f1 = familyOf.get(p.w1);
  if (f1 !== undefined && f1 === familyOf.get(p.w2)) continue;
  // Two props is a puzzle about nothing. At least one word has to name a place. A holiday word is
  // excused: "tender + flowers" on the 14th of February is about the day, which is setting enough.
  const settings = [p.w1, p.w2].filter((w) => kindOf.get(w) === 'scene').length;
  if (settings === 0 && !SPECIAL_WORDS[p.w1] && !SPECIAL_WORDS[p.w2]) continue;
  const grid = GRID(p.n);
  // Best when the matched set is about three grids: enough to choose from, still a visible link.
  const ratio = p.n / grid.size;
  const fit = ratio < 1 ? 0 : Math.max(0, 1 - Math.abs(Math.log(ratio / 3)));
  const settingBonus = settings === 2 ? 1 : 0.7;
  scored.push({ ...p, grid, implies, settings, score: fit * (1 - implies) * settingBonus });
}
scored.sort((a, b) => b.score - a.score);
console.log(`  ${scored.length} publishable after the implication, size and setting rules`);
for (const s of scored.slice(0, 8)) {
  console.log(`    ${s.w1} + ${s.w2}: ${s.n} cards, ${s.grid.rows}x${s.grid.cols}, overlap ${(s.implies * 100).toFixed(0)}%, score ${s.score.toFixed(2)}`);
}

step(4, `choosing ${DAYS} fair day(s)`);
// No word is reused, within this run or against anything already published, so a player never
// sees the same answer twice and the vocabulary list stays a fair guessing pool.
/**
 * A CANDIDATE IS NOT ACCEPTED UNTIL ITS OWN PAGE HAS BEEN LOOKED AT.
 *
 * Choosing the pair and then pulling its cards, in that order, was how the first week went out
 * with three puzzles nobody could win. "food + house" reads as a page about a kitchen: `cup` is on
 * seven of its nine cards and `kitchen` on six, neither is food or a house, and a player who types
 * either is told they are wrong. The pair looked fine; only the page it produced showed the
 * problem.
 *
 * So the loop pulls the cards, reads what ELSE those exact cards have in common, asks the real
 * grader whether it would accept those words, and drops the pair when a word carried by most of
 * the page would be refused. It then moves on to the next candidate rather than shrinking the week.
 *
 * A rival the grader ACCEPTS is fine: that is the synonym table doing its job (`trees` on a forest
 * page). A rival on half the page or less is a word the page does not really support.
 */
const STRONG_RIVAL = 0.66;
const manifest = await imageManifest();
const chosen = [];
const rejected = [];
// The day the NEXT accepted candidate lands on: the first free morning from today. Computed before
// the cooldown check, because the cooldown is relative to that day, and only advanced on accept.
const nextFree = () => {
  let d = addDays(today, -1);
  do { d = addDays(d, 1); } while (taken.has(d) || chosen.some((c) => c.publish_on === d));
  return d;
};

/**
 * ONE PASS PER DAY, NOT ONE PASS OVER THE PAIRS (2026-10-18). The loop used to walk the scored list
 * once, and a pair turned away because a word was resting that day was never looked at again, even
 * though the word would be rested a week later. Asked for a fortnight it stopped at seven, with
 * the best-scoring pairs of the vocabulary all unused. Now each day starts again at the top of the
 * list and takes the first pair that is fair ON THAT DAY. What a pair's page says about itself does
 * not depend on the day, so that inspection is done once and remembered.
 */
/** The tags a word can appear under: scene or object for everyone, its own namespace for a holiday word. */
const tagsFor = (w) => [`scene:${w}`, `object:${w}`, ...(SPECIAL_WORDS[w] ? [`${SPECIAL_WORDS[w]}:${w}`] : [])];

const inspected = new Map();
const inspect = async (s) => {
  const key = pairKey(s.w1, s.w2);
  if (inspected.has(key)) return inspected.get(key);
  const result = await (async () => {
    /**
     * HOW OBVIOUS ARE THE THEMES ON THIS CARD (owner, 2026-10-18)? The berries + jungle page carried
     * an illustration rare whose "berries" were something tiny in a background character's hand. The
     * tag list is written in order of salience, so each word is weighted by where it sits AMONG ITS
     * OWN KIND (the scene: tags, or the object: tags): first 1.0, second 0.75, third 0.5, fourth
     * 0.25, after that nothing. The caption the tagger writes is the top three of each kind, so "in
     * the caption" and "worth a weight" are the same test. Ranking within the kind, not across the
     * whole list as the server's tag_rank_weights does, matters because a full art carries forty
     * tags and an old windowed card a dozen: across the whole list the windowed card's scenery
     * always looked more prominent, and a first try put nine windowed cards on nine pages.
     *
     * The weaker of the two words counts most, because a page is only about two things if each is
     * plainly there. A full-art kind adds about one place, so it wins unless a windowed card shows
     * both themes clearly higher up, which is the trade the owner asked for.
     */
    const rows = await dataSql(`
      with hit as (
        select c.id::text as id, c.name, c.number, c.rarity, c.set_name, c.illustrator,
               c.full_art_kind, coalesce(c.full_art_score, 0) as art_score,
               coalesce(max(t.w) filter (where t.tag = any(${textArray(tagsFor(s.w1))})), 0) as w1,
               coalesce(max(t.w) filter (where t.tag = any(${textArray(tagsFor(s.w2))})), 0) as w2
          from public.cards_en c, lateral (
            select u.tag, greatest(0, 1 - 0.25 * (row_number() over (partition by split_part(u.tag, ':', 1) order by u.ord) - 1)) as w
              from unnest(c.scene_tags) with ordinality as u(tag, ord)
             where u.tag like 'scene:%' or u.tag like 'object:%' or u.tag = any(${textArray(SPECIAL_TAGS)})
          ) t
         where c.scene_tags && ${textArray(tagsFor(s.w1))}
           and c.scene_tags && ${textArray(tagsFor(s.w2))}
         group by c.id, c.name, c.number, c.rarity, c.set_name, c.illustrator, c.full_art_kind, c.full_art_score
      )
      select *, least(w1, w2) as weakest,
             least(w1, w2) * 0.6 + greatest(w1, w2) * 0.4
               + case when full_art_kind in ${ART_KINDS} then ${FULL_ART_BONUS} else 0 end as salience
        from hit
       -- FULL ART FIRST, as long as both themes are plainly there (owner, 2026-10-18): a full art
       -- whose fainter theme is in the caption outranks every windowed card; windowed cards fill
       -- what is left. Within each group, how plainly the themes show still decides the order.
       order by (full_art_kind in ${ART_KINDS} and least(w1, w2) >= ${MIN_WEAKEST}) desc,
                salience desc, art_score desc, id
       limit 120;
    `);
    // Only cards whose picture resolves: a pocket with no address draws blank, and the publish RPC
    // refuses a partial address list outright.
    const pictured = rows.filter((r) => cardImageUrl(manifest, r.id));
    // The puzzle page takes only cards where the fainter theme is still in the top handful of tags;
    // anything below that is a spare at best, however good the artwork.
    const obvious = pictured.filter((r) => Number(r.weakest) >= MIN_WEAKEST);
    if (obvious.length < s.grid.size) {
      return { reason: `only ${obvious.length} card(s) show both words plainly` };
    }
    const page = obvious.slice(0, s.grid.size);
    // The right-hand page: the next nine by the same score, for swapping in.
    const onPage = new Set(page.map((x) => x.id));
    const spares = pictured.filter((r) => !onPage.has(r.id)).slice(0, s.grid.size);
    if (spares.length < MIN_SPARE) {
      return { reason: `only ${spares.length} spare card(s) with pictures` };
    }
    const cards = [...page, ...spares];
    const isWindowed = (r) => !ART_KINDS.includes(`'${r.full_art_kind}'`);
    const windowed = { page: page.filter(isWindowed).length, spares: spares.filter(isWindowed).length };

    // What else do the cards ACTUALLY ON THE PAGE have in common?
    const rivalRows = await dataSql(`
      select split_part(t, ':', 2) as word, count(distinct c.id)::int as hits
        from public.cards_en c, unnest(c.scene_tags) t
       where c.id::text = any(${textArray(page.map((x) => x.id))})
         and (t like 'scene:%' or t like 'object:%')
         and split_part(t, ':', 2) !~ '[^a-z]'
       group by 1 having count(distinct c.id)::numeric / ${page.length} >= ${STRONG_RIVAL}
       order by hits desc;
    `);
    const rivals = rivalRows.filter((r) => r.word !== s.w1 && r.word !== s.w2);
    const unfair = [];
    if (rivals.length) {
      const graded = await appSql(`
        select w, public.puzzle_words_match(w, ${q(s.w1)})
                or public.puzzle_words_match(w, ${q(s.w2)}) as accepted
          from unnest(${textArray(rivals.map((r) => r.word))}) as w;
      `);
      for (const g of graded) if (!g.accepted) unfair.push(g.w);
    }
    if (unfair.length) {
      return { reason: `the page also says ${unfair.join(', ')}, which would be marked wrong` };
    }
    return { cards, page, spares, windowed };
  })();
  inspected.set(key, result);
  if (result.reason) rejected.push(`${s.w1} + ${s.w2}: ${result.reason}`);
  return result;
};

/**
 * HOLIDAYS GET FIRST PICK OF THEIR OWN WORDS (owner, 2026-10-18). On a holiday the list is walked
 * once per preferred word, best pair first, and the first fair pair wins; a word nobody can pair
 * fairly falls through to the next preference, and a holiday with none at all becomes an ordinary
 * day and says so. On every other day a pair carrying a reserved word is skipped, so the one eerie
 * page of the year is the one on the 31st.
 */
const noClue = new Set();
const isSpecial = (w) => SPECIAL_WORDS[w] !== undefined;
while (chosen.length < DAYS) {
  const landsOn = nextFree();
  const resting = restingOn(landsOn, chosen);
  const holiday = holidayOn(landsOn);
  const rounds = holiday
    ? [...holiday.words.map((w) => ({ word: w, list: scored.filter((s) => s.w1 === w || s.w2 === w).sort((a, b) => b.n - a.n) })),
       { word: null, list: scored }]
    : [{ word: null, list: scored }];
  let picked = null;
  for (const round of rounds) {
    if (picked) break;
    for (const s of round.list) {
    const key = pairKey(s.w1, s.w2);
    if (pairResting(key, landsOn)) continue;
    // A reserved word only on a holiday that lists it; the round's own word has to be on the page.
    const listed = (w) => holiday !== null && holiday.words.includes(w);
    if ((isSpecial(s.w1) && !listed(s.w1)) || (isSpecial(s.w2) && !listed(s.w2))) continue;
    if (round.word && s.w1 !== round.word && s.w2 !== round.word) continue;
    // The holiday's own words are excused the cooldown: festive is right on Christmas and right
    // again at New Year, six days later. Every other word rests as usual.
    if ((resting.has(s.w1) && !listed(s.w1)) || (resting.has(s.w2) && !listed(s.w2))) continue;
    // Every puzzle ships with a hint (owner, 2026-10-13), so a word with no clue is not an answer yet.
    if (!hintFor([s.w1, s.w2])) {
      for (const w of [s.w1, s.w2]) if (!CLUES[w]) noClue.add(w);
      continue;
    }

    const look = await inspect(s);
    if (look.reason) continue;
    const { cards, page, spares, windowed } = look;

    // Rule 2: the page has to be its own page, not an earlier one with a few swaps. Checked here
    // and not in inspect(), because the pages chosen in this run are part of what it compares to.
    const ids = new Set(page.map((x) => x.id));
    const twin = [...usedPages, ...chosen.map((c) => ({ on: c.publish_on, ids: new Set(c.page.map((x) => x.id)) }))]
      .find((u) => [...ids].filter((id) => u.ids.has(id)).length > page.length * MAX_SHARED);
    if (twin) {
      rejected.push(`${s.w1} + ${s.w2}: shares most of its cards with the ${twin.on} page`);
      continue;
    }

    // `themes` is what restingOn reads, for history and for this run alike. Leaving it off made the
    // within-run cooldown read undefined and silently pass, which put `city` on three consecutive
    // days in the first dry run.
    const hint = hintFor([s.w1, s.w2]);
    picked = {
      ...s, cards, page, spares, windowed, publish_on: landsOn, themes: [s.w1, s.w2], hint,
      holiday: round.word ? holiday.name : null,
    };
    break;
    }
  }
  if (!picked) break;
  pairLastOn.set(pairKey(picked.w1, picked.w2), landsOn);
  if (holiday && !picked.holiday) console.log(`  ${landsOn} is ${holiday.name}, but none of ${holiday.words.join(', ')} had a fair pair; an ordinary day`);
  chosen.push(picked);
}
if (noClue.size) {
  console.log(`  ${noClue.size} word(s) skipped for want of a clue (add them to src/data/puzzleHints.ts): ${[...noClue].sort().join(', ')}`);
}

for (const r of rejected.slice(0, 10)) console.log(`  dropped  ${r}`);
if (rejected.length > 10) console.log(`  dropped  ...and ${rejected.length - 10} more`);
if (chosen.length < DAYS) {
  console.log(`  only ${chosen.length} fair, unrepeated combination(s) available`);
}
if (!chosen.length) fail('nothing left to publish; every good combination is spent or unfair');

for (const c of chosen) {
  console.log(
    `  ${c.publish_on}  ${c.w1} + ${c.w2}  ${c.grid.rows}x${c.grid.cols}, `
    + `${c.n} candidates, ${c.page.length} on the page`
    + `${c.windowed.page ? ` (${c.windowed.page} windowed)` : ''}, ${c.spares.length} spare`
    + `${c.windowed.spares ? ` (${c.windowed.spares} windowed)` : ''}${c.spares.length < 9 ? ' (short of nine)' : ''}`,
  );
  console.log(`              hint: ${c.hint ?? '(none)'}${c.holiday ? `   (${c.holiday})` : ''}`);
}
const pageCards = chosen.reduce((n, c) => n + c.page.length, 0);
const pageWindowed = chosen.reduce((n, c) => n + c.windowed.page, 0);
console.log(`  ${pageWindowed} of ${pageCards} puzzle-page cards are windowed (${Math.round((100 * pageWindowed) / Math.max(1, pageCards))}%)`);
const holidaysInRange = HOLIDAYS.filter((h) => chosen.some((c) => c.publish_on === h.date));
console.log(`  ${chosen.filter((c) => c.holiday).length} of ${holidaysInRange.length} holiday(s) in range got their own theme`);

/**
 * THE PAGE GETS NO PICTURE, AND THAT IS THE POINT.
 *
 * This step used to search a photograph for the puzzle's own answer words, so the forest + sky
 * puzzle was published over a photograph of a forest under a sky. It looked good and it answered
 * the question the picture was asking. Every page written before 2026-09-25 carried that leak;
 * scripts/puzzles/set-share-backdrop.mjs cleaned them up.
 *
 * So the page keeps its default ground, and the SHARE image gets the question marks instead
 * (binders.share_backdrop), which are the same for every puzzle and give nothing away.
 */
step(5, 'the share backdrop, which gives nothing away');
const fallbackSrc = readFileSync(join(ROOT, 'src', 'data', 'dailyPuzzleLogic.ts'), 'utf8');
const fallbackMatch = /PUZZLE_BACKDROP_FALLBACK\s*=\s*([\s\S]*?);\s*$/m.exec(fallbackSrc);
if (!fallbackMatch) fail('PUZZLE_BACKDROP_FALLBACK not found in src/data/dailyPuzzleLogic.ts');
const SHARE_BACKDROP = [...fallbackMatch[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('');
if (!/^https:\/\/\S+$/.test(SHARE_BACKDROP)) fail(`that did not parse as an address: ${SHARE_BACKDROP}`);
console.log(`  ${SHARE_BACKDROP}`);
console.log('  pages are left with no picture, so none of them hints at its own answer');

if (!APPLY) {
  console.log(`\nOK: ${chosen.length} day(s) proposed, nothing written. Re-run with --apply.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------

const me = await adminUser();
if (redone.length) {
  step(6, `withdrawing the ${redone.length} day(s) being rebuilt`);
  for (const r of redone) await adminSql(`select public.admin_unpublish_puzzle(${q(r.id)}::uuid);`);
  // A fortnight binder nothing points at any more was only ever these puzzles' pages.
  const gone = await appSql(`
    delete from public.binders b
     where b.owner_id = ${q(me.id)} and b.title like 'Daily Puzzles: %'
       and not exists (select 1 from public.daily_puzzles d where d.source_binder_id = b.id)
    returning b.title;
  `);
  for (const g of gone) console.log(`  removed binder "${g.title}"`);
}
step(redone.length ? 7 : 6, `writing as @${me.username}, one binder per fortnight`);
/**
 * A YEAR IS TWENTY-SIX FORTNIGHTS, each its own binder, so the account reads as a shelf of
 * fortnights rather than one 730-page book. Each binder: page 0 blank, then a spread per day,
 * the puzzle on the left titled with its date and the spares on the right titled with the themes.
 */
const FORTNIGHT = 14;
const binderIds = [];
for (let i = 0; i < chosen.length; i += FORTNIGHT) {
  const span = chosen.slice(i, i + FORTNIGHT);
  const first = span[0].publish_on;
  const last = span[span.length - 1].publish_on;
  const title = `Daily Puzzles: ${first} to ${last}`;
  const binderId = randomUUID();
  // Re-running the same span replaces its binder; the puzzles are re-pointed at the new pages below.
  await appSql(`delete from public.binders where owner_id = ${q(me.id)} and title = ${q(title)};`);

  // No answers in the description: the themes are the right-hand page titles, which is enough for
  // the owner and is only reachable by someone who already has the link (hidden_from_feeds).
  await appSql(`
    insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id,
                                is_public, is_demo, share_backdrop)
    values (${q(binderId)}, ${q(me.id)}, ${q(title)},
            ${q(`Puzzle pages for ${first} to ${last}. Each spread: the puzzle on the left, titled with its date; nine spare matches on the right, titled with the themes.`)},
            'themed_story', ${q(span[0].page[0].id)}, false, false, ${q(SHARE_BACKDROP)});
  `);

  // Page 0 blank, so every day that follows is a facing pair in double-sided view: left the puzzle,
  // right its spares.
  const pages = [{ id: randomUUID(), title: null, cards: [] }];
  for (const c of span) {
    c.pageId = randomUUID();
    c.binderId = binderId;
    pages.push({ id: c.pageId, title: c.holiday ? `${c.publish_on} · ${c.holiday}` : c.publish_on, cards: c.page });
    pages.push({ id: randomUUID(), title: `${c.w1} + ${c.w2}`, cards: c.spares });
  }

  // Pages are created PUBLIC. A page's is_public is what the share renderer sees, and it reads the
  // binder as an anonymous caller; a public binder full of private pages draws nothing at all.
  await appSql(`
    insert into public.binder_pages (id, binder_id, position, title, rows, cols, background_color, is_public)
    values ${pages.map((p, k) =>
      `(${q(p.id)}, ${q(binderId)}, ${k}, ${q(p.title)}, 3, 3, null, true)`,
    ).join(',\n            ')};
  `);
  const slots = pages.flatMap((p) => p.cards.map((card, k) =>
    `(${q(randomUUID())}, ${q(p.id)}, ${Math.floor(k / 3)}, ${k % 3}, 1, 1, 'card', ${q(card.id)})`));
  await appSql(`
    insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id)
    values ${slots.join(',\n              ')};
  `);
  binderIds.push(binderId);
  console.log(`  "${title}": ${pages.length} pages (1 blank + ${span.length} spreads), ${slots.length} cards`);
}

step(7, 'showcasing and scheduling');
// The real RPCs, called as the admin, so this stays one definition with Studio rather than two.
// Each binder showcased once: it has to stay showcased for its whole fortnight, because the post
// image for every day in it is drawn from it.
for (const id of binderIds) await adminSql(`select public.admin_set_binder_showcase(${q(id)}, true);`);
for (const c of chosen) {
  const urls = c.page.map((card) => cardImageUrl(manifest, card.id));
  const [pub] = await adminSql(`
    select public.admin_publish_puzzle(
      ${q(c.publish_on)}::date, ${q(c.pageId)}::uuid,
      ${textArray([c.w1, c.w2])}, ${q(c.hint)}, ${textArray(urls)}) as id;
  `);
  c.puzzleId = pub.id;
  console.log(`  ${c.publish_on}  ${c.w1} + ${c.w2}  puzzle ${String(pub.id).slice(0, 8)}  hint: ${c.hint ?? '(none)'}`);
}

step(8, 'reading it back the way a player and the renderer would');
const check = await appSql(`
  select d.publish_on, d.theme_count, cardinality(d.card_ids) as cards,
         cardinality(d.card_image_urls) as pics, d.rows, d.cols,
         d.source_page_id is not null as has_page,
         b.is_public as showcased, b.hidden_from_feeds as hidden,
         (select count(*) from public.binder_pages p
           where p.binder_id = d.source_binder_id and p.is_public) as public_pages,
         a.themes
    from public.daily_puzzles d
    join public.daily_puzzle_answers a on a.puzzle_id = d.id
    left join public.binders b on b.id = d.source_binder_id
   where d.publish_on = any(${textArray(chosen.map((c) => c.publish_on))}::date[])
   order by d.publish_on;
`);
let bad = 0;
for (const r of check) {
  const ok = Number(r.cards) === Number(r.pics)
    && Number(r.cards) === Number(r.rows) * Number(r.cols)
    && r.has_page && r.showcased && r.hidden && Number(r.public_pages) > 0;
  if (!ok) bad += 1;
  console.log(
    `  ${ok ? 'ok  ' : 'BAD '} ${r.publish_on}  ${r.themes.join(' + ')}  ${r.cards} cards, ${r.pics} pictures, `
    + `${r.rows}x${r.cols}, page set: ${r.has_page}, showcased: ${r.showcased}, visible pages: ${r.public_pages}`,
  );
}
if (bad) fail(`${bad} scheduled puzzle(s) would not draw`);

// Nothing may have landed in the PAST. Today is allowed, and is the point: the 2026-10-04 run
// found the queue had ended the day before, and filling today is what it was for. A date before
// today would mean a puzzle went live retroactively, which is the regression this guards against.
const [when] = await appSql(`
  select count(*) filter (where publish_on < public.puzzle_today())::int as past,
         count(*) filter (where publish_on = public.puzzle_today())::int as today,
         count(*) filter (where publish_on > public.puzzle_today())::int as future
    from public.daily_puzzles
   where publish_on = any(${textArray(chosen.map((c) => c.publish_on))}::date[]);
`);
console.log(`  ${when.today} live today, ${when.future} still to come, ${when.past} in the past`);
if (Number(when.past) > 0) fail('a puzzle was scheduled for a day already gone');

step(9, 'writing the captions');
const dir = join(ROOT, 'state', 'puzzles');
mkdirSync(dir, { recursive: true });
for (const c of chosen) {
  const file = join(dir, `captions-${c.publish_on}.md`);
  writeFileSync(file, caption({ publishOn: c.publish_on, themes: [c.w1, c.w2], cardNames: c.page.map((x) => x.name), candidates: c.n, hint: c.hint }), 'utf8');
  console.log(`  ${file}`);
}

console.log(`\nOK: ${chosen.length} day(s) scheduled. Review them in Studio; none is live until its morning.`);

// ---------------------------------------------------------------------------

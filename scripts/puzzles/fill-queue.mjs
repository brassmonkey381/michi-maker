/**
 * Build a week of daily puzzles with one command. Dry run by default; --apply writes.
 *
 *   node scripts/puzzles/fill-queue.mjs                    (proposes, writes nothing)
 *   node scripts/puzzles/fill-queue.mjs --days 7 --apply
 *
 * WHAT IT DOES PER DAY: picks a theme combination, pulls the cards that match it, creates a binder
 * under the admin account, finds a backdrop photograph, showcases the binder, and schedules the
 * puzzle for a future date. It stops there. A future-dated puzzle is NOT live: the read policy on
 * `daily_puzzles` is `publish_on <= puzzle_today()`, so a scheduled row is invisible to every
 * player until its morning. Studio lists it so it can be reviewed, edited or unpublished first.
 *
 * THE HINT IS LEFT EMPTY ON PURPOSE. The hints that work are wordplay ("put the two words side by
 * side and you have somewhere a company keeps its data"), and a generated one would be filler that
 * reads as filler. Each day's caption file carries a `HINT:` line to fill in, and the puzzle plays
 * perfectly well with no hint at all, so nothing is blocked on writing one.
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
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ROOT, adminSql, adminUser, appSql, backdropFor, cardImageUrl, dataSql,
  fail, imageManifest, longDate, puzzleToday, addDays, q, step, textArray,
} from '../lib/michi.mjs';

const APPLY = process.argv.includes('--apply');
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const DAYS = Math.max(1, Math.min(21, Number(argOf('--days', '7'))));

/** The picture kinds where the artwork is the whole card. */
const ART_KINDS = `('special_illustration_rare','illustration_rare','named_full_art')`;

/**
 * Words that are in the scene/object namespaces but are not things a player can name. Some are
 * compositional ("outlines", "streaks"), some are body parts that belong to the Pokemon rather
 * than the scene ("claws", "wings"), and "abstract" is the absence of a scene.
 */
const UNGUESSABLE = new Set([
  'abstract', 'outlines', 'sparkles', 'streaks', 'swirls', 'light', 'lettering', 'shapes',
  'claws', 'fins', 'wings', 'tail', 'eyes', 'horns', 'fur', 'scales',
  'indoors', 'outdoors', 'background', 'foreground', 'patterns', 'texture',
]);

/**
 * Words too close to each other to be two separate answers. The overlap rule below catches a word
 * that IMPLIES another; it does not catch two words for nearly the same thing that happen to be
 * tagged independently. `field + meadow` overlaps only 48% of the time and still makes a puzzle
 * whose second answer is a synonym of the first, which reads as a trick rather than a connection.
 * Same family, so never paired together.
 */
const FAMILIES = [
  ['water', 'underwater', 'ocean', 'river', 'lake', 'sea', 'waves', 'bubbles'],
  ['field', 'meadow', 'grass', 'plains'],
  ['house', 'town', 'city', 'street', 'road', 'market', 'shop', 'buildings'],
  ['forest', 'trees', 'jungle', 'leaves', 'undergrowth', 'branches', 'woods'],
  ['flowers', 'petals', 'garden', 'blossoms'],
  ['snow', 'ice', 'winter', 'frost'],
  ['night', 'stars', 'moon', 'darkness'],
  ['sky', 'clouds', 'sunset', 'sunrise'],
  ['cave', 'rocks', 'crystals', 'gems', 'stones'],
  ['flames', 'fire', 'lava', 'embers'],
  ['storm', 'lightning', 'rain', 'thunder'],
];
const familyOf = new Map();
FAMILIES.forEach((group, i) => group.forEach((w) => familyOf.set(w, i)));

console.log(APPLY ? '*** APPLY: this will write to the live database ***\n' : 'DRY RUN: nothing will be written.\n');

// ---------------------------------------------------------------------------

step(1, 'the guessable vocabulary');
// The namespace a word mostly appears under is what separates a setting from a prop: `scene:cave`
// is somewhere the picture happens, `object:bottle` is a thing lying in it. Both are guessable, but
// two settings make a puzzle worth posting and two props ("leaves + rocks") make one nobody
// remembers, so the namespace is carried through to the scoring rather than thrown away here.
const vocab = await dataSql(`
  select split_part(t, ':', 2) as word,
         count(distinct c.id)::int as n,
         mode() within group (order by split_part(t, ':', 1)) as kind
    from public.cards_en c, unnest(c.scene_tags) t
   where c.full_art_kind in ${ART_KINDS}
     and (t like 'scene:%' or t like 'object:%')
     and split_part(t, ':', 2) !~ '[^a-z]'
   group by 1 having count(distinct c.id) >= 12
   order by n desc limit 90;
`);
const words = vocab.filter((v) => !UNGUESSABLE.has(v.word));
const scenes = words.filter((w) => w.kind === 'scene');
console.log(`  ${words.length} usable words (dropped ${vocab.length - words.length} unguessable)`);
console.log(`  ${scenes.length} settings: ${scenes.slice(0, 16).map((w) => w.word).join(', ')} ...`);
console.log(`  ${words.length - scenes.length} props:    ${words.filter((w) => w.kind !== 'scene').slice(0, 12).map((w) => w.word).join(', ')} ...`);
if (words.length < 20) fail('too few usable words to build a queue from');

step(2, 'what has already been used');
const used = await appSql(`
  select d.publish_on, a.themes
    from public.daily_puzzles d join public.daily_puzzle_answers a on a.puzzle_id = d.id
   order by d.publish_on;
`);
const spent = new Set(used.flatMap((r) => r.themes));
const taken = new Set(used.map((r) => r.publish_on));
console.log(`  ${used.length} puzzle(s) so far, using ${spent.size} distinct word(s)`);
console.log(`  already spent: ${[...spent].sort().join(', ') || '(none)'}`);

step(3, 'scoring every pair');
const names = words.map((w) => w.word);
const counts = new Map(words.map((w) => [w.word, w.n]));
const pairs = await dataSql(`
  with fa as (
    select c.id, c.scene_tags from public.cards_en c where c.full_art_kind in ${ART_KINDS}
  ), tagged as (
    select f.id, split_part(t, ':', 2) as word
      from fa f, unnest(f.scene_tags) t
     where (t like 'scene:%' or t like 'object:%')
       and split_part(t, ':', 2) = any(${textArray(names)})
  )
  select a.word as w1, b.word as w2, count(distinct a.id)::int as n
    from tagged a join tagged b on b.id = a.id and b.word > a.word
   group by 1, 2 having count(distinct a.id) >= 4
   order by n desc;
`);
console.log(`  ${pairs.length} pair(s) with at least 4 cards in common`);

/**
 * A pair is worth publishing when it fills a grid without being a near-synonym of itself. The
 * score prefers a set a little larger than the grid (so the page is the pick of the bunch rather
 * than everything that matched) and penalises implication.
 */
const GRID = (n) => (n >= 9 ? { rows: 3, cols: 3, size: 9 } : { rows: 2, cols: 2, size: 4 });
const kindOf = new Map(words.map((w) => [w.word, w.kind]));
const scored = [];
for (const p of pairs) {
  if (p.n < 4 || p.n > 60) continue;
  const rarer = Math.min(counts.get(p.w1) ?? 0, counts.get(p.w2) ?? 0);
  const implies = rarer ? p.n / rarer : 1;
  if (implies > 0.40) continue;            // rule 3: one word gives the other away
  // Two words for the same thing is a trick, not a puzzle.
  const f1 = familyOf.get(p.w1);
  if (f1 !== undefined && f1 === familyOf.get(p.w2)) continue;
  // Two props is a puzzle about nothing. At least one word has to name a place.
  const settings = [p.w1, p.w2].filter((w) => kindOf.get(w) === 'scene').length;
  if (settings === 0) continue;
  const grid = GRID(p.n);
  // Best when the matched set is 1.5x to 4x the grid: enough to choose from, still a visible link.
  const ratio = p.n / grid.size;
  const fit = ratio < 1 ? 0 : Math.max(0, 1 - Math.abs(Math.log(ratio / 2.2)));
  // A 3x3 is the better post: nine pictures carry the connection where four only hint at it.
  const gridBonus = grid.size === 9 ? 1 : 0.55;
  const settingBonus = settings === 2 ? 1 : 0.7;
  scored.push({ ...p, grid, implies, settings, score: fit * (1 - implies) * gridBonus * settingBonus });
}
scored.sort((a, b) => b.score - a.score);
console.log(`  ${scored.length} publishable after the implication, size and setting rules`);
for (const s of scored.slice(0, 8)) {
  console.log(`    ${s.w1} + ${s.w2}: ${s.n} cards, ${s.grid.rows}x${s.grid.cols}, overlap ${(s.implies * 100).toFixed(0)}%, score ${s.score.toFixed(2)}`);
}

step(4, `choosing ${DAYS} day(s)`);
// No word is reused, within this run or against anything already published, so a player never
// sees the same answer twice and the vocabulary list stays a fair guessing pool.
const chosen = [];
const blocked = new Set(spent);
for (const s of scored) {
  if (chosen.length >= DAYS) break;
  if (blocked.has(s.w1) || blocked.has(s.w2)) continue;
  blocked.add(s.w1);
  blocked.add(s.w2);
  chosen.push(s);
}
if (chosen.length < DAYS) {
  console.log(`  only ${chosen.length} distinct combination(s) available without reusing a word`);
}

// The first free morning from tomorrow on, so a run never overwrites a puzzle already scheduled.
const today = puzzleToday();
let cursor = today;
for (const c of chosen) {
  do { cursor = addDays(cursor, 1); } while (taken.has(cursor));
  taken.add(cursor);
  c.publish_on = cursor;
}
for (const c of chosen) {
  console.log(`  ${c.publish_on}  ${c.w1} + ${c.w2}  ${c.grid.rows}x${c.grid.cols}, ${c.n} candidates`);
}
if (!chosen.length) fail('nothing left to publish; every good combination uses a word already spent');

step(5, 'pulling the cards');
const manifest = await imageManifest();
for (const c of chosen) {
  const rows = await dataSql(`
    select c.id::text as id, c.name, c.number, c.rarity, c.set_name, c.illustrator,
           c.full_art_kind, coalesce(c.full_art_score, 0) as art_score
      from public.cards_en c
     where c.full_art_kind in ${ART_KINDS}
       and c.scene_tags && array[${q(`scene:${c.w1}`)}, ${q(`object:${c.w1}`)}]
       and c.scene_tags && array[${q(`scene:${c.w2}`)}, ${q(`object:${c.w2}`)}]
     order by case c.full_art_kind
                when 'special_illustration_rare' then 0
                when 'illustration_rare' then 1 else 2 end,
              c.full_art_score desc nulls last, c.id
     limit 60;
  `);
  // Only cards whose picture actually resolves: a pocket with no address draws blank, and the
  // publish RPC refuses a partial address list outright.
  c.cards = rows.filter((r) => cardImageUrl(manifest, r.id));
  const lost = rows.length - c.cards.length;
  c.page = c.cards.slice(0, c.grid.size);
  console.log(
    `  ${c.publish_on}  ${c.w1} + ${c.w2}: ${rows.length} matched`
    + `${lost ? `, ${lost} without a picture` : ''}, ${c.page.length} on the page`,
  );
  if (c.page.length < c.grid.size) fail(`${c.w1} + ${c.w2} cannot fill a ${c.grid.rows}x${c.grid.cols} page`);
}

step(6, 'finding backdrops');
const seenArt = new Set();
for (const c of chosen) {
  c.art = await backdropFor(`${c.w1} ${c.w2}`, { seen: seenArt });
  if (!c.art) c.art = await backdropFor(c.w1, { seen: seenArt });
  if (c.art) seenArt.add(c.art.url);
  console.log(`  ${c.publish_on}: ${c.art ? `${c.art.source}, ${c.art.credit}` : 'NONE (page keeps its default colour)'}`);
}

if (!APPLY) {
  console.log(`\nOK: ${chosen.length} day(s) proposed, nothing written. Re-run with --apply.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------

const me = await adminUser();
step(7, `writing as @${me.username}`);
for (const c of chosen) {
  const title = `Daily Puzzle: ${c.w1} + ${c.w2}`;
  const binderId = randomUUID();
  await appSql(`delete from public.binders where owner_id = ${q(me.id)} and title = ${q(title)};`);

  // The description is the answer in plain sight, which is safe because these binders are
  // hidden_from_feeds and only reachable by someone who already has the link.
  await appSql(`
    insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id, is_public, is_demo)
    values (${q(binderId)}, ${q(me.id)}, ${q(title)},
            ${q(`Answer: ${c.w1} + ${c.w2}. Scheduled for ${c.publish_on}.`)},
            'themed_story', ${q(c.page[0].id)}, false, false);
  `);

  // Page 0 blank so every later page has a facing partner in double-sided mode; page 1 is the
  // puzzle itself; the rest hold the cards that did not make the cut, for inspection.
  const pages = [{ id: randomUUID(), title: null, cards: [] },
                 { id: randomUUID(), title: `${c.w1} + ${c.w2}`, cards: c.page }];
  const rest = c.cards.slice(c.grid.size);
  for (let i = 0; i < rest.length; i += c.grid.size) {
    pages.push({ id: randomUUID(), title: `Also matched ${i + 1}+`, cards: rest.slice(i, i + c.grid.size) });
  }
  c.pageId = pages[1].id;

  // Pages are created PUBLIC. A page's is_public is what the share renderer sees, and it reads the
  // binder as an anonymous caller; a public binder full of private pages draws nothing at all.
  await appSql(`
    insert into public.binder_pages (id, binder_id, position, title, rows, cols, background_color, is_public)
    values ${pages.map((p, i) =>
      `(${q(p.id)}, ${q(binderId)}, ${i}, ${q(p.title)}, ${c.grid.rows}, ${c.grid.cols}, ${q(c.art?.url ?? null)}, true)`,
    ).join(',\n            ')};
  `);
  const slots = pages.flatMap((p) => p.cards.map((card, k) =>
    `(${q(randomUUID())}, ${q(p.id)}, ${Math.floor(k / c.grid.cols)}, ${k % c.grid.cols}, 1, 1, 'card', ${q(card.id)})`));
  if (slots.length) {
    await appSql(`
      insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id)
      values ${slots.join(',\n              ')};
    `);
  }
  c.binderId = binderId;
  console.log(`  "${title}": ${pages.length} pages, ${slots.length} cards`);
}

step(8, 'showcasing and scheduling');
for (const c of chosen) {
  // The real RPCs, called as the admin, so this stays one definition with Studio rather than two.
  await adminSql(`select public.admin_set_binder_showcase(${q(c.binderId)}, true);`);
  const urls = c.page.map((card) => cardImageUrl(manifest, card.id));
  const [pub] = await adminSql(`
    select public.admin_publish_puzzle(
      ${q(c.publish_on)}::date, ${q(c.pageId)}::uuid,
      ${textArray([c.w1, c.w2])}, null, ${textArray(urls)}) as id;
  `);
  c.puzzleId = pub.id;
  console.log(`  ${c.publish_on}  ${c.w1} + ${c.w2}  puzzle ${String(pub.id).slice(0, 8)}`);
}

step(9, 'reading it back the way a player and the renderer would');
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

// A scheduled puzzle must not be readable yet. This is the check that catches a policy regression.
const early = await appSql(`
  select count(*)::int as n from public.daily_puzzles
   where publish_on > public.puzzle_today()
     and publish_on = any(${textArray(chosen.map((c) => c.publish_on))}::date[]);
`);
console.log(`  ${early[0].n} of ${chosen.length} are still in the future, so no player can see them yet`);
if (Number(early[0].n) !== chosen.length) fail('a puzzle was scheduled for today or earlier and is live now');

step(10, 'writing the captions');
const dir = join(ROOT, 'state', 'puzzles');
mkdirSync(dir, { recursive: true });
for (const c of chosen) {
  const file = join(dir, `captions-${c.publish_on}.md`);
  writeFileSync(file, caption(c), 'utf8');
  console.log(`  ${file}`);
}

console.log(`\nOK: ${chosen.length} day(s) scheduled. Review them in Studio; none is live until its morning.`);

// ---------------------------------------------------------------------------

function caption(c) {
  const n = c.page.length;
  const themes = `${c.w1} + ${c.w2}`;
  return `# Daily Theme Search Puzzle, ${longDate(c.publish_on)}

Answer: \`theme:${c.w1} theme:${c.w2}\` (${c.n} candidates, ${n} on the page)

HINT: <write one, or delete this line and publish without a hint>

Generated by scripts/puzzles/fill-queue.mjs. The puzzle is scheduled, not live: it appears for
players on the morning of ${c.publish_on} and is listed in Studio until then.

${c.art ? `Backdrop: ${c.art.source}, ${c.art.credit}, ${c.art.page}` : 'Backdrop: none found.'}

---

## Instagram feed post

Download the image from Studio (the "image" button on this row), then paste:

> ${n} cards. Two theme search terms connect all of them.
>
> Can you get both? Play at michi-maker.com/daily, where your guesses are checked and your streak
> keeps going.
>
> To enter this week's draw for a free month of michi-maker: like this post, follow
> @michimakerofficial, and comment your michi-maker.com username.
>
> New puzzle every morning. Answer tomorrow.
>
> #pokemon #pokemontcg #pokemoncards #pokemonbinder #binder #tcgcollector #pokemoncollection
> #pokemoncardcollection #cardcollector
>
> Full rules: michi-maker.com/giveaway. Not sponsored, endorsed or administered by, or associated
> with, Instagram.

The hint goes LAST if you write one, so nobody reads it before trying the puzzle.

## Reddit, r/MichiMakers

**Title:** Daily Theme Search Puzzle, ${longDate(c.publish_on)}: can you guess the two themes?

**Body:**

> Every card on this page matches both of two artwork search terms. Guess them both.
>
> Put your answer in spoiler tags so the next person still gets to play: type \`>!like this!<\`.
>
> I will confirm answers in the comments tomorrow, when the next one goes up.
>
> New puzzle daily. Some are one theme, some are three.

No "like and follow" on Reddit: it reads as advertising, and tying a giveaway to upvotes breaks
the site rules on vote manipulation. Entry is the comment, never the vote.

## The page

Cards: ${c.page.map((x) => x.name).join(', ')}
Answer words: ${themes}
`;
}

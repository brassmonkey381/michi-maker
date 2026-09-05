import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickDiverse, planStoryBinder, rankedTags, scoreCard, seatingOrder, speciesKey, themeCandidates, type StoryCard } from './storyBinder.ts';
import { STORY_TEMPLATES, storyTheme } from './storyThemes.ts';

const WINTER = storyTheme('winter')!;
const SUMMER = storyTheme('summer')!;

/** A tagged card the way the catalog publishes one: bare + prefixed pairs, strongest first. */
function card(id: string, name: string, tags: string[], extra: Partial<StoryCard> = {}): StoryCard {
  const sceneTags = tags.flatMap((t) => [t.split(':')[1], t]);
  return { id, name, rarity: 'Illustration Rare', illustrator: `ill-${id}`, sceneTags, ...extra };
}

let n = 0;
const mkId = () => `id-${(n += 1)}`;

test('rankedTags weights prefixed tags by their published order and ignores bare duplicates', () => {
  const tags = rankedTags(card('1', 'Crabominable', ['scene:snow', 'flag:foil-obscured', 'mood:cold']));
  assert.equal(tags.size, 3);
  assert.equal(tags.get('scene:snow'), 1);
  assert.ok(tags.get('mood:cold')! < tags.get('flag:foil-obscured')!, 'later tags weigh less');
  assert.ok(tags.get('mood:cold')! >= 0.25);
});

test('scoreCard: a want match qualifies, avoid tags subtract, foil penalty applies', () => {
  const snowy = scoreCard(card('1', 'Glaceon', ['scene:snow', 'mood:cold']), WINTER)!;
  assert.ok(snowy.qualifies);
  assert.deepEqual(snowy.hits, ['scene:snow', 'mood:cold']);
  const beach = scoreCard(card('2', 'Vaporeon', ['scene:beach', 'mood:sunny']), WINTER);
  assert.equal(beach, null, 'a sunny beach is not winter');
  const foiled = scoreCard(card('3', 'Crabominable', ['scene:snow', 'flag:foil-obscured']), WINTER)!;
  assert.ok(foiled.score < snowy.score, 'the foil penalty ranks it below a clean snow card');
});

test('scoreCard: bonus-only needs two signals, and prefers picture rarities', () => {
  assert.equal(scoreCard(card('1', 'Eevee', ['mood:quiet']), WINTER), null);
  const two = scoreCard(card('2', 'Eevee', ['mood:quiet', 'scene:mountain']), WINTER)!;
  assert.equal(two.qualifies, false);
  const common = scoreCard(card('3', 'Snom', ['scene:snow'], { rarity: 'Common' }), WINTER)!;
  const ir = scoreCard(card('4', 'Snom', ['scene:snow'], { rarity: 'Special Illustration Rare' }), WINTER)!;
  assert.ok(ir.score > common.score);
});

test('themeCandidates honours the pool and the rarity mode', () => {
  const cards = [
    card('a', 'Glaceon', ['scene:snow']),
    card('b', 'Snom', ['scene:ice'], { rarity: 'Common' }),
    card('c', 'Frosmoth', ['scene:snow'], { language: 'ja' }),
  ];
  assert.deepEqual(themeCandidates(cards, WINTER).map((s) => s.card.id), ['a']);
  assert.deepEqual(themeCandidates(cards, WINTER, { rarity: 'all' }).map((s) => s.card.id), ['a', 'b']);
  assert.deepEqual(themeCandidates(cards, WINTER, { rarity: 'all', pool: new Set(['b']) }).map((s) => s.card.id), ['b']);
});

test('speciesKey strips decorations and reads the evolution line', () => {
  assert.equal(speciesKey({ id: '1', name: 'Umbreon ex', rarity: '' }), 'umbreon');
  assert.equal(speciesKey({ id: '2', name: 'Surfing Pikachu VMAX', rarity: '', evolutionLine: ['Pichu', 'Pikachu', 'Raichu'] }), 'pikachu');
  assert.equal(speciesKey({ id: '3', name: "Lillie's Clefairy ex", rarity: '' }), 'clefairy');
});

test('pickDiverse: one per species, two per illustrator, never a used card', () => {
  const ranked = themeCandidates(
    [
      card('1', 'Glaceon', ['scene:snow']),
      card('2', 'Glaceon ex', ['scene:snow']),
      card('3', 'Snom', ['scene:snow'], { illustrator: 'same' }),
      card('4', 'Frosmoth', ['scene:snow'], { illustrator: 'same' }),
      card('5', 'Cubchoo', ['scene:snow'], { illustrator: 'same' }),
      card('6', 'Beartic', ['scene:ice']),
    ],
    WINTER,
  );
  const picked = pickDiverse(ranked, 10, new Set(['1']));
  const ids = picked.map((s) => s.card.id);
  assert.ok(!ids.includes('1'), 'used card skipped');
  assert.ok(ids.includes('2'), 'the other Glaceon stands in');
  assert.equal(ids.filter((id) => ['3', '4', '5'].includes(id)).length, 2, 'illustrator capped at two');
  assert.ok(ids.includes('6'));
});

test('seatingOrder puts the pockets nearest the art first, row-major otherwise', () => {
  const plain = seatingOrder({ rows: 2, cols: 2 }, new Set());
  assert.deepEqual(plain, [[0, 0], [0, 1], [1, 0], [1, 1]]);
  const withArt = seatingOrder({ rows: 3, cols: 3 }, new Set(['0,0', '0,1', '0,2']));
  assert.deepEqual(withArt.slice(0, 3), [[1, 0], [1, 1], [1, 2]], 'the row under a top band seats first');
  assert.equal(withArt.length, 6);
});

test('planStoryBinder: a cover plus one two-page spread per theme, art jobs for every panel', () => {
  n = 0;
  const cards: StoryCard[] = [];
  const themes = { spring: 'scene:flowers', summer: 'scene:beach', autumn: 'object:leaves', winter: 'scene:snow' };
  for (const [season, tag] of Object.entries(themes)) {
    for (let i = 0; i < 20; i += 1) cards.push(card(`${season}-${i}`, `${season}mon ${i}`, [tag, 'flag:outdoor']));
  }
  const seasons = STORY_TEMPLATES.find((t) => t.id === 'seasons')!;
  const plan = planStoryBinder({ cards, template: seasons, shape: { rows: 3, cols: 4 }, mkId });

  assert.equal(plan.pages.length, 1 + 4 * 2, 'cover + four spreads');
  assert.equal(plan.spreads.length, 4);
  plan.spreads.forEach((s, i) => assert.deepEqual(s.pageIndexes, [1 + 2 * i, 2 + 2 * i]));
  // Spread leaves: odd index left, even right — the binder's page-side rule.
  for (const s of plan.spreads) assert.equal(s.pageIndexes[0] % 2, 1);

  // Every card appears once across the binder.
  const all = plan.pages.flatMap((p) => p.slots.filter((s) => s.type === 'card').map((s) => s.cardId!));
  assert.equal(new Set(all).size, all.length, 'no card twice');
  assert.equal(all.length, plan.cardIds.length);

  // Each spread's cards belong to its theme.
  const winter = plan.spreads.find((s) => s.theme.id === 'winter')!;
  for (const idx of winter.pageIndexes) {
    for (const slot of plan.pages[idx].slots) if (slot.type === 'card') assert.ok(slot.cardId!.startsWith('winter-'), slot.cardId);
  }

  // Art jobs: one per reserved artwork slot, pointing at a real slot on the right page.
  const artSlots = plan.pages.flatMap((p, pageIndex) => p.slots.filter((s) => s.type === 'artwork').map((s) => ({ pageIndex, s })));
  assert.ok(artSlots.length > 0, 'the templates reserve art');
  assert.equal(plan.artJobs.length, artSlots.length);
  for (const job of plan.artJobs) {
    const page = plan.pages[job.pageIndex];
    const slot = page.slots.find((s) => s.id === job.slotId)!;
    assert.ok(slot, 'job names an existing slot');
    assert.equal(slot.type, 'artwork');
    assert.ok(job.queries.length > 0);
  }
  // No card sits on a reserved cell.
  for (const p of plan.pages) {
    const taken = new Set<string>();
    for (const s of p.slots) {
      for (let r = s.row; r < s.row + s.rowSpan; r += 1) {
        for (let c = s.col; c < s.col + s.colSpan; c += 1) {
          const key = `${r},${c}`;
          assert.ok(!taken.has(key), `overlap at ${key} on ${p.title}`);
          taken.add(key);
        }
      }
    }
  }
  assert.equal(plan.pages[0].title, 'Seasons');
  assert.equal(plan.pages[1].title, 'Spring');
  assert.equal(plan.pages[1].description, 'Flowers, meadows and gardens; the cheerful, tender pictures.');
  assert.doesNotMatch(plan.pages[1].description ?? '', /scene:|mood:|Tags:/, 'no tag machinery in a caption');
});

test('planStoryBinder: a thin theme still builds, with fewer cards and no crash', () => {
  n = 0;
  const cards = [card('s1', 'Vaporeon', ['scene:beach']), card('s2', 'Wailord', ['scene:ocean'])];
  const plan = planStoryBinder({ cards, template: { id: 't', title: 'T', blurb: '', coverArt: ['x'], spreads: [SUMMER, WINTER] }, shape: { rows: 3, cols: 3 }, mkId });
  assert.equal(plan.pages.length, 5);
  const winter = plan.spreads.find((s) => s.theme.id === 'winter')!;
  assert.equal(winter.placed, 0);
  assert.equal(winter.candidates, 0);
});

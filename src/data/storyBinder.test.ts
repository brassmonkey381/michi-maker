import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickDiverse, planStoryBinder, seatingOrder, speciesKey, themeCandidates, type StoryCard, type ThemeScore } from './storyBinder.ts';
import { STORY_TEMPLATES, storyTheme } from './storyThemes.ts';

const WINTER = storyTheme('winter')!;
const SUMMER = storyTheme('summer')!;

/**
 * A card as the planner now receives it: already scored.
 *
 * IT USED TO CARRY TAGS. Scoring moved to the data project on 2026-09-11 so the tag corpus stops
 * being downloadable, and with it went rankedTags and scoreCard and the three tests that pinned
 * their arithmetic. Those rules are now asserted against the database by the migration's own
 * parity harness, which compared 400 scored cards for score, hits and qualify agreement. What is
 * left on this side is the filtering and the planning, which is what these tests exercise.
 */
function card(id: string, name: string, extra: Partial<StoryCard> = {}): StoryCard {
  return { id, name, rarity: 'Illustration Rare', illustrator: `ill-${id}`, ...extra };
}

/** A scored candidate, the shape score_cards_by_theme returns. `hits` is always a subset of want. */
function scored(c: StoryCard, score: number, hits: string[] = ['scene:snow']): ThemeScore {
  return { card: c, score, hits, qualifies: hits.length > 0 };
}

let n = 0;
const mkId = () => `id-${(n += 1)}`;

test('themeCandidates honours the pool and the rarity mode', () => {
  // The filtering the server cannot do, over rows it has already scored: the rarity rule reads a
  // printing's rarity string and has nothing to do with the tag data, and the pool is narrowed
  // again here because a caller may hold a tighter one than it asked with.
  const rows = [
    scored(card('a', 'Glaceon'), 2),
    scored(card('b', 'Snom', { rarity: 'Common' }), 1.5),
    scored(card('c', 'Frosmoth', { language: 'ja' }), 3),
  ];
  assert.deepEqual(themeCandidates(rows).map((s) => s.card.id), ['a']);
  assert.deepEqual(themeCandidates(rows, { rarity: 'all' }).map((s) => s.card.id), ['a', 'b']);
  assert.deepEqual(themeCandidates(rows, { rarity: 'all', pool: new Set(['b']) }).map((s) => s.card.id), ['b']);
});

test('themeCandidates sorts qualifiers first, then by score, ties by id', () => {
  // The planner depends on this order: pickDiverse walks it front to back, so a change here moves
  // which cards reach a spread. It is asserted separately because the sort is no longer a side
  // effect of scoring, it is the only ordering guarantee left on this side.
  const rows = [
    { card: card('z', 'Z'), score: 9, hits: [], qualifies: false },
    scored(card('b', 'B'), 1),
    scored(card('a', 'A'), 1),
    scored(card('c', 'C'), 5),
  ];
  assert.deepEqual(themeCandidates(rows, { rarity: 'all' }).map((s) => s.card.id), ['c', 'a', 'b', 'z']);
});

test('speciesKey strips decorations and reads the evolution line', () => {
  assert.equal(speciesKey({ id: '1', name: 'Umbreon ex', rarity: '' }), 'umbreon');
  assert.equal(speciesKey({ id: '2', name: 'Surfing Pikachu VMAX', rarity: '', evolutionLine: ['Pichu', 'Pikachu', 'Raichu'] }), 'pikachu');
  assert.equal(speciesKey({ id: '3', name: "Lillie's Clefairy ex", rarity: '' }), 'clefairy');
});

test('pickDiverse: one per species, two per illustrator, never a used card', () => {
  // Descending scores, so the order pickDiverse walks is the one the sort would have produced.
  const ranked = themeCandidates([
    scored(card('1', 'Glaceon'), 6),
    scored(card('2', 'Glaceon ex'), 5),
    scored(card('3', 'Snom', { illustrator: 'same' }), 4),
    scored(card('4', 'Frosmoth', { illustrator: 'same' }), 3),
    scored(card('5', 'Cubchoo', { illustrator: 'same' }), 2),
    scored(card('6', 'Beartic'), 1),
  ]);
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
  const seasons = STORY_TEMPLATES.find((t) => t.id === 'seasons')!;
  // One scored list per spread, which is what the server returns: twenty cards each, named for
  // their season so the "each spread's cards belong to its theme" assertion below still bites.
  const ranked = seasons.spreads.map((theme) =>
    Array.from({ length: 20 }, (_, i) => scored(card(`${theme.id}-${i}`, `${theme.id}mon ${i}`), 20 - i, [theme.want[0]])));
  const plan = planStoryBinder({ ranked, template: seasons, shape: { rows: 3, cols: 4 }, mkId });

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
  // Summer has two cards, winter none — a theme the server found nothing for.
  const ranked = [[scored(card('s1', 'Vaporeon'), 2, ['scene:beach']), scored(card('s2', 'Wailord'), 1, ['scene:ocean'])], []];
  const plan = planStoryBinder({ ranked, template: { id: 't', title: 'T', blurb: '', coverArt: ['x'], spreads: [SUMMER, WINTER] }, shape: { rows: 3, cols: 3 }, mkId });
  assert.equal(plan.pages.length, 5);
  const winter = plan.spreads.find((s) => s.theme.id === 'winter')!;
  assert.equal(winter.placed, 0);
  assert.equal(winter.candidates, 0);
});

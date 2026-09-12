import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_DECORATIONS_PER_SURFACE, normalizeCover } from './coverDecorations.ts';
import { planStoryBinder, type StoryCard, type ThemeScore } from './storyBinder.ts';
import { emptyCoverArtIds, planStoryCover } from './storyCover.ts';
import { STORY_TEMPLATES } from './storyThemes.ts';

let n = 0;
const mkId = () => `s-${(n += 1)}`;

const seasons = STORY_TEMPLATES.find((t) => t.id === 'seasons')!;

/** Twenty-four scored candidates per spread. Scored on the server since 2026-09-11, so the planner
 *  receives ThemeScore rows rather than tagged cards; see lib/themeScores. */
const ranked = (): ThemeScore[][] =>
  seasons.spreads.map((theme) =>
    Array.from({ length: 24 }, (_, i) => ({
      card: { id: `${theme.id}-${i}`, name: `${theme.id}mon ${i}`, rarity: 'Illustration Rare', illustrator: `ill-${i}` } as StoryCard,
      score: 24 - i,
      hits: [theme.want[0]],
      qualifies: true,
    })));
const build = (seed?: string) => planStoryBinder({ ranked: ranked(), template: seasons, shape: { rows: 3, cols: 4 }, mkId, seed });
const rhythm = (p: ReturnType<typeof build>) => p.spreads.map((s) => s.templateId).join('|');

test('a seed reproduces the same page rhythm; different seeds give different ones', () => {
  assert.equal(rhythm(build('ivy')), rhythm(build('ivy')));
  const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => rhythm(build(s))));
  assert.ok(seen.size >= 3, `eight seeds should not all march the same way (${seen.size} distinct)`);
  // No seed: the fixed rotation the planner always used.
  assert.equal(rhythm(build()), rhythm(build()));
});

test('a seeded plan is still a legal binder: no spread repeats the one before it, no overlaps', () => {
  for (const seed of ['one', 'two', 'three', 'four']) {
    const plan = build(seed);
    for (let i = 1; i < plan.spreads.length; i += 1) {
      const a = plan.spreads[i - 1].templateId;
      const b = plan.spreads[i].templateId;
      if (a && b) assert.notEqual(a, b, `${seed}: spread ${i} repeats ${a}`);
    }
    for (const p of plan.pages) {
      const taken = new Set<string>();
      for (const s of p.slots) {
        for (let r = s.row; r < s.row + s.rowSpan; r += 1) {
          for (let c = s.col; c < s.col + s.colSpan; c += 1) {
            const key = `${r},${c}`;
            assert.ok(!taken.has(key), `${seed}: overlap at ${key} on ${p.title}`);
            taken.add(key);
          }
        }
      }
    }
  }
});

test('a seeded cover takes one of several arrangements and every one respects the surface', () => {
  const plan = build('cover-seeds');
  const fronts = new Set<string>();
  const backs = new Set<string>();
  const colours = new Set<string>();
  for (let i = 0; i < 16; i += 1) {
    const seed = `variant-${i}`;
    const { cover, artJobs } = planStoryCover({ template: seasons, plan, author: '@someone', date: new Date(2026, 8, 6), rarity: 'illustration', source: 'catalog', artPlaced: 6, mkId, seed });
    colours.add(cover.colourway);
    for (const key of ['front', 'frontInside', 'backInside', 'back'] as const) {
      const list = cover.surfaces?.[key] ?? [];
      assert.ok(list.length > 0 && list.length <= MAX_DECORATIONS_PER_SURFACE, `${seed} ${key}: ${list.length} layers`);
      for (const d of list) assert.ok(d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1, `${seed} ${key} ${d.name} on the surface`);
    }
    // Placeholders and jobs still pair one to one, and the renderer's normaliser keeps the text.
    assert.deepEqual(new Set(emptyCoverArtIds(cover)), new Set(artJobs.map((j) => j.id)));
    const kept = normalizeCover(cover);
    assert.ok((kept.surfaces?.front ?? []).some((d) => d.kind === 'text'), `${seed}: front keeps its title`);
    // The front's arrangement is told by where the title sits relative to the picture.
    const front = cover.surfaces!.front!;
    const title = front.find((d) => d.name === 'Title')!;
    const pic = front.find((d) => d.name === 'Cover picture')!;
    fronts.add(`${title.y < pic.y ? 'title-first' : 'picture-first'}:${(title as { align?: string }).align}`);
    backs.add((cover.surfaces!.back ?? []).map((d) => d.name).join(','));
  }
  assert.ok(fronts.size >= 2, `front arrangements vary (${[...fronts].join(' / ')})`);
  assert.ok(backs.size >= 2, 'back arrangements vary');
  assert.ok(colours.size >= 2, 'colourways vary');
  // Same seed, same cover.
  const a = planStoryCover({ template: seasons, plan, author: '', date: new Date(2026, 8, 6), rarity: 'all', source: 'catalog', artPlaced: 0, mkId: () => 'x', seed: 'same' });
  const b = planStoryCover({ template: seasons, plan, author: '', date: new Date(2026, 8, 6), rarity: 'all', source: 'catalog', artPlaced: 0, mkId: () => 'x', seed: 'same' });
  assert.deepEqual(a.cover, b.cover);
});

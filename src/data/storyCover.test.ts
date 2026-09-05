import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_DECORATIONS_PER_SURFACE, normalizeCover } from './coverDecorations.ts';
import { planStoryBinder, type StoryCard } from './storyBinder.ts';
import { applyCoverArt, dropCoverArt, emptyCoverArtIds, estimateLines, planStoryCover } from './storyCover.ts';
import { STORY_TEMPLATES } from './storyThemes.ts';

let n = 0;
const mkId = () => `c-${(n += 1)}`;

function cards(): StoryCard[] {
  const out: StoryCard[] = [];
  const tags: Record<string, string> = { forest: 'scene:forest', water: 'scene:ocean', mountain: 'scene:mountain', town: 'scene:town', indoors: 'flag:indoor', heat: 'scene:desert' };
  for (const [k, tag] of Object.entries(tags)) for (let i = 0; i < 16; i += 1) out.push({ id: `${k}-${i}`, name: `${k}mon ${i}`, rarity: 'Illustration Rare', sceneTags: [tag.split(':')[1], tag] });
  return out;
}

function planFor(templateId: string) {
  const template = STORY_TEMPLATES.find((t) => t.id === templateId)!;
  const plan = planStoryBinder({ cards: cards(), template, shape: { rows: 3, cols: 4 }, mkId });
  return { template, plan };
}

test('estimateLines wraps on words and counts paragraphs', () => {
  assert.equal(estimateLines('Inside', 'marker', 0.046, 0.56, 0.03), 1);
  assert.equal(estimateLines('a\nb\nc', 'marker', 0.046, 0.56, 0.03), 3);
  assert.ok(estimateLines('a fairly long sentence that must wrap onto several lines in a narrow box', 'sans', 0.05, 0.4, 0.02) >= 3);
});

test('planStoryCover: four surfaces, within the layer cap, and every placeholder has a job', () => {
  const { template, plan } = planFor('habitats'); // six themes — the crowded case
  const { cover, artJobs } = planStoryCover({ template, plan, author: '@brian', date: new Date(2026, 8, 5), rarity: 'illustration', source: 'catalog', artPlaced: 15, mkId });
  assert.equal(cover.modelId, 'vaultx-exotec-zip-12-xl');
  assert.equal(cover.colourway, 'ocean-blue');
  assert.equal(cover.showCover, true);
  for (const key of ['front', 'frontInside', 'backInside', 'back'] as const) {
    const list = cover.surfaces?.[key] ?? [];
    assert.ok(list.length > 0, `${key} has decorations`);
    assert.ok(list.length <= MAX_DECORATIONS_PER_SURFACE, `${key} within the cap (${list.length})`);
    for (const d of list) {
      assert.ok(d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1, `${d.name} on the surface`);
    }
  }
  // Placeholders ↔ jobs, one to one.
  const empties = emptyCoverArtIds(cover);
  assert.deepEqual(new Set(empties), new Set(artJobs.map((j) => j.id)));
  assert.ok(artJobs.some((j) => j.surface === 'front') && artJobs.some((j) => j.surface === 'back'));
  assert.equal(artJobs.filter((j) => j.surface === 'frontInside').length, template.spreads.length);
  // Text content carries the story.
  const texts = Object.values(cover.surfaces ?? {}).flat().filter((d) => d.kind === 'text') as { text: string }[];
  const all = texts.map((t) => t.text).join('\n');
  assert.match(all, /Habitats/);
  assert.match(all, /Created by @brian · 5 September 2026/);
  assert.match(all, /1\. Into the woods[\s\S]*6\. Heat/);
  assert.match(all, /13 pages · 6 spreads/);
  assert.match(all, /michi-maker\.com/);
  // The back fans the hero cards.
  const heroes = (cover.surfaces?.back ?? []).filter((d) => d.kind === 'art' && 'cardId' in d && d.cardId);
  assert.equal(heroes.length, Math.min(3, plan.heroCardIds.length));
});

test('applyCoverArt fills a placeholder; dropCoverArt removes it and its caption; normalizeCover keeps the rest', () => {
  const { template, plan } = planFor('seasons');
  const { cover, artJobs } = planStoryCover({ template, plan, author: '', date: new Date(2026, 0, 1), rarity: 'all', source: 'collection', artPlaced: 0, mkId });
  const front = artJobs.find((j) => j.surface === 'front')!;
  const filled = applyCoverArt(cover, front.id, { imageUrl: 'https://x/binder-art/a.jpg', crop: { x: 0, y: 0.1, w: 1, h: 0.8 }, attribution: { sourceName: 'Pexels', origin: 'external' } });
  const d = filled.surfaces!.front!.find((x) => x.id === front.id)!;
  assert.equal(d.kind, 'art');
  assert.equal((d as { imageUrl?: string }).imageUrl, 'https://x/binder-art/a.jpg');

  const thumb = artJobs.find((j) => j.surface === 'frontInside')!;
  const before = filled.surfaces!.frontInside!.length;
  const dropped = dropCoverArt(filled, thumb.id);
  assert.equal(dropped.surfaces!.frontInside!.length, before - 2, 'picture and its caption both gone');

  // Whatever is still a placeholder is dropped by the store's normaliser — never persisted.
  let final = dropped;
  for (const id of emptyCoverArtIds(final)) final = dropCoverArt(final, id);
  const normalized = normalizeCover(final);
  assert.ok(normalized);
  assert.equal(emptyCoverArtIds(normalized!).length, 0);
  const texts = Object.values(normalized!.surfaces ?? {}).flat().filter((x) => x.kind === 'text').length;
  const textsBefore = Object.values(final.surfaces ?? {}).flat().filter((x) => x.kind === 'text').length;
  assert.equal(texts, textsBefore, 'the normaliser keeps every text decoration we wrote');
});

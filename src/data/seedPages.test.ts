import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_SEED, SEED_ART_CELL, SEED_BY_CODE, SEED_SETS, seedArtDone, seedArtSlot, seedCount, seedPages, seedSetFor } from './seedPages.ts';

test('every seed set is three distinct real-looking ids under one theme name', () => {
  for (const [key, set] of Object.entries(SEED_SETS)) {
    assert.equal(set.cardIds.length, 3, key);
    assert.equal(new Set(set.cardIds).size, 3, key);
    for (const id of set.cardIds) assert.match(id, /^\d+$/, `${key}: ${id}`);
    assert.equal(set.theme, key);
    assert.match(set.picture.url, /^https:\/\/piikwvntldytjejxmcla\.supabase\.co\/storage\/v1\/object\/public\/binder-art\//, key);
    assert.ok(set.picture.artist && set.picture.sourceUrl.startsWith('https://'), key);
  }
});

test('every ad code maps to a set that exists, and the default does too', () => {
  for (const [code, theme] of Object.entries(SEED_BY_CODE)) assert.ok(SEED_SETS[theme], `${code} -> ${theme}`);
  assert.ok(SEED_SETS[DEFAULT_SEED]);
});

test('seedSetFor: the code picks the theme, case and spaces forgiven; unknown or missing is the default', () => {
  assert.equal(seedSetFor('rd_rainbow_image').theme, 'autumn');
  assert.equal(seedSetFor(' RD_LIDI_VIDEO ').theme, 'volcano');
  assert.equal(seedSetFor('rd_coverflow_4x5').theme, 'pikachu');
  assert.equal(seedSetFor('oakland_cardshow').theme, DEFAULT_SEED);
  assert.equal(seedSetFor(undefined).theme, DEFAULT_SEED);
  assert.equal(seedSetFor(null).theme, DEFAULT_SEED);
  assert.equal(seedSetFor('').theme, DEFAULT_SEED);
});

test('seedPages: one 3x3 page, the three seeds in pockets 1 to 3, the picture in pocket 4, five empties left for Complete', () => {
  const pages = seedPages(SEED_SETS.volcano);
  assert.equal(pages.length, 1);
  const [page] = pages;
  assert.equal(page.rows, 3);
  assert.equal(page.cols, 3);
  assert.deepEqual(
    page.slots.filter((s) => s.type === 'card').map((s) => [s.row, s.col, s.cardId]),
    [
      [0, 0, '523867'],
      [0, 1, '676035'],
      [0, 2, '523880'],
    ],
  );
  const art = seedArtSlot(page);
  assert.ok(art);
  assert.equal(art.type, 'artwork');
  assert.deepEqual([art.row, art.col, art.rowSpan, art.colSpan], [SEED_ART_CELL.row, SEED_ART_CELL.col, 1, 1]);
  assert.equal(art.imageUrl, SEED_SETS.volcano.picture.url);
  assert.equal(art.attribution?.sourceName, 'Pexels');
  assert.equal(art.attribution?.origin, undefined);
  assert.equal(seedCount(pages), 3, 'the picture is not a card.add');
});

test('seedArtDone: two pockets wide or more passes, so does removing the picture; one wide does not', () => {
  const [page] = seedPages(SEED_SETS.autumn);
  assert.equal(seedArtDone(page), false);
  const art = seedArtSlot(page)!;
  assert.equal(seedArtDone({ slots: page.slots.map((s) => (s.id === art.id ? { ...s, colSpan: 2 } : s)) }), true);
  assert.equal(seedArtDone({ slots: page.slots.map((s) => (s.id === art.id ? { ...s, colSpan: 3 } : s)) }), true);
  assert.equal(seedArtDone({ slots: page.slots.filter((s) => s.id !== art.id) }), true);
  assert.equal(seedArtDone({ slots: [...page.slots, { ...art, id: 'x', row: 2, imageUrl: 'https://example.com/other.jpg' }] }), false);
});

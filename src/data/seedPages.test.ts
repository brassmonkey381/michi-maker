import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_SEED, SEED_BY_CODE, SEED_SETS, seedCount, seedPages, seedSetFor } from './seedPages.ts';

test('every seed set is three distinct real-looking ids under one theme name', () => {
  for (const [key, set] of Object.entries(SEED_SETS)) {
    assert.equal(set.cardIds.length, 3, key);
    assert.equal(new Set(set.cardIds).size, 3, key);
    for (const id of set.cardIds) assert.match(id, /^\d+$/, `${key}: ${id}`);
    assert.equal(set.theme, key);
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

test('seedPages: one 3x3 page, the three seeds in pockets 1 to 3, six empties left for Complete', () => {
  const pages = seedPages(SEED_SETS.volcano);
  assert.equal(pages.length, 1);
  const [page] = pages;
  assert.equal(page.rows, 3);
  assert.equal(page.cols, 3);
  assert.deepEqual(
    page.slots.map((s) => [s.row, s.col, s.cardId]),
    [
      [0, 0, '523867'],
      [0, 1, '676035'],
      [0, 2, '523880'],
    ],
  );
  assert.equal(seedCount(pages), 3);
});

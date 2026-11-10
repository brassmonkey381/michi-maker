/** Which edge a side-load pocket opens on (binderPhysics.pocketOpening, MIC-017 sleeves). Run: `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pocketOpening } from './binderPhysics.ts';

const row = (cols: number, side: 'left' | 'right') => Array.from({ length: cols }, (_, c) => pocketOpening(cols, side, c));

test('3x3: the pair furthest from the spine opens on its shared edge; the spine pocket opens away from the spine', () => {
  assert.deepEqual(row(3, 'right'), ['right', 'right', 'left']);
  assert.deepEqual(row(3, 'left'), ['right', 'left', 'left']);
});

test('2x2 and 4x4: every pocket is in a pair, the same on both sides of the spine', () => {
  assert.deepEqual(row(2, 'right'), ['right', 'left']);
  assert.deepEqual(row(2, 'left'), ['right', 'left']);
  assert.deepEqual(row(4, 'right'), ['right', 'left', 'right', 'left']);
  assert.deepEqual(row(4, 'left'), ['right', 'left', 'right', 'left']);
});

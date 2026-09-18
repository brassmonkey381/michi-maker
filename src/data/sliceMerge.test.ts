/**
 * Merge and split are inverses on the page, and a merge that would show a seam is refused. The
 * continuity rule is the one worth guarding: it is what separates "the two halves of one slicing"
 * from "two singles of the same picture that happen to sit next to each other".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DemoSlot } from './binderTypes.ts';
import { canSplitSlice, mergeSlices, splitSlice } from './sliceMerge.ts';

const art = (over: Partial<DemoSlot>): DemoSlot => ({
  id: 'a',
  row: 0,
  col: 0,
  rowSpan: 1,
  colSpan: 1,
  type: 'artwork',
  imageUrl: 'https://x/pic.png',
  imageCrop: { x: 0, y: 0, w: 0.5, h: 1 },
  ...over,
});

const left = art({ id: 'L', col: 0, imageCrop: { x: 0, y: 0, w: 0.5, h: 1 } });
const right = art({ id: 'R', col: 1, imageCrop: { x: 0.5, y: 0, w: 0.5, h: 1 } });

test('two abutting halves merge into one 1x2 with the union window, whichever is named first', () => {
  for (const [a, b] of [
    [left, right],
    [right, left],
  ]) {
    const r = mergeSlices(a, b);
    assert.ok('merged' in r);
    assert.equal(r.merged.id, 'L');
    assert.equal(r.removedId, 'R');
    assert.equal(r.merged.colSpan, 2);
    assert.equal(r.merged.rowSpan, 1);
    assert.deepEqual(r.merged.imageCrop, { x: 0, y: 0, w: 1, h: 1 });
  }
});

test('stacked halves merge into a 2x1', () => {
  const top = art({ id: 'T', row: 0, imageCrop: { x: 0, y: 0, w: 1, h: 0.5 } });
  const bottom = art({ id: 'B', row: 1, imageCrop: { x: 0, y: 0.5, w: 1, h: 0.5 } });
  const r = mergeSlices(bottom, top);
  assert.ok('merged' in r);
  assert.equal(r.merged.id, 'T');
  assert.equal(r.merged.rowSpan, 2);
  assert.deepEqual(r.merged.imageCrop, { x: 0, y: 0, w: 1, h: 1 });
});

test('two singles of the same picture framed separately are refused: their windows do not abut', () => {
  const other = art({ id: 'R', col: 1, imageCrop: { x: 0.4, y: 0.1, w: 0.5, h: 0.8 } });
  assert.deepEqual(mergeSlices(left, other), { refused: 'not-continuous' });
});

test('the other refusals, in the order they are checked', () => {
  assert.deepEqual(mergeSlices(left, { ...right, type: 'card', cardId: 'c', imageUrl: undefined }), { refused: 'not-art' });
  assert.deepEqual(mergeSlices(left, { ...right, imageUrl: 'https://x/other.png' }), { refused: 'different-image' });
  assert.deepEqual(mergeSlices(left, { ...right, imageTransform: { rot: 90 } }), { refused: 'different-transform' });
  assert.deepEqual(mergeSlices(left, { ...right, col: 2 }), { refused: 'not-adjacent' });
  // Same row, but a different height: not a clean pair.
  assert.deepEqual(mergeSlices(left, { ...right, rowSpan: 2 }), { refused: 'not-adjacent' });
});

test('split gives back the pieces, and merging them gives back the piece', () => {
  const merged = mergeSlices(left, right);
  assert.ok('merged' in merged);
  let n = 0;
  const pieces = splitSlice(merged.merged, () => `new-${(n += 1)}`);
  assert.ok(pieces);
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].id, 'L');
  assert.equal(pieces[1].id, 'new-1');
  assert.deepEqual(pieces.map((p) => [p.row, p.col, p.rowSpan, p.colSpan]), [[0, 0, 1, 1], [0, 1, 1, 1]]);
  assert.deepEqual(pieces[0].imageCrop, left.imageCrop);
  assert.deepEqual(pieces[1].imageCrop, right.imageCrop);
  const again = mergeSlices(pieces[0], pieces[1]);
  assert.ok('merged' in again);
  assert.deepEqual(again.merged, merged.merged);
});

test('a 2x2 splits into four cells that each show their quarter', () => {
  const big = art({ id: 'Q', rowSpan: 2, colSpan: 2, imageCrop: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 } });
  const pieces = splitSlice(big, () => 'n');
  assert.ok(pieces);
  assert.equal(pieces.length, 4);
  assert.deepEqual(pieces[3].imageCrop, { x: 0.5, y: 0.5, w: 0.3, h: 0.3 });
});

test('nothing to split: a single cell, or a card', () => {
  assert.equal(splitSlice(left, () => 'n'), null);
  assert.equal(canSplitSlice(left), false);
  assert.equal(canSplitSlice(art({ rowSpan: 1, colSpan: 2 })), true);
  assert.equal(canSplitSlice({ ...left, type: 'card', cardId: 'c', colSpan: 2 }), false);
});

test('a whole-image pocket beside another cannot join: no window abuts a whole', () => {
  const whole = art({ id: 'W', col: 1, imageCrop: undefined });
  assert.deepEqual(mergeSlices(art({ imageCrop: undefined }), whole), { refused: 'not-continuous' });
});

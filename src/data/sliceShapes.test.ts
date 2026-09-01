/**
 * The picker's two invariants, which are the kind that break silently: a chip row that shows no
 * active shape looks like nothing is selected, and a default you cannot get back to looks like a
 * setting that stuck.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMON_SLICE_SHAPES,
  OTHER_SLICE_SHAPES,
  hasMoreSliceShapes,
  shapeLabel,
  visibleSliceShapes,
} from './sliceShapes.ts';

const key = (s: { rows: number; cols: number }) => `${s.cols}x${s.rows}`;
const keys = (list: { rows: number; cols: number }[]) => list.map(key);

test('the short row is the common five, in the order they were asked for', () => {
  const page = { rows: 3, cols: 3 };
  assert.deepEqual(keys(visibleSliceShapes(page, page, false)), ['3x3', '3x4', '1x2', '2x2', '1x1']);
});

test('labels read columns × rows, the way a page size is spoken', () => {
  assert.equal(shapeLabel({ rows: 4, cols: 3 }), '3×4');
  assert.equal(shapeLabel({ rows: 2, cols: 1 }), '1×2');
});

test('the shape you are cutting into is always shown, common or not', () => {
  // Otherwise the row draws no active chip and reads as "nothing selected" while the canvas is
  // plainly cut into something.
  const current = { rows: 3, cols: 2 }; // "2×3" — not one of the common five
  const shown = visibleSliceShapes(current, { rows: 3, cols: 3 }, false);
  assert.ok(shown.some((s) => s.rows === 3 && s.cols === 2), keys(shown).join(','));
});

test('the page you came from is always shown, so the default is always reachable', () => {
  const page = { rows: 5, cols: 4 }; // a page shape no preset anticipates
  const shown = visibleSliceShapes({ rows: 1, cols: 1 }, page, false);
  assert.ok(shown.some((s) => s.rows === 5 && s.cols === 4), keys(shown).join(','));
});

test('an unusual page shape survives the expanded list too', () => {
  const page = { rows: 6, cols: 2 };
  const all = visibleSliceShapes(page, page, true);
  assert.ok(all.some((s) => s.rows === 6 && s.cols === 2));
});

test('nothing is listed twice when the current and the page agree, and both are common', () => {
  const page = { rows: 2, cols: 2 };
  const shown = visibleSliceShapes(page, page, false);
  assert.equal(new Set(keys(shown)).size, shown.length);
  assert.equal(shown.length, COMMON_SLICE_SHAPES.length);
});

test('nor when the current and the page agree and are both unusual', () => {
  const odd = { rows: 6, cols: 6 };
  const shown = visibleSliceShapes(odd, odd, false);
  assert.equal(new Set(keys(shown)).size, shown.length);
  assert.equal(shown.length, COMMON_SLICE_SHAPES.length + 1);
});

test('expanded shows every shape there is', () => {
  const page = { rows: 3, cols: 3 };
  const all = visibleSliceShapes(page, page, true);
  assert.equal(all.length, COMMON_SLICE_SHAPES.length + OTHER_SLICE_SHAPES.length);
  for (const s of [...COMMON_SLICE_SHAPES, ...OTHER_SLICE_SHAPES]) {
    assert.ok(all.some((v) => v.rows === s.rows && v.cols === s.cols), key(s));
  }
});

test('the common and the rest do not overlap', () => {
  for (const s of OTHER_SLICE_SHAPES) {
    assert.equal(
      COMMON_SLICE_SHAPES.some((c) => c.rows === s.rows && c.cols === s.cols),
      false,
      `${key(s)} is in both lists`,
    );
  }
});

test('"more" is only offered when there is more', () => {
  const page = { rows: 3, cols: 3 };
  assert.equal(hasMoreSliceShapes(page, page), true);
});

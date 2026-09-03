/**
 * The shape on a binder tile is read at a glance and compared across a shelf, so it has to say
 * the same thing the page-size picker says (rows first) and admit when a binder is not one shape.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { binderMetaLine, binderShapeLabel } from './binderShape.ts';

const pages = (...shapes: [number, number][]) => shapes.map(([rows, cols]) => ({ rows, cols }));

test('a uniform binder is named rows×cols, the way the size picker names it', () => {
  assert.equal(binderShapeLabel(pages([3, 4], [3, 4], [3, 4])), '3×4');
  assert.equal(binderShapeLabel(pages([3, 3])), '3×3');
  assert.equal(binderShapeLabel(pages([4, 3])), '4×3');
});

test('a binder whose pages differ says so rather than naming the first page', () => {
  assert.equal(binderShapeLabel(pages([3, 3], [3, 4])), 'mixed');
});

test('a binder with no pages has no shape', () => {
  assert.equal(binderShapeLabel([]), '');
});

test('the meta line leads with the shape and keeps the count grammatical', () => {
  assert.equal(binderMetaLine(pages([3, 4], [3, 4])), '3×4 · 2 pages');
  assert.equal(binderMetaLine(pages([2, 2])), '2×2 · 1 page');
  assert.equal(binderMetaLine(pages([3, 3], [4, 4])), 'mixed · 2 pages');
  assert.equal(binderMetaLine([]), '0 pages');
});

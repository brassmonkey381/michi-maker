/**
 * The shape rule decides which binder every group lands in, and it runs against detection boxes
 * from photographs of cards on a table, which are never square to the camera. These cover the
 * ways that goes wrong: a tilted row splitting in two, a gap in a row inventing a column, and a
 * group that genuinely does not fit any page being reported as fitting one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitPage, fitPageAllowingRotation, placeOnPage, toGrid } from './pageFit.mjs';

/** A card box of nominal size at (col, row), with optional pixel jitter. */
const card = (col, row, dx = 0, dy = 0) => ({
  xmin: col * 100 + dx,
  xmax: col * 100 + 90 + dx,
  ymin: row * 140 + dy,
  ymax: row * 140 + 130 + dy,
});

test('a single row of three reads as 1x3, left to right', () => {
  // Handed to the grid out of order, as a detector returns them.
  const g = toGrid([card(2, 0), card(0, 0), card(1, 0)]);
  assert.equal(g.rows, 1);
  assert.equal(g.cols, 3);
  assert.deepEqual(g.grid, [[1, 2, 0]], 'indices ordered by x, not by input order');
});

test('two rows of three read as 2x3', () => {
  const g = toGrid([card(0, 0), card(1, 0), card(2, 0), card(0, 1), card(1, 1), card(2, 1)]);
  assert.equal(g.rows, 2);
  assert.equal(g.cols, 3);
});

test('a tilted row stays one row', () => {
  // Cards laid by hand drift downward across a row. Comparing each card to the row's running
  // mean holds it together; comparing to the first card alone would split it.
  const g = toGrid([card(0, 0, 0, 0), card(1, 0, 0, 22), card(2, 0, 0, 44), card(3, 0, 0, 66)]);
  assert.equal(g.rows, 1, 'a drifting row is still a row');
  assert.equal(g.cols, 4);
});

test('a genuine second row is not absorbed into the first', () => {
  const g = toGrid([card(0, 0), card(1, 0), card(0, 1), card(1, 1)]);
  assert.equal(g.rows, 2);
});

test('a gap in a row does not invent a column', () => {
  // Two cards with a space between them are two cards, not three.
  const g = toGrid([card(0, 0), card(3, 0)]);
  assert.equal(g.rows, 1);
  assert.equal(g.cols, 2);
});

test('the smallest page that fits both dimensions wins', () => {
  assert.equal(fitPage(1, 1).label, '2x2');
  assert.equal(fitPage(2, 2).label, '2x2');
  // The owner's worked example: 2x3 cannot go on 2x2, so it takes 3x3 with a row spare.
  assert.equal(fitPage(2, 3).label, '3x3');
  assert.equal(fitPage(3, 3).label, '3x3');
  assert.equal(fitPage(1, 4).label, '3x4');
  assert.equal(fitPage(3, 4).label, '3x4');
  assert.equal(fitPage(4, 4).label, '4x4');
  assert.equal(fitPage(4, 2).label, '4x4', 'four rows needs the tall page even when narrow');
});

test('a shape no page can hold reports null rather than being squeezed', () => {
  // The widest page is four columns. A five-card line has no home, and wrapping it would break
  // the very thing the group exists to show.
  assert.equal(fitPage(1, 5), null);
  assert.equal(fitPage(1, 7), null);
  assert.equal(fitPage(5, 1), null);
});

test('rotation is reported, never applied silently', () => {
  assert.deepEqual(fitPageAllowingRotation(2, 3), { page: PAGE('3x3'), rotated: false });
  const tall = fitPageAllowingRotation(5, 1);
  assert.equal(tall.page, null, 'a 5-tall column does not fit turned either');
  const wide = fitPageAllowingRotation(1, 5);
  assert.equal(wide.page, null);
});

function PAGE(label) {
  return { label, rows: Number(label[0]), cols: Number(label[2]) };
}

test('placement starts top-left and keeps the reading order', () => {
  const g = toGrid([card(0, 0), card(1, 0), card(2, 0), card(0, 1), card(1, 1)]);
  const page = fitPage(g.rows, g.cols);
  assert.equal(page.label, '3x3');
  const cells = placeOnPage(g.grid, page);
  assert.equal(cells.length, 5, 'every card is placed');
  assert.deepEqual(cells[0], { boxIndex: 0, row: 0, col: 0 });
  // The second row starts at column 0 again, left aligned, with the spare column left empty.
  const secondRow = cells.filter((c) => c.row === 1).map((c) => c.col);
  assert.deepEqual(secondRow, [0, 1]);
});

test('the real group sizes in the gallery all have a home once shaped', () => {
  // From stage 1: sizes 1,2,3,4,5,6,7,9,11 occur. As a single row most are homeless; shaped,
  // the plausible layouts all fit. This is the argument for detecting shape at all.
  assert.equal(fitPage(1, 6), null, '6 in a line does not fit');
  assert.equal(fitPage(2, 3).label, '3x3', '6 as two rows of three does');
  assert.equal(fitPage(3, 3).label, '3x3', '9 as three rows of three does');
  assert.equal(fitPage(3, 4).label, '3x4', '11 as three rows of four does');
  assert.equal(fitPage(2, 4).label, '3x4', '7 as four over three does');
});

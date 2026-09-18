/**
 * The page may hold any shape of art; the fill sheet cuts it into what a side-load pocket takes,
 * and the owner is told which pieces that touches before printing. These pin the cut walk and
 * the wording, since a wrong "row, column" sends someone looking at the wrong pocket.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DemoSlot } from './binderTypes.ts';
import { cutPieces, printCutWarningText, printCutWarnings } from './printFit.ts';

const art = (over: Partial<DemoSlot>): DemoSlot => ({
  id: 'a',
  row: 0,
  col: 0,
  rowSpan: 1,
  colSpan: 1,
  type: 'artwork',
  imageUrl: 'https://x/pic.png',
  ...over,
});

test('a single and a fold on a pair are one piece each', () => {
  assert.deepEqual(cutPieces({ col: 0, rowSpan: 1, colSpan: 1 }, [1]), [{ i: 0, j: 0, w: 1 }]);
  assert.deepEqual(cutPieces({ col: 1, rowSpan: 1, colSpan: 2 }, [1]), [{ i: 0, j: 0, w: 2 }]);
});

test('a fold off the pair is two singles: it cannot be slid into pockets that open on different edges', () => {
  assert.deepEqual(cutPieces({ col: 0, rowSpan: 1, colSpan: 2 }, [1]), [
    { i: 0, j: 0, w: 1 },
    { i: 0, j: 1, w: 1 },
  ]);
});

test('a tall piece is walked row by row, with a fold wherever a row covers a pair', () => {
  // 2×3 on a 3-column right page (pair at columns 2–3): each row is a single then a fold.
  assert.deepEqual(cutPieces({ col: 0, rowSpan: 2, colSpan: 3 }, [1]), [
    { i: 0, j: 0, w: 1 },
    { i: 0, j: 1, w: 2 },
    { i: 1, j: 0, w: 1 },
    { i: 1, j: 1, w: 2 },
  ]);
});

test('warnings name the page, pocket and shape, 1-based, and skip what fits', () => {
  const binder = {
    pages: [
      // Page 1 is a right page: the pair is columns 2–3 (starts at 1).
      { id: 'p1', rows: 3, cols: 3, slots: [art({ id: 'ok', row: 0, col: 1, colSpan: 2 }), art({ id: 'bad', row: 2, col: 0, colSpan: 2 })] },
      // Page 2 is a left page: the pair starts at 0, so this fold fits; the 2×2 does not.
      { id: 'p2', rows: 3, cols: 3, slots: [art({ id: 'ok2', row: 0, col: 0, colSpan: 2 }), art({ id: 'sq', row: 1, col: 1, rowSpan: 2, colSpan: 2 })] },
    ],
  };
  const w = printCutWarnings(binder as never);
  assert.deepEqual(w, [
    { page: 1, row: 3, col: 1, shape: '1×2', folds: 0, singles: 2 },
    { page: 2, row: 2, col: 2, shape: '2×2', folds: 0, singles: 4 },
  ]);
  assert.equal(
    printCutWarningText(w[0]),
    'The 1×2 art piece on page 1, row 3, column 1 would not fit a real binder as one piece. It will be cut into 2 1×1 pieces.',
  );
  assert.equal(
    printCutWarningText({ page: 3, row: 1, col: 1, shape: '2×3', folds: 2, singles: 2 }),
    'The 2×3 art piece on page 3, row 1, column 1 would not fit a real binder as one piece. It will be cut into 2 folded 1×2 pieces and 2 1×1 pieces.',
  );
});

test('a binder whose art all fits has nothing to warn about', () => {
  const binder = { pages: [{ id: 'p', rows: 3, cols: 3, slots: [art({ row: 0, col: 1, colSpan: 2 }), art({ id: 'b', row: 1, col: 0 })] }] };
  assert.deepEqual(printCutWarnings(binder as never), []);
});

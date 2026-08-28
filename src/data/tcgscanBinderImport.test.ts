/**
 * The paper binder must survive the trip: page numbers, pocket coordinates, the gaps, and the
 * pages that hold nothing at all. Each test below is one way that fidelity can quietly break.
 *
 * Run with `npm test` (node --test over src/**\/*.test.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSUMED_COLS,
  ASSUMED_ROWS,
  rebuildTcgscanBinder,
  unplacedCount,
  type TcgscanBinder,
  type TcgscanPocket,
} from './tcgscanBinderImport.ts';

const CAP = 100; // a page cap well out of the way, except where a test is about the cap

function pocket(over: Partial<TcgscanPocket> & { cardId: string }): TcgscanPocket {
  return { page: 1, pos: 0, rows: null, cols: null, scannedAt: null, entryId: over.cardId, ...over };
}

function binder(over: Partial<TcgscanBinder> = {}): TcgscanBinder {
  return {
    id: 'unit-1',
    collectionId: 'col-1',
    name: 'Binder 1',
    rows: 3,
    cols: 4,
    pageCount: null,
    entries: [],
    ...over,
  };
}

test('a pocket index becomes the row and column it came from', () => {
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'a', page: 1, pos: 0 }), // first pocket
        pocket({ cardId: 'b', page: 1, pos: 5 }), // second row, second column (5 = 1*4 + 1)
        pocket({ cardId: 'c', page: 1, pos: 11 }), // last pocket of a 3 x 4 page
      ],
    }),
    CAP,
  );
  const at = (cardId: string) => {
    const s = r.pages[0].slots.find((x) => x.cardId === cardId);
    return s ? [s.row, s.col] : null;
  };
  assert.deepEqual(at('a'), [0, 0]);
  assert.deepEqual(at('b'), [1, 1]);
  assert.deepEqual(at('c'), [2, 3]);
  assert.equal(r.placed, 3);
});

test('every page keeps its number, including the ones holding nothing', () => {
  const r = rebuildTcgscanBinder(
    binder({ entries: [pocket({ cardId: 'a', page: 4, pos: 2 })] }),
    CAP,
  );
  assert.equal(r.pages.length, 4);
  assert.equal(r.pages[0].slots.length, 0);
  assert.equal(r.pages[1].slots.length, 0);
  assert.equal(r.pages[2].slots.length, 0);
  // Page 4 in the binder is page 4 here, not "the only page with cards".
  assert.equal(r.pages[3].slots[0].cardId, 'a');
});

test('page_count carries a tail page whose cards were all discarded', () => {
  // The defect 20260828150000 closes: the entries only reach page 2, the binder reaches page 6.
  const r = rebuildTcgscanBinder(
    binder({ pageCount: 6, entries: [pocket({ cardId: 'a', page: 2, pos: 0 })] }),
    CAP,
  );
  assert.equal(r.pages.length, 6);
});

test('page_count never pulls the binder back over pages that hold cards', () => {
  const r = rebuildTcgscanBinder(
    binder({ pageCount: 2, entries: [pocket({ cardId: 'a', page: 5, pos: 0 })] }),
    CAP,
  );
  assert.equal(r.pages.length, 5);
});

test('an empty binder still gets one page', () => {
  const r = rebuildTcgscanBinder(binder(), CAP);
  assert.equal(r.pages.length, 1);
  assert.equal(r.placed, 0);
});

test('two entries claiming one pocket: the earlier scan wins, the other is reported', () => {
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'late', page: 1, pos: 3, scannedAt: '2026-08-02T00:00:00Z', entryId: 'e2' }),
        pocket({ cardId: 'early', page: 1, pos: 3, scannedAt: '2026-08-01T00:00:00Z', entryId: 'e1' }),
      ],
    }),
    CAP,
  );
  assert.equal(r.pages[0].slots.length, 1);
  assert.equal(r.pages[0].slots[0].cardId, 'early');
  assert.equal(r.collided, 1);
});

test('a pocket collision is broken by entry id when neither was scanned', () => {
  const both = (ids: string[]) =>
    rebuildTcgscanBinder(
      binder({
        entries: ids.map((entryId) => pocket({ cardId: entryId, page: 1, pos: 0, entryId })),
      }),
      CAP,
    ).pages[0].slots[0].cardId;
  // Same answer whichever order the rows arrive in - the result is stable, not arbitrary.
  assert.equal(both(['b', 'a']), 'a');
  assert.equal(both(['a', 'b']), 'a');
});

test('an entry with no camera moment sorts before one that has it', () => {
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'stamped', page: 1, pos: 0, scannedAt: '2020-01-01T00:00:00Z', entryId: 'e1' }),
        pocket({ cardId: 'unstamped', page: 1, pos: 0, scannedAt: null, entryId: 'e2' }),
      ],
    }),
    CAP,
  );
  assert.equal(r.pages[0].slots[0].cardId, 'stamped');
  assert.equal(r.collided, 1);
});

test('a pocket outside the page shape is left out rather than wrapped onto the next row', () => {
  const r = rebuildTcgscanBinder(
    binder({ rows: 3, cols: 3, entries: [pocket({ cardId: 'a', page: 1, pos: 9 })] }),
    CAP,
  );
  assert.equal(r.placed, 0);
  assert.equal(r.offGrid, 1);
  assert.equal(r.pages[0].slots.length, 0);
});

test('an entry loose in the binder is counted, not placed at pocket zero', () => {
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'a', page: null, pos: null }),
        pocket({ cardId: 'b', page: 1, pos: null }),
      ],
    }),
    CAP,
  );
  assert.equal(r.loose, 2);
  assert.equal(r.placed, 0);
});

test('the page cap truncates the tail and says what it left behind', () => {
  const r = rebuildTcgscanBinder(
    binder({
      pageCount: 10,
      entries: [
        pocket({ cardId: 'kept', page: 2, pos: 0 }),
        pocket({ cardId: 'dropped', page: 9, pos: 0 }),
      ],
    }),
    3,
  );
  assert.equal(r.pages.length, 3);
  assert.equal(r.placed, 1);
  assert.equal(r.droppedPages, 7);
  assert.equal(r.droppedCards, 1);
  assert.equal(unplacedCount(r), 1);
});

test('a shape recorded on the page beats the missing unit grid', () => {
  const r = rebuildTcgscanBinder(
    binder({ rows: null, cols: null, entries: [pocket({ cardId: 'a', pos: 4, rows: 2, cols: 2 })] }),
    CAP,
  );
  assert.equal(r.assumedShape, false);
  assert.deepEqual([r.pages[0].rows, r.pages[0].cols], [2, 2]);
  // Pocket 4 is off a 2 x 2 page - reported, not wrapped onto a third row.
  assert.equal(r.offGrid, 1);
});

test('an unrecorded page shape is assumed, and flagged as assumed', () => {
  const r = rebuildTcgscanBinder(
    binder({ rows: null, cols: null, entries: [pocket({ cardId: 'a', page: 1, pos: 4 })] }),
    CAP,
  );
  assert.equal(r.assumedShape, true);
  assert.equal(r.rows, ASSUMED_ROWS);
  assert.equal(r.cols, ASSUMED_COLS);
  assert.deepEqual([r.pages[0].slots[0].row, r.pages[0].slots[0].col], [1, 0]);
});

test('a recorded shape is not flagged as assumed', () => {
  assert.equal(rebuildTcgscanBinder(binder(), CAP).assumedShape, false);
});

test('each page decodes through ITS OWN shape, not the binder’s', () => {
  // The defect 20260828140000 closes: page 2 was scanned as a 2 x 2, the unit says 3 x 4. Pocket 2
  // is row 1 col 0 on a 2-wide page and row 0 col 2 on a 4-wide one.
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'wide', page: 1, pos: 2, rows: 3, cols: 4 }),
        pocket({ cardId: 'narrow', page: 2, pos: 2, rows: 2, cols: 2 }),
      ],
    }),
    CAP,
  );
  assert.deepEqual([r.pages[0].rows, r.pages[0].cols], [3, 4]);
  assert.deepEqual([r.pages[1].rows, r.pages[1].cols], [2, 2]);
  assert.deepEqual([r.pages[0].slots[0].row, r.pages[0].slots[0].col], [0, 2]);
  assert.deepEqual([r.pages[1].slots[0].row, r.pages[1].slots[0].col], [1, 0]);
  assert.equal(r.mixedShapes, true);
});

test('the summary shape is the commonest one, and one odd page does not rename the binder', () => {
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'a', page: 1, pos: 0, rows: 3, cols: 4 }),
        pocket({ cardId: 'b', page: 2, pos: 0, rows: 3, cols: 4 }),
        pocket({ cardId: 'c', page: 3, pos: 0, rows: 2, cols: 2 }),
      ],
    }),
    CAP,
  );
  assert.deepEqual([r.rows, r.cols], [3, 4]);
  assert.equal(r.mixedShapes, true);
});

test('one shape throughout is not reported as mixed', () => {
  const r = rebuildTcgscanBinder(
    binder({ pageCount: 3, entries: [pocket({ cardId: 'a', rows: 3, cols: 4 })] }),
    CAP,
  );
  assert.equal(r.mixedShapes, false);
});

test('a shape michi has no page for is drawn on the nearest real one', () => {
  // michi draws real side-load pages (2x2, 3x3, 3x4, 4x4); tcgscan's grid inference has reported a
  // phantom 3 x 5. Pocket 6 on a 5-wide page is row 1 col 1 - and lands there on the 3 x 4.
  const r = rebuildTcgscanBinder(
    binder({ entries: [pocket({ cardId: 'a', page: 1, pos: 6, rows: 3, cols: 5 })] }),
    CAP,
  );
  assert.equal(r.normalizedPages, 1);
  // 3 x 4 and 4 x 4 both keep 12 of the 15 pockets; the smaller one wins, so no empty row is
  // invented for a binder that never had one.
  assert.deepEqual([r.pages[0].rows, r.pages[0].cols], [3, 4]);
  assert.deepEqual([r.pages[0].slots[0].row, r.pages[0].slots[0].col], [1, 1]);
});

test('a card in a column no real page has is dropped, not folded onto another pocket', () => {
  // Pocket 4 on a 3 x 5 page is row 0 col 4, and no michi page is 5 wide.
  const r = rebuildTcgscanBinder(
    binder({ entries: [pocket({ cardId: 'a', page: 1, pos: 4, rows: 3, cols: 5 })] }),
    CAP,
  );
  assert.equal(r.placed, 0);
  assert.equal(r.offGrid, 1);
});

test('a shape smaller than any real page grows into the smallest one that holds it', () => {
  // A 2 x 3 is not a michi page; a 3 x 3 is, and the cards keep their row and column in it.
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'a', page: 1, pos: 0, rows: 2, cols: 3 }),
        pocket({ cardId: 'b', page: 1, pos: 5, rows: 2, cols: 3 }),
      ],
    }),
    CAP,
  );
  assert.deepEqual([r.pages[0].rows, r.pages[0].cols], [3, 3]);
  const at = (id: string) => {
    const s = r.pages[0].slots.find((x) => x.cardId === id);
    return s ? [s.row, s.col] : null;
  };
  assert.deepEqual(at('a'), [0, 0]);
  assert.deepEqual(at('b'), [1, 2]);
  assert.equal(r.normalizedPages, 1);
});

test('a sideways page is turned upright onto the real page it is a transpose of', () => {
  // tcgscan's rows/cols are camera-relative: a 3 x 4 page photographed turned is honestly reported
  // as 4 x 3. michi has no 4 x 3 page (binderPhysics: it does not exist), so the page is rotated.
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        // On the 4 x 3 the camera saw: pos 0 is (0,0), pos 5 is (1,2), pos 11 is (3,2).
        pocket({ cardId: 'first', page: 1, pos: 0, rows: 4, cols: 3 }),
        pocket({ cardId: 'middle', page: 1, pos: 5, rows: 4, cols: 3 }),
        pocket({ cardId: 'last', page: 1, pos: 11, rows: 4, cols: 3 }),
      ],
    }),
    CAP,
  );
  assert.deepEqual([r.pages[0].rows, r.pages[0].cols], [3, 4]);
  assert.equal(r.rotatedPages, 1);
  assert.equal(r.normalizedPages, 0);
  const at = (id: string) => {
    const x = r.pages[0].slots.find((y) => y.cardId === id);
    return x ? [x.row, x.col] : null;
  };
  // A quarter turn clockwise: (row, col) -> (col, lastRow - row). Nothing is dropped and every
  // card keeps its neighbours.
  assert.deepEqual(at('first'), [0, 3]);
  assert.deepEqual(at('middle'), [2, 2]);
  assert.deepEqual(at('last'), [2, 0]);
  assert.equal(r.placed, 3);
});

test('a rotated page loses nothing: 12 pockets in, 12 pockets out', () => {
  const r = rebuildTcgscanBinder(
    binder({
      entries: Array.from({ length: 12 }, (_, i) =>
        pocket({ cardId: `c${i}`, page: 1, pos: i, rows: 4, cols: 3, entryId: `e${i}` }),
      ),
    }),
    CAP,
  );
  assert.equal(r.placed, 12);
  assert.equal(r.offGrid, 0);
  // Every cell of the 3 x 4 is filled exactly once.
  const cells = r.pages[0].slots.map((x) => `${x.row}:${x.col}`);
  assert.equal(new Set(cells).size, 12);
});

test('a square shape is never treated as sideways', () => {
  const r = rebuildTcgscanBinder(
    binder({ entries: [pocket({ cardId: 'a', pos: 1, rows: 2, cols: 2 })] }),
    CAP,
  );
  assert.equal(r.rotatedPages, 0);
  assert.deepEqual([r.pages[0].slots[0].row, r.pages[0].slots[0].col], [0, 1]);
});

test('a real shape is not counted as normalised', () => {
  const r = rebuildTcgscanBinder(
    binder({ entries: [pocket({ cardId: 'a', rows: 4, cols: 4 })] }),
    CAP,
  );
  assert.equal(r.normalizedPages, 0);
  assert.deepEqual([r.pages[0].rows, r.pages[0].cols], [4, 4]);
});

test('a unit grid that is not a real page falls through to the assumed shape', () => {
  // Nothing decodes against it (an entry-less page has no pockets), so it is replaced, not fitted.
  const r = rebuildTcgscanBinder(binder({ rows: 3, cols: 12, entries: [] }), CAP);
  assert.deepEqual([r.pages[0].rows, r.pages[0].cols], [ASSUMED_ROWS, ASSUMED_COLS]);
});

test('entries disagreeing about one page keep the first, as the offline sibling does', () => {
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'a', page: 1, pos: 0, rows: 3, cols: 4, entryId: 'e1' }),
        pocket({ cardId: 'b', page: 1, pos: 1, rows: 2, cols: 2, entryId: 'e2' }),
      ],
    }),
    CAP,
  );
  assert.deepEqual([r.pages[0].rows, r.pages[0].cols], [3, 4]);
});

test('a page with no entries takes the binder grid, so an empty page is still drawable', () => {
  const r = rebuildTcgscanBinder(
    binder({ rows: 2, cols: 2, pageCount: 2, entries: [pocket({ cardId: 'a', rows: 2, cols: 2 })] }),
    CAP,
  );
  assert.deepEqual([r.pages[1].rows, r.pages[1].cols], [2, 2]);
});

test('placed pockets consume owned copies, like any placement from the collection', () => {
  const r = rebuildTcgscanBinder(binder({ entries: [pocket({ cardId: 'a' })] }), CAP);
  assert.equal(r.pages[0].slots[0].fromCollection, true);
  assert.equal(r.pages[0].slots[0].type, 'card');
});

test('every page carries the binder page shape', () => {
  const r = rebuildTcgscanBinder(
    binder({ rows: 2, cols: 2, pageCount: 3, entries: [] }),
    CAP,
  );
  assert.deepEqual(
    r.pages.map((p) => [p.rows, p.cols]),
    [
      [2, 2],
      [2, 2],
      [2, 2],
    ],
  );
});

test('slot and page ids are unique, so nothing overwrites anything on save', () => {
  const r = rebuildTcgscanBinder(
    binder({
      entries: [
        pocket({ cardId: 'a', page: 1, pos: 0, entryId: 'e1' }),
        pocket({ cardId: 'a', page: 1, pos: 1, entryId: 'e2' }),
        pocket({ cardId: 'a', page: 2, pos: 0, entryId: 'e3' }),
      ],
    }),
    CAP,
  );
  const ids = [...r.pages.map((p) => p.id), ...r.pages.flatMap((p) => p.slots.map((s) => s.id))];
  assert.equal(new Set(ids).size, ids.length);
});

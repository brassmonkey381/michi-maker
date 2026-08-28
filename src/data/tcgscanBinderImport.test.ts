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
  return { page: 1, pos: 0, scannedAt: null, entryId: over.cardId, ...over };
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

test('placed pockets consume owned copies, like any placement from the collection', () => {
  const r = rebuildTcgscanBinder(binder({ entries: [pocket({ cardId: 'a' })] }), CAP);
  assert.equal(r.pages[0].slots[0].fromCollection, true);
  assert.equal(r.pages[0].slots[0].type, 'card');
});

test('every page carries the binder page shape', () => {
  const r = rebuildTcgscanBinder(
    binder({ rows: 4, cols: 2, pageCount: 3, entries: [] }),
    CAP,
  );
  assert.deepEqual(
    r.pages.map((p) => [p.rows, p.cols]),
    [
      [4, 2],
      [4, 2],
      [4, 2],
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

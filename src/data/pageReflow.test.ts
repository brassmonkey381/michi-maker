import assert from 'node:assert/strict';
import test from 'node:test';

import { reflowToShape, reflowSummary } from './pageReflow.ts';
import type { DemoPage, DemoSlot } from './binderTypes.ts';

let n = 0;
function card(id?: string, row = 0, col = 0, rowSpan = 1, colSpan = 1): DemoSlot {
  n += 1;
  return { id: id ?? `slot${n}`, type: 'card', cardId: `card${n}`, row, col, rowSpan, colSpan } as DemoSlot;
}

/** A page filled row-major with `count` single-pocket cards. */
function filled(id: string, rows: number, cols: number, count: number): DemoPage {
  const slots: DemoSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    slots.push(card(`${id}-s${i}`, Math.floor(i / cols), i % cols));
  }
  return { id, rows, cols, slots };
}

const ids = (page: DemoPage): string[] => page.slots.map((s) => s.id);

test('shrinking reflows in reading order and spills onto more pages', () => {
  // One full 3x4 page (12 cards) becomes 3x3: 9 here, 3 on a new page, same order.
  const result = reflowToShape([filled('p1', 3, 4, 12)], 3, 3);
  assert.equal(result.blocked, undefined);
  assert.equal(result.pages.length, 2);
  assert.equal(result.pageDelta, 1);
  assert.deepEqual(ids(result.pages[0]), Array.from({ length: 9 }, (_, i) => `p1-s${i}`));
  assert.deepEqual(ids(result.pages[1]), ['p1-s9', 'p1-s10', 'p1-s11']);
  // Every pocket sits inside the new grid.
  for (const page of result.pages) {
    for (const slot of page.slots) {
      assert.ok(slot.row + slot.rowSpan <= 3 && slot.col + slot.colSpan <= 3, `${slot.id} outside the grid`);
    }
  }
});

test('nothing is lost: every pocket id survives a shrink', () => {
  const before = [filled('p1', 3, 4, 12), filled('p2', 3, 4, 7)];
  const result = reflowToShape(before, 2, 2);
  const seen = result.pages.flatMap(ids).sort();
  const expected = before.flatMap(ids).sort();
  assert.deepEqual(seen, expected);
});

test('growing pulls later cards forward and keeps the binder its own length', () => {
  // Two 3x3 pages, 9 + 3 cards, widened to 3x4: 12 fit on page one, page two stays as an empty page.
  const result = reflowToShape([filled('p1', 3, 3, 9), filled('p2', 3, 3, 3)], 3, 4);
  assert.equal(result.pages.length, 2, 'a page the user made is not deleted by a reshape');
  assert.equal(ids(result.pages[0]).length, 12);
  assert.deepEqual(ids(result.pages[1]), []);
  assert.equal(result.pageDelta, 0);
  assert.equal(result.moved, 3, 'the three cards that changed page are counted');
});

test('a piece too big for the new grid blocks the whole reshape, and changes nothing', () => {
  const page: DemoPage = { id: 'p1', rows: 3, cols: 3, slots: [card('art', 0, 0, 2, 2)] };
  const result = reflowToShape([page], 1, 1);
  assert.match(result.blocked ?? '', /2×2 piece/);
  assert.deepEqual(result.pages, [page], 'the caller gets its own pages back untouched');
  assert.equal(result.moved, 0);
});

test('multi-cell art keeps its shape and its pocket id', () => {
  const page: DemoPage = {
    id: 'p1', rows: 3, cols: 4,
    slots: [card('a', 0, 0), card('art', 0, 1, 2, 2), card('b', 0, 3)],
  };
  const result = reflowToShape([page], 3, 3);
  const art = result.pages.flatMap((p) => p.slots).find((s) => s.id === 'art');
  assert.ok(art, 'the art piece survives');
  assert.equal(art.rowSpan, 2);
  assert.equal(art.colSpan, 2);
  assert.ok(art.row + 2 <= 3 && art.col + 2 <= 3, 'it sits inside the new grid');
});

test('a pocket that does not change page is not counted as moved', () => {
  const result = reflowToShape([filled('p1', 3, 3, 4)], 3, 4);
  assert.equal(result.moved, 0);
  assert.equal(result.pageDelta, 0);
});

test('page look travels by position, not with the cards', () => {
  const pages: DemoPage[] = [
    { ...filled('p1', 3, 3, 9), title: 'Starters', backgroundColor: '#fff' },
    { ...filled('p2', 3, 3, 1), title: 'Leftovers', sleeve: '#000' },
  ];
  const result = reflowToShape(pages, 2, 2);
  assert.equal(result.pages[0].title, 'Starters');
  assert.equal(result.pages[0].backgroundColor, '#fff');
  assert.equal(result.pages[1].title, 'Leftovers', 'page two keeps its own name even though its cards changed');
  assert.equal(result.pages[1].sleeve, '#000');
});

test('existing page ids are kept, so shares and saved rows survive', () => {
  const result = reflowToShape([filled('p1', 3, 4, 12), filled('p2', 3, 4, 1)], 3, 3);
  assert.equal(result.pages[0].id, 'p1');
  assert.equal(result.pages[1].id, 'p2');
});

test('an empty binder reshapes to an empty binder', () => {
  const result = reflowToShape([{ id: 'p1', rows: 3, cols: 3, slots: [] }], 4, 4);
  assert.equal(result.pages.length, 1);
  assert.deepEqual(result.pages[0].slots, []);
  assert.equal(result.pages[0].rows, 4);
  assert.equal(result.pages[0].cols, 4);
});

test('the summary says what happened', () => {
  assert.equal(reflowSummary({ pageDelta: 0, moved: 0 }, 3, 3), 'All pages set to 3×3');
  assert.equal(
    reflowSummary({ pageDelta: 2, moved: 5 }, 3, 3),
    'All pages set to 3×3 · 5 cards reflowed · +2 pages',
  );
});

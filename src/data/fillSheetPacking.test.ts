import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DemoBinder, DemoSlot } from './binderTypes.ts';
import { collectFillTiles } from './placeholderPdf.ts';

const cards = { getCard: (id: string) => ({ name: `Card ${id}`, setName: 'Set', number: id }) };

/** A binder of 3x3 pages: `singles` one-pocket art pieces and `folds` folded 1x2 pieces, no cards. */
function artBinder(singles: number, folds: number): DemoBinder {
  const pages: DemoBinder['pages'] = [];
  let s = 0;
  let f = 0;
  let n = 0;
  while (s < singles || f < folds) {
    const slots: DemoSlot[] = [];
    const pageIndex = pages.length;
    // Left leaves fold on cols 0–1, right leaves on cols 1–2 (binderPhysics); one fold per page on row 0.
    const foldCol = pageIndex % 2 === 1 ? 0 : 1;
    if (f < folds) {
      slots.push({ id: `f${n++}`, row: 0, col: foldCol, rowSpan: 1, colSpan: 2, type: 'artwork', imageUrl: 'https://x/a.png', imageCrop: { x: 0, y: 0, w: 1, h: 1 } });
      f += 1;
    }
    for (let r = 1; r < 3 && s < singles; r += 1) {
      for (let c = 0; c < 3 && s < singles; c += 1) {
        slots.push({ id: `s${n++}`, row: r, col: c, rowSpan: 1, colSpan: 1, type: 'artwork', imageUrl: 'https://x/b.png', imageCrop: { x: 0, y: 0, w: 1, h: 1 } });
        s += 1;
      }
    }
    pages.push({ id: `p${pageIndex}`, rows: 3, cols: 3, slots });
  }
  return { id: 'b', title: 'Packing', layoutStyle: 'freeform', isExample: false, pages };
}

test('every fold takes a row with a single beside it; the rest of the singles fill rows of three', () => {
  const { counts } = collectFillTiles(artBinder(20, 5), cards);
  assert.equal(counts.art, 25);
  // 5 fold rows (each with one single) + ceil(15 / 3) singles rows = 10 rows, 3 to a sheet
  assert.equal(counts.artSheets, 4);
  // The spaced layout this replaced: ceil(20 / 6) + ceil(5 / 2)
  assert.equal(counts.artSheetsSpaced, 4 + 3);
  assert.equal(counts.placeholderSheets, 0);
  assert.equal(counts.sheets, counts.artSheets);
});

test('a binder with no art reports no cardstock and no saving', () => {
  const binder: DemoBinder = {
    id: 'c', title: 'Cards', layoutStyle: 'freeform', isExample: false,
    pages: [{ id: 'p', rows: 3, cols: 3, slots: [{ id: 'k', row: 0, col: 0, rowSpan: 1, colSpan: 1, type: 'card', cardId: '1' }] }],
  };
  const { counts } = collectFillTiles(binder, cards);
  assert.equal(counts.artSheets, 0);
  assert.equal(counts.artSheetsSpaced, 0);
  assert.equal(counts.placeholderSheets, 1);
});

test('nine singles and four folds is two sheets: four fold rows and two singles rows', () => {
  const { counts } = collectFillTiles(artBinder(9, 4), cards);
  assert.equal(counts.artSheets, 2);
  assert.equal(counts.artSheetsSpaced, 2 + 2);
});

test('folds alone pack three to a sheet, one per row', () => {
  const { counts } = collectFillTiles(artBinder(0, 7), cards);
  assert.equal(counts.artSheets, 3);
  assert.equal(counts.artSheetsSpaced, 4);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DemoBinder, DemoSlot } from './binderTypes.ts';
import { ART_FULL_RECT, ART_WINDOW } from './artView.ts';
import { type CardMeta, collectFillTiles, describeDownload, describeFiles, type MatTile } from './placeholderPdf.ts';

const META: Record<string, CardMeta> = {
  w1: { name: 'Wartortle', setName: 'Pokemon GO', number: '016/078', types: ['Water'], stage: 'Stage 1', seriesId: 'Sword & Shield', illustrator: 'kurumitsu', releaseDate: '2022-07-01' },
  w2: { name: 'Tentacool', setName: 'SV151', number: '072/165', types: ['Water'], stage: 'Basic', seriesId: 'Scarlet & Violet', illustrator: 'miki kudo', releaseDate: '2023-09-22' },
  full: { name: 'Oshawott', setName: 'Brilliant Stars', number: '105/086', types: ['Water'], stage: 'Basic', fullArt: true, fullArtKind: 'illustration_rare', releaseDate: '2022-02-25' },
  full2: { name: 'Sprigatito', setName: 'Promo', number: '001', types: ['Grass'], stage: 'Basic', fullArtKind: 'illustration_rare', releaseDate: '2023-01-01' },
};
const cards = { getCard: (id: string) => META[id] };

const slot = (id: string, row: number, col: number, extra: Partial<DemoSlot> = {}): DemoSlot => ({ id: `s-${id}-${row}${col}`, row, col, rowSpan: 1, colSpan: 1, type: 'card', cardId: id, ...extra });

function binder(pages: DemoBinder['pages']): DemoBinder {
  return { id: 'b', title: 'Mats', layoutStyle: 'freeform', isExample: false, pages };
}

test('mats are off unless asked for, and print nothing for a page in the card view', () => {
  const b = binder([
    { id: 'p1', rows: 3, cols: 3, artView: 'window', slots: [slot('w1', 0, 0), slot('w2', 0, 1)] },
    { id: 'p2', rows: 3, cols: 3, slots: [slot('w1', 0, 0)] },
  ]);
  assert.equal(collectFillTiles(b, cards).counts.mats, 0);
  assert.equal(collectFillTiles(b, cards).counts.matColor, undefined);
  const { tiles, counts } = collectFillTiles(b, cards, undefined, 'black');
  assert.equal(counts.mats, 2, 'only the window page gets mats');
  assert.equal(counts.matColor, 'black');
  assert.equal(counts.cards, 3, 'the placeholders still print for every pocket');
  const mats = tiles.filter((t): t is MatTile => t.kind === 'mat');
  assert.deepEqual(mats.map((m) => [m.page, m.row, m.col, m.cut, m.color]), [[1, 1, 1, ART_WINDOW, 'black'], [1, 1, 2, ART_WINDOW, 'black']]);
  assert.equal(mats[0].name, 'Wartortle');
  assert.equal(mats[0].sub, 'No. 008 · Water · Stage 1');
  assert.equal(mats[0].dex, '008');
  assert.deepEqual(mats[0].rows.map((r) => r.label), ['Series', 'Set', 'Number', 'Illustrator', 'Released']);
  assert.equal(mats[0].rows[4].value, '2022');
});

test('a full-art card on a window page keeps no mat; a jumbo gets none; an unknown card gets a plain mat', () => {
  const b = binder([
    { id: 'p1', rows: 3, cols: 3, artView: 'window', slots: [slot('full', 0, 0), slot('w1', 0, 1, { rowSpan: 2, colSpan: 2 }), slot('zzz', 2, 0)] },
  ]);
  const { tiles, counts } = collectFillTiles(b, cards, undefined, 'white');
  assert.equal(counts.mats, 1);
  const [m] = tiles.filter((t): t is MatTile => t.kind === 'mat');
  assert.equal(m.name, 'Unknown card');
  assert.equal(m.color, 'white');
});

test('a connected page is cut as the sheet is: inside the border when every card is full art, else the window', () => {
  const full = binder([{ id: 'p1', rows: 3, cols: 3, artView: 'connected', slots: [slot('full', 0, 0), slot('full2', 0, 1)] }]);
  const mixed = binder([{ id: 'p1', rows: 3, cols: 3, artView: 'connected', slots: [slot('full', 0, 0), slot('w1', 0, 1)] }]);
  const cutsOf = (b: DemoBinder) => collectFillTiles(b, cards, undefined, 'black').tiles.filter((t): t is MatTile => t.kind === 'mat').map((m) => m.cut);
  assert.deepEqual(cutsOf(full), [ART_FULL_RECT, ART_FULL_RECT]);
  assert.deepEqual(cutsOf(mixed), [ART_WINDOW, ART_WINDOW]);
});

test('mats pack nine a sheet in their own file and count toward the total', () => {
  const slots: DemoSlot[] = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) slots.push(slot(c % 2 ? 'w1' : 'w2', r, c));
  const b = binder([
    { id: 'p1', rows: 3, cols: 3, artView: 'window', slots },
    { id: 'p2', rows: 3, cols: 3, artView: 'window', slots: slots.slice(0, 3) },
  ]);
  const { counts } = collectFillTiles(b, cards, undefined, 'black');
  assert.equal(counts.mats, 12);
  assert.equal(counts.art, 0);
  assert.equal(counts.artSheets, 0, 'no art, so no art file');
  // Twelve mats: four rows of three, three rows to a sheet.
  assert.equal(counts.matSheets, 2);
  assert.equal(counts.placeholderSheets, 2);
  assert.equal(counts.sheets, 4);
});

test('the mats are their own PDF, after the art and before the instructions', async () => {
  const { buildFillSheetPdfs } = await import('./placeholderPdf.ts');
  const b = binder([{ id: 'p1', rows: 3, cols: 3, artView: 'window', slots: [slot('w1', 0, 0), slot('w2', 0, 1)] }]);
  const files = await buildFillSheetPdfs(b, cards, { mats: 'white' });
  assert.deepEqual(files.map((f) => f.section), ['placeholders', 'mats', 'instructions']);
  assert.equal(files[1].pieces, 2);
  assert.equal(files[1].sheets, 1);
});

test('the download is described file by file from the counts, and the read-me comes last', () => {
  const art = slot('art', 1, 0, { type: 'artwork', cardId: undefined, imageUrl: 'https://x/a.png' });
  const b = binder([{ id: 'p1', rows: 3, cols: 3, artView: 'window', slots: [slot('w1', 0, 0), slot('w2', 0, 1), art] }]);
  const files = describeFiles(collectFillTiles(b, cards, undefined, 'black').counts);
  assert.deepEqual(files.map((f) => f.section), ['placeholders', 'art', 'mats', 'instructions']);
  assert.equal(files[2].paper, 'matte photo paper');
  assert.equal(files[3].size, '1 page');
  assert.equal(describeDownload(files), '4 PDFs in one zip: placeholders, art, mats and a read-me');
  const noMats = describeFiles(collectFillTiles(b, cards).counts);
  assert.deepEqual(noMats.map((f) => f.section), ['placeholders', 'art', 'instructions']);
  assert.equal(describeFiles(collectFillTiles(binder([]), cards).counts).length, 0);
  assert.equal(describeDownload([]), 'Nothing to print');
});

test('mats follow the art view at every level: the binder, a page saying card, a pocket saying window or card', () => {
  const windowed = { ...binder([
    { id: 'p1', rows: 3, cols: 3, slots: [slot('w1', 0, 0), slot('w2', 0, 1)] },
    { id: 'p2', rows: 3, cols: 3, artView: 'card', slots: [slot('w1', 0, 0)] },
  ]), pageStyle: { artView: 'window' as const } };
  const { tiles, counts } = collectFillTiles(windowed, cards, undefined, 'black');
  assert.equal(counts.mats, 2, 'the binder-wide window mats every pocket of the plain page; the page that says card gets none');
  assert.deepEqual(tiles.filter((t): t is MatTile => t.kind === 'mat').map((m) => m.page), [1, 1]);
  const pockets = binder([
    { id: 'p1', rows: 3, cols: 3, slots: [slot('w1', 0, 0, { artView: 'window' }), slot('w2', 0, 1)] },
    { id: 'p2', rows: 3, cols: 3, artView: 'window', slots: [slot('w1', 0, 0, { artView: 'card' }), slot('w2', 0, 1)] },
  ]);
  const mats = collectFillTiles(pockets, cards, undefined, 'white').tiles.filter((t): t is MatTile => t.kind === 'mat');
  assert.deepEqual(mats.map((m) => [m.page, m.col]), [[1, 1], [2, 2]], 'one windowed pocket on a plain page, one whole card kept on a windowed page');
});

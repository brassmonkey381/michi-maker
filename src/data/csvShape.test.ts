import assert from 'node:assert/strict';
import test from 'node:test';

import { csvShape, detectColumns, looksHeaderless, normCardName, normProductId, parseCsv, roleOfColumn, sameCardNumber, sameSetName, type ImportAnalysis } from './csvShape.ts';

test('a TCGPlayer export header is read by product id, quantity, name, set and number', () => {
  const header = parseCsv('Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU')[0];
  const c = detectColumns(header);
  assert.deepEqual(c, { id: 10, qty: 0, name: 2, set: 3, number: 4, headerless: false });
});

test('a first row of numbers is data, not a header; words are a header even when none are known', () => {
  assert.equal(looksHeaderless(['123456', '2']), true);
  assert.equal(looksHeaderless(['123456']), true);
  assert.equal(looksHeaderless(['', '']), false);
  assert.equal(looksHeaderless(['Charizard', 'Base Set']), false);
  assert.deepEqual(detectColumns(['123456', '2']), { id: 0, qty: 1, name: -1, set: -1, number: -1, headerless: true });
  assert.deepEqual(detectColumns(['123456']).qty, -1);
  const unknown = detectColumns(['Card', 'Owned']);
  assert.equal(unknown.headerless, false);
  assert.equal(unknown.id, -1);
  assert.equal(unknown.name, -1);
});

test('an assigned role moves to its column and the column that had it lets go', () => {
  const header = ['Card', 'Owned', 'Name'];
  const c = detectColumns(header, { qty: 1, name: 0 });
  assert.equal(c.qty, 1);
  assert.equal(c.name, 0);
  assert.equal(roleOfColumn(c, 2), null);
  assert.equal(detectColumns(header, { name: -1 }).name, -1);
  // Two roles cannot share a column: assigning id to the name column clears name.
  const d = detectColumns(['Name', 'Qty'], { id: 0 });
  assert.equal(d.id, 0);
  assert.equal(d.name, -1);
  assert.equal(d.qty, 1);
});

test('the shape record carries column names and counts, never a cell value', () => {
  const rows = parseCsv('Name,Qty,Notes\nPikachu,2,my favourite\nNotACard,1,\n,1,');
  const analysis: ImportAnalysis = {
    matches: [{ cardId: '1', quantity: 2, name: 'Pikachu', via: 'name' }],
    unmatched: [
      { line: 3, reason: 'no card named "NotACard"', kind: 'name_not_found' },
      { line: 4, reason: 'no id or name', kind: 'no_id_or_name' },
    ],
    totalCopies: 2,
    columns: detectColumns(rows[0]),
  };
  const shape = csvShape(rows, analysis, 60);
  assert.deepEqual(shape.header, ['name', 'qty', 'notes']);
  assert.deepEqual(shape.columns, { id: -1, qty: 1, name: 0, set: -1, number: -1 });
  assert.equal(shape.rows, 4);
  assert.equal(shape.matched, 1);
  assert.equal(shape.unmatched, 2);
  assert.equal(shape.remapped, null);
  assert.deepEqual(shape.skipped, { name_not_found: 1, no_id_or_name: 1 });
  assert.deepEqual(shape.matched_via, { id: 0, name: 1 });
  const text = JSON.stringify(shape);
  assert.ok(!text.includes('Pikachu') && !text.includes('NotACard') && !text.includes('favourite'));
  assert.deepEqual(csvShape(rows, analysis, 60, { qty: 2 }).remapped, { qty: 2 });
});

test('a headerless shape records no header names at all', () => {
  const rows = parseCsv('123456,2\n654321');
  const analysis: ImportAnalysis = { matches: [], unmatched: [], totalCopies: 0, columns: detectColumns(rows[0]) };
  const shape = csvShape(rows, analysis, 16);
  assert.equal(shape.headerless, true);
  assert.deepEqual(shape.header, []);
  assert.equal(shape.cols, 2);
});

test('zero padding never keeps a card number or product id from matching', () => {
  assert.ok(sameCardNumber('58/102', '058/102'));
  assert.ok(sameCardNumber('58/102', '058'));
  assert.ok(sameCardNumber('58/102', '58'));
  assert.ok(sameCardNumber('058/102', '58/102'));
  assert.ok(sameCardNumber('TG05', 'tg5'));
  assert.ok(sameCardNumber('TG05/TG30', 'TG05'));
  assert.ok(!sameCardNumber('58/102', '5'));
  assert.ok(!sameCardNumber('58/102', '580'));
  assert.ok(!sameCardNumber('58/102', '59/102'));
  assert.equal(normProductId('0610516'), '610516');
  assert.equal(normProductId(' 610516 '), '610516');
  assert.equal(normProductId('abc'), 'abc');
  assert.equal(normProductId('0'), '0');
});

test('a card name matches its family: variant tags, accents, case and punctuation do not count', () => {
  assert.equal(normCardName('Rayquaza V (Alternate Full Art)'), 'rayquaza v');
  assert.equal(normCardName('Umbreon VMAX (Alternate Art Secret)'), 'umbreon vmax');
  assert.equal(normCardName('rayquaza v'), 'rayquaza v');
  assert.equal(normCardName('Pokémon Catcher'), 'pokemon catcher');
  assert.equal(normCardName("Farfetch'd"), 'farfetch d');
  assert.equal(normCardName('Ho-Oh & Lugia GX'), 'ho oh and lugia gx');
  assert.equal(normCardName("______'s Pikachu"), 's pikachu');
});

test('a set matches by its full name, the part after the code, or the code itself', () => {
  assert.ok(sameSetName('SWSH07: Evolving Skies', 'SWSH07', 'Evolving Skies'));
  assert.ok(sameSetName('SWSH07: Evolving Skies', 'SWSH07', 'evolving  skies'));
  assert.ok(sameSetName('SWSH07: Evolving Skies', 'SWSH07', 'SWSH07: Evolving Skies'));
  assert.ok(sameSetName('SWSH07: Evolving Skies', 'SWSH07', 'swsh07'));
  assert.ok(sameSetName('SWSH01: Sword & Shield Base Set', 'SWSH01', 'Sword and Shield Base Set'));
  assert.ok(sameSetName('SV: Prismatic Evolutions', 'PRE', 'Prismatic Evolutions'));
  assert.ok(sameSetName('Base Set', 'BS', 'base set'));
  assert.ok(!sameSetName('SWSH07: Evolving Skies', 'SWSH07', 'Evolving'));
  assert.ok(!sameSetName('SWSH09: Brilliant Stars Trainer Gallery', 'SWSH09:TG', 'Brilliant Stars'));
  assert.ok(!sameSetName('Base Set', 'BS', ''));
});

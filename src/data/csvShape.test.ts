import assert from 'node:assert/strict';
import test from 'node:test';

import { csvShape, detectColumns, parseCsv, type ImportAnalysis } from './csvShape.ts';

test('a TCGPlayer export header is read by product id, quantity, name, set and number', () => {
  const header = parseCsv('Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Language,Rarity,Product ID,SKU')[0];
  const c = detectColumns(header);
  assert.deepEqual(c, { id: 10, qty: 0, name: 2, set: 3, number: 4, headerless: false });
});

test('a bare id list has no header, and a stray data row pasted first is not mistaken for one', () => {
  assert.equal(detectColumns(['123456', '2']).headerless, true);
  assert.equal(detectColumns(['Charizard', 'Base Set']).headerless, true);
  assert.equal(detectColumns(['card name']).headerless, false);
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
  assert.deepEqual(shape.skipped, { name_not_found: 1, no_id_or_name: 1 });
  assert.deepEqual(shape.matched_via, { id: 0, name: 1 });
  const text = JSON.stringify(shape);
  assert.ok(!text.includes('Pikachu') && !text.includes('NotACard') && !text.includes('favourite'));
});

test('a headerless shape records no header names at all', () => {
  const rows = parseCsv('123456,2\n654321');
  const analysis: ImportAnalysis = { matches: [], unmatched: [], totalCopies: 0, columns: detectColumns(rows[0]) };
  const shape = csvShape(rows, analysis, 16);
  assert.equal(shape.headerless, true);
  assert.deepEqual(shape.header, []);
  assert.equal(shape.cols, 2);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { discoverOrder, finalCardHits, isPlainWords, mergeRows, wordColourPages } from './discoverMerge.ts';

const rows = (...ids: string[]) => ids.map((binder_id) => ({ binder_id }));
const ids = (list: { binder_id: string }[] | null) => list?.map((r) => r.binder_id) ?? null;

test('mergeRows keeps the lead first, drops repeats, and is null only when both lists are', () => {
  assert.deepEqual(ids(mergeRows(rows('a', 'b'), rows('b', 'c'))), ['a', 'b', 'c']);
  assert.deepEqual(ids(mergeRows(null, rows('c'))), ['c']);
  assert.deepEqual(ids(mergeRows(rows('a'), null)), ['a']);
  assert.deepEqual(ids(mergeRows([], [])), []);
  assert.equal(mergeRows(null, null), null);
});

test('only bare words count as plain', () => {
  assert.equal(isPlainWords({ words: ['rainy', 'city'], fields: [], comparisons: [] }), true);
  assert.equal(isPlainWords({ words: [], fields: [], comparisons: [] }), false);
  assert.equal(isPlainWords({ words: ['pikachu'], fields: [{ key: 'set' }], comparisons: [] }), false);
  assert.equal(isPlainWords({ words: ['pikachu'], fields: [], comparisons: [{ field: 'hp' }] }), false);
});

test('a lone colour word leads with its colour pages; a mixed query keeps its card hits first', () => {
  const ranked = rows('r1', 'both');
  const colour = rows('both', 'c1');
  assert.deepEqual(ids(finalCardHits(ranked, colour, { family: 'green', onlyColour: true })), ['both', 'c1', 'r1']);
  assert.deepEqual(ids(finalCardHits(ranked, colour, { family: 'green', onlyColour: false })), ['r1', 'both', 'c1']);
  assert.deepEqual(ids(finalCardHits(ranked, null, null)), ['r1', 'both']);
});

test('the colour-pages line goes only to binders the colour lane found', () => {
  const ranked = rows('r1', 'both');
  const colour = rows('both', 'c1');
  assert.deepEqual([...(wordColourPages(ranked, colour, { family: 'green', onlyColour: false })?.ids ?? [])], ['c1']);
  assert.deepEqual([...(wordColourPages(ranked, colour, { family: 'green', onlyColour: true })?.ids ?? [])], ['both', 'c1']);
  assert.equal(wordColourPages(ranked, colour, null), null);
  assert.equal(wordColourPages(ranked, rows('r1'), { family: 'green', onlyColour: false }), null);
});

test('the final order is every ranked row, then title binders no ranked row named', () => {
  assert.deepEqual(discoverOrder(rows('a', 'b'), ['b', 't1', 't1', 't2']), [
    { binder_id: 'a', from: 'ranked' },
    { binder_id: 'b', from: 'ranked' },
    { binder_id: 't1', from: 'title' },
    { binder_id: 't2', from: 'title' },
  ]);
  assert.deepEqual(discoverOrder(null, ['t']), [{ binder_id: 't', from: 'title' }]);
});

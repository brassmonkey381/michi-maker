import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_TEST_QUERIES,
  exportVerdicts,
  familyShares,
  fmtMs,
  ilikeContains,
  matchedCardsByBinder,
  normaliseQueries,
  parseVerdicts,
  setVerdict,
  titleWhy,
  verdictOf,
} from './searchLab.ts';

test('the starting queries are the owner list, clean', () => {
  assert.deepEqual(normaliseQueries(DEFAULT_TEST_QUERIES), [...DEFAULT_TEST_QUERIES]);
  assert.ok(DEFAULT_TEST_QUERIES.includes('rainy city'));
  assert.deepEqual(normaliseQueries([' Green ', 'green', '', 3, 'dragon']), ['Green', 'dragon']);
});

test('verdicts set, change, clear, and never mutate', () => {
  const a = setVerdict({}, ' Green ', 'b1', 'good');
  assert.deepEqual(a, { green: { b1: 'good' } });
  const b = setVerdict(a, 'green', 'b1', 'bad');
  assert.equal(verdictOf(b, 'GREEN', 'b1'), 'bad');
  assert.equal(verdictOf(a, 'green', 'b1'), 'good');
  assert.deepEqual(setVerdict(b, 'green', 'b1', null), {});
  assert.equal(verdictOf({}, 'x', 'y'), null);
});

test('stored verdicts are cleaned on the way in', () => {
  assert.deepEqual(parseVerdicts(null), {});
  assert.deepEqual(parseVerdicts('not json'), {});
  assert.deepEqual(parseVerdicts('[1]'), {});
  assert.deepEqual(parseVerdicts(JSON.stringify({ Green: { b1: 'good', b2: 'meh' }, x: 3, y: {} })), { green: { b1: 'good' } });
});

test('the export lists each query with its good and bad ids', () => {
  const v = setVerdict(setVerdict(setVerdict({}, 'pink', 'z', 'bad'), 'pink', 'a', 'good'), 'cameo', 'c', 'good');
  const out = JSON.parse(exportVerdicts(v, '2026-11-25T00:00:00.000Z'));
  assert.deepEqual(out, {
    exported_at: '2026-11-25T00:00:00.000Z',
    total: 3,
    queries: [
      { query: 'cameo', good: ['c'], bad: [] },
      { query: 'pink', good: ['a'], bad: ['z'] },
    ],
  });
});

test('the title lane explains itself the way search_binders matches', () => {
  assert.equal(ilikeContains('Rainy City Walk', ' rainy city '), true);
  assert.equal(ilikeContains('Rainy', ''), false);
  assert.equal(ilikeContains(null, 'x'), false);
  assert.deepEqual(titleWhy('green', { title: 'Greenery', description: 'all green', author: 'bob', pageTitles: ['Green 1', 'Red', 'green 2'] }), [
    'title',
    'description',
    '2 page titles',
  ]);
  assert.deepEqual(titleWhy('bob', { title: 'x', author: 'Bobby' }), ['@owner']);
  assert.deepEqual(titleWhy('cozy', { title: 'x' }), ['page tags or tag description (server only)']);
});

test('matched cards are grouped per binder, once each', () => {
  const m = matchedCardsByBinder(
    [
      { binder_id: 'b1', card_id: 'c1' },
      { binder_id: 'b1', card_id: 'c1' },
      { binder_id: 'b1', card_id: 'c9' },
      { binder_id: 'b2', card_id: 'c2' },
      { binder_id: null, card_id: 'c1' },
      { binder_id: 'b3', card_id: null },
    ],
    new Set(['c1', 'c2']),
  );
  assert.deepEqual([...m.entries()], [
    ['b1', ['c1']],
    ['b2', ['c2']],
  ]);
});

test('family shares: an all-green palette counts as green and nothing else', () => {
  // A saturated mid green (sRGB ~ #3fa34d) in Lab, full weight.
  const shares = familyShares([{ L: 59, a: -48, b: 36, w: 1 }]);
  const green = shares.find((s) => s.family === 'green');
  assert.ok(green && green.counts && green.share >= 0.9);
  assert.equal(shares.filter((s) => s.counts).length, 1);
  assert.ok(familyShares([]).every((s) => !s.counts));
});

test('fmtMs', () => {
  assert.equal(fmtMs(12.4), '12 ms');
  assert.equal(fmtMs(1530), '1.53 s');
});

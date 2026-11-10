import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handLayout, MIN_STRIP_PX } from './handLayout.ts';

const check = (n: number, w: number, h: number) => {
  const L = handLayout(n, w, h);
  assert.equal(L.rows.flat().length, n, 'every card placed once');
  assert.ok(L.width <= w, `fits the width (${L.width} <= ${w})`);
  assert.ok(L.height <= h + 1, `fits the height (${L.height} <= ${h})`);
  if (L.rows[0].length > 1) assert.ok(L.stride >= MIN_STRIP_PX, `strip ${L.stride} >= ${MIN_STRIP_PX}`);
  return L;
};

test('wide and short: one row', () => {
  assert.equal(check(8, 1136, 200).rows.length, 1);
  assert.equal(check(24, 1546, 200).rows.length, 1);
  const F = check(4, 1200, 420);
  assert.equal(F.rows.length, 1);
  assert.ok(F.stride >= F.cardW, 'no overlap');
});

test('tall narrow column (card browser open), 24 cards: 2-3 rows of big cards that fill the height', () => {
  const L = check(24, 620, 440);
  assert.ok(L.rows.length >= 2 && L.rows.length <= 3, `${L.rows.length} rows`);
  assert.ok(L.cardW >= 140, `big cards (${L.cardW})`);
  assert.ok(L.height >= 400, `fills the box (${L.height} of 440)`);
});

test('narrow and short, many cards: more rows rather than thin slivers', () => {
  const L = check(23, 1068, 200);
  assert.equal(L.rows.length, 2);
  assert.ok(Math.min(L.stride, L.cardW) / L.cardW >= 0.35);
});

test('cards scale with the room: more room, bigger cards', () => {
  assert.ok(check(24, 1500, 640).cardW > check(24, 1500, 300).cardW * 1.3);
});

test('phone 390 stays three rows of small cards with grab strips', () => {
  const L = check(24, 358, 150);
  assert.equal(L.rows.length, 3);
  assert.ok(L.cardW >= 53, `${L.cardW}`);
});

test('nothing to lay out', () => {
  assert.equal(handLayout(0, 500, 200).rows.length, 0);
  assert.equal(handLayout(5, 0, 200).rows.length, 0);
});

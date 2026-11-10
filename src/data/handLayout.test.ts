import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMFORT_SHARE, handLayout, MIN_STRIP_PX } from './handLayout.ts';

const check = (n: number, w: number, h: number) => {
  const L = handLayout(n, w, h);
  assert.equal(L.rows.flat().length, n, 'every card placed once');
  assert.ok(L.width <= w, `fits the width (${L.width} <= ${w})`);
  assert.ok(L.height <= h + 1, `fits the height (${L.height} <= ${h})`);
  if (L.rows[0].length > 1) assert.ok(L.stride >= MIN_STRIP_PX, `strip ${L.stride} >= ${MIN_STRIP_PX}`);
  return L;
};
const shown = (L: ReturnType<typeof handLayout>) => Math.min(L.stride, L.cardW) / L.cardW;

test('wide tray, few cards: one row, no overlap', () => {
  const L = check(8, 1136, 200);
  assert.equal(L.rows.length, 1);
  assert.ok(L.cardH >= 190, `${L.cardH}`);
  const F = check(4, 1200, 420);
  assert.equal(F.rows.length, 1);
  assert.ok(F.stride > F.cardW, 'gap between cards');
});

test('narrow tray (card browser open), many cards: two rows, no thin slivers', () => {
  const L = check(23, 1068, 200);
  assert.equal(L.rows.length, 2);
  assert.ok(shown(L) >= COMFORT_SHARE, `shows ${Math.round(shown(L) * 100)}%`);
});

test('free room below the page: more rows of bigger cards', () => {
  const tight = check(23, 1068, 200);
  const roomy = check(23, 1068, 440);
  assert.ok(roomy.cardW > tight.cardW * 1.4, `${roomy.cardW} vs ${tight.cardW}`);
  assert.ok(shown(roomy) >= COMFORT_SHARE);
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

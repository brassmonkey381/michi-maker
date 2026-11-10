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

test('wide desktop tray: one row of big cards, spread, centred block narrower than the tray', () => {
  const L = check(24, 1560, 200);
  assert.equal(L.rows.length, 1);
  assert.ok(L.cardH >= 180, `big cards (${L.cardH})`);
  assert.ok(L.width > 1400, `spread across (${L.width})`);
});

test('1280 desktop: still one row, cards much bigger than the old 78 px', () => {
  const L = check(24, 980, 200);
  assert.ok(L.cardH > 120, `${L.cardH}`);
});

test('phone 390: rows stack so every card keeps a strip', () => {
  const L = check(24, 358, 170);
  assert.ok(L.rows.length >= 2);
  assert.ok(L.cardW >= 56, `no smaller than the old chip (${L.cardW})`);
});

test('few cards: no overlap, a small gap', () => {
  const L = check(4, 1200, 200);
  assert.ok(L.stride > L.cardW, 'gap between cards');
});

test('nothing to lay out', () => {
  assert.equal(handLayout(0, 500, 200).rows.length, 0);
  assert.equal(handLayout(5, 0, 200).rows.length, 0);
});

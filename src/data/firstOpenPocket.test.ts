import assert from 'node:assert/strict';
import { test } from 'node:test';

import { firstOpenPocket, parsePocketParam, walkthroughLanding, wizardEditorHref } from './firstOpenPocket.ts';

const card = (i: number) => ({ row: Math.floor(i / 3), col: i % 3, rowSpan: 1, colSpan: 1 });
const page = (n: number) => ({ rows: 3, cols: 3, slots: Array.from({ length: n }, (_, i) => card(i)) });

test('a 22-card set opens on page three, at its first empty pocket', () => {
  assert.deepEqual(firstOpenPocket([page(9), page(9), page(4)]), { page: 2, row: 1, col: 1 });
  assert.equal(wizardEditorHref('b1', [page(9), page(9), page(4)]), '/binder/b1?edit=1&tip=1&page=3&pocket=1.1');
});

test('every page full: page one, nothing aimed', () => {
  assert.equal(firstOpenPocket([page(9), page(9)]), null);
  assert.equal(wizardEditorHref('b1', [page(9)]), '/binder/b1?edit=1&tip=1');
});

test('a pocket under a card that spans two is not empty', () => {
  const p = { rows: 3, cols: 3, slots: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }] };
  assert.deepEqual(firstOpenPocket([p]), { page: 0, row: 0, col: 2 });
});

test('the pocket param reads back, and nonsense is ignored', () => {
  assert.deepEqual(parsePocketParam('1.2'), { row: 1, col: 2 });
  assert.equal(parsePocketParam('x'), null);
  assert.equal(parsePocketParam(undefined), null);
});

test('MIC-054: a part-filled last page opens with the seeded walkthrough', () => {
  assert.deepEqual(walkthroughLanding('b1', [page(9), page(9), page(4)]), { href: '/binder/b1?edit=1&seeded=wizard&page=3', addPage: false });
  assert.deepEqual(walkthroughLanding('b1', [page(2)]), { href: '/binder/b1?edit=1&seeded=wizard&page=1', addPage: false });
});

test('MIC-054: an exactly full last page asks for one more page and aims at its first pocket', () => {
  assert.deepEqual(walkthroughLanding('b1', [page(9), page(9)]), { href: '/binder/b1?edit=1&tip=1&page=3&pocket=0.0', addPage: true });
});

/**
 * The pinned list is read long after the dates on it, by people deciding what this product is.
 * So it is held to more than the rest of the changelog: it stays short, every item on it can
 * actually be seen, and none of them names a plan or a price that no longer exists.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHANGELOG } from './changelog.ts';

const pinned = CHANGELOG.flatMap((e) => e.items.filter((i) => i.pinned).map((i) => ({ ...i, date: e.date })));

test('the pinned list is a short list', () => {
  assert.ok(pinned.length >= 1, 'nothing is pinned, so the Pinned switch shows an empty page');
  assert.ok(pinned.length <= 20, `${pinned.length} pinned: past twenty it is just the changelog again`);
});

test('every pinned item shows while the sister app is hidden', () => {
  // The page drops an item tagged only for the other product, and any item whose words name it
  // (whats-new.tsx: namesOtherProduct). A pinned item caught by either would vanish silently.
  for (const item of pinned) {
    assert.ok(item.products.includes('michi'), `"${item.head}" is not a michi-maker item`);
    assert.ok(!/tcgscan/i.test(`${item.head} ${item.body}`), `"${item.head}" names the other product`);
  }
});

test('no pinned item names a plan or a price that is gone', () => {
  for (const item of pinned) {
    const words = `${item.head} ${item.body}`;
    assert.ok(!/\bVIP\b/.test(words), `"${item.head}" (${item.date}) still says VIP, which was retired 2026-09-20`);
    // A former PRICE is not checked: "down from $3.99" is history, and honest. A former PLAN is a
    // thing nobody can buy, which is what a reader would act on.
    assert.ok(!/14[- ]day/.test(words), `"${item.head}" still says the trial is 14 days`);
  }
});

test('a headline appears once, so pinning by headline pins one item', () => {
  const heads = CHANGELOG.flatMap((e) => e.items.map((i) => `${i.products.join()}:${i.head}`));
  const twice = heads.filter((h, i) => heads.indexOf(h) !== i);
  assert.deepEqual(twice, []);
});

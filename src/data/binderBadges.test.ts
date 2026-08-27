import assert from 'node:assert/strict';
import { test } from 'node:test';

import { artShare, binderBadges, cardCount } from './binderBadges.ts';
import type { DemoBinder, DemoSlot } from './binderTypes.ts';

const NOW = Date.parse('2026-08-26T00:00:00Z');

let n = 0;
const card = (rowSpan = 1, colSpan = 1): DemoSlot => ({
  id: `c${n++}`,
  row: 0,
  col: 0,
  rowSpan,
  colSpan,
  type: 'card',
  cardId: `card-${n}`,
});
const art = (rowSpan = 1, colSpan = 1): DemoSlot => ({
  id: `a${n++}`,
  row: 0,
  col: 0,
  rowSpan,
  colSpan,
  type: 'artwork',
  imageUrl: 'https://example.test/art.png',
});
const binder = (slots: DemoSlot[], extra: Partial<DemoBinder> = {}): DemoBinder =>
  ({
    id: 'b1',
    title: 'A binder',
    layoutStyle: 'freeform',
    isExample: false,
    pages: [{ id: 'p1', rows: 3, cols: 3, slots }],
    ...extra,
  }) as DemoBinder;

test('art share counts POCKETS, so a sliced artwork weighs what it covers', () => {
  // One artwork across 3 pockets + 3 single cards = 3 of 6 filled pockets are art.
  assert.equal(artShare(binder([art(1, 3), card(), card(), card()])), 0.5);
  // The same artwork counted as one SLOT would have read 1/4 — the bug this guards.
  assert.notEqual(artShare(binder([art(1, 3), card(), card(), card()])), 0.25);
});

test('art share divides by FILLED pockets, not the whole page', () => {
  // Two art pockets on an otherwise empty 3x3: artistic, not 2/9.
  assert.equal(artShare(binder([art(), art()])), 1);
});

test('an empty binder is not artistic, and does not divide by zero', () => {
  assert.equal(artShare(binder([])), 0);
  assert.deepEqual(binderBadges(binder([]), NOW), []);
});

test('Artistic needs 30% of filled pockets', () => {
  const keys = (b: DemoBinder) => binderBadges(b, NOW).map((x) => x.key);
  // 3 art of 10 filled = exactly 30% → earns it (the threshold is inclusive).
  assert.ok(keys(binder([art(), art(), art(), ...Array.from({ length: 7 }, () => card())])).includes('artistic'));
  // 2 of 10 = 20% → does not.
  assert.ok(!keys(binder([art(), art(), ...Array.from({ length: 8 }, () => card())])).includes('artistic'));
});

test('New is measured from made_public_at, and only when it exists', () => {
  const at = (iso: string) => binderBadges(binder([card()], { madePublicAt: iso }), NOW).map((b) => b.key);
  assert.ok(at('2026-08-20T00:00:00Z').includes('new')); // 6 days
  assert.ok(at('2026-08-12T00:00:00Z').includes('new')); // 14 days, inclusive
  assert.ok(!at('2026-08-01T00:00:00Z').includes('new')); // 25 days
  // A local/example binder has never been published and must not be badged new.
  assert.ok(!binderBadges(binder([card()]), NOW).some((b) => b.key === 'new'));
  // Clock skew: a timestamp in the future is brand new, not NaN-dropped.
  assert.ok(at('2026-09-01T00:00:00Z').includes('new'));
  // A malformed timestamp is ignored rather than throwing.
  assert.ok(!at('not-a-date').includes('new'));
});

test('Deep counts cards only — artwork panels are not cards', () => {
  assert.equal(cardCount(binder([card(), card(), art()])), 2);
  const many = Array.from({ length: 100 }, () => card());
  assert.ok(binderBadges(binder(many), NOW).some((b) => b.key === 'deep'));
  assert.ok(!binderBadges(binder(many.slice(0, 99)), NOW).some((b) => b.key === 'deep'));
  // 100 art pockets is not 100 cards.
  assert.ok(
    !binderBadges(binder(Array.from({ length: 100 }, () => art())), NOW).some(
      (b) => b.key === 'deep',
    ),
  );
});

test('a binder can earn several badges at once', () => {
  const slots = [...Array.from({ length: 100 }, () => card()), ...Array.from({ length: 50 }, () => art())];
  const keys = binderBadges(binder(slots, { madePublicAt: '2026-08-25T00:00:00Z' }), NOW).map(
    (b) => b.key,
  );
  assert.deepEqual(keys, ['artistic', 'new', 'deep']);
});

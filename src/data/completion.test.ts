import assert from 'node:assert/strict';
import test from 'node:test';

import type { CollectorCard } from './collectorBinders.ts';
import { binderCompletion, completionOf, pageCompletion, setCompletion } from './completion.ts';

const card = (n: string, extra: Partial<CollectorCard> = {}): CollectorCard =>
  ({ id: `s-${n.split('/')[0]}`, name: `Card ${n}`, number: n, setId: 's', releaseDate: '2026-01-01', rarity: 'Common', evolutionLine: [], ...extra });

test('nothing owned, or no inventory at all, is 0 of the total', () => {
  assert.deepEqual(completionOf(['a', 'b'], new Set()), { have: 0, total: 2, pct: 0 });
  assert.deepEqual(completionOf(['a', 'b'], undefined), { have: 0, total: 2, pct: 0 });
  assert.deepEqual(completionOf([], new Set(['a'])), { have: 0, total: 0, pct: 0 });
});

test('duplicate pockets count twice, percent rounds', () => {
  assert.deepEqual(completionOf(['a', 'a', 'b'], new Set(['a'])), { have: 2, total: 3, pct: 67 });
});

test('a set counts what Set Binders\' "Complete set" builds: secret rares in, non-standard cards out', () => {
  const cards = [card('1/3'), card('2/3'), card('3/3'), card('4/3'), card('5/3', { kind: 'promo' })];
  const c = setCompletion(cards, new Set(['s-1', 's-4', 's-5']));
  assert.equal(c.total, 4, 'the secret rare 4/3 is in, the promo is out');
  assert.equal(c.have, 2);
  assert.equal(c.pct, 50);
});

test('a page counts its card pockets only; a binder adds its pages up', () => {
  const slot = (id: string, type: 'card' | 'artwork' | 'insert', cardId?: string) => ({ id, row: 0, col: 0, rowSpan: 1, colSpan: 1, type, cardId }) as never;
  const p1 = { slots: [slot('1', 'card', 'a'), slot('2', 'card', 'b'), slot('3', 'artwork'), slot('4', 'card')] };
  const p2 = { slots: [slot('5', 'card', 'a'), slot('6', 'insert')] };
  const owned = new Set(['a']);
  assert.deepEqual(pageCompletion(p1, owned), { have: 1, total: 2, pct: 50 });
  assert.deepEqual(pageCompletion(p2, owned), { have: 1, total: 1, pct: 100 });
  assert.deepEqual(binderCompletion([p1, p2], owned), { have: 2, total: 3, pct: 67 });
});

test('to finish adds the market price of every missing pocket, unpriced ones count nothing', async () => {
  const { toFinish } = await import('./completion.ts');
  const prices: Record<string, number> = { a: 1.5, b: 2.25, c: 10 };
  assert.equal(toFinish(['a', 'b', 'b', 'c', 'd'], new Set(['c']), (id) => prices[id]), 6);
  assert.equal(toFinish(['a'], new Set(['a']), (id) => prices[id]), 0);
});

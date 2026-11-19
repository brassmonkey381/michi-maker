import assert from 'node:assert/strict';
import { test } from 'node:test';

import { claimedByEntry, freeCopiesOf, type OwnedEntry } from './ownedCopies.ts';
import { planPull, pocketsOf, pullSummary, type CopySpot } from './pullList.ts';

const entry = (entryId: string, cardId: string, o: Partial<OwnedEntry> = {}): OwnedEntry => ({
  entryId,
  cardId,
  quantity: 1,
  hasScan: false,
  scannedAt: null,
  variant: 'Normal',
  updatedAt: '2026-11-19T00:00:00Z',
  ...o,
});
const spots = (m: Record<string, CopySpot>) => (id: string): CopySpot => m[id] ?? 'loose';
const page = (slots: { id: string; row: number; col: number; cardId?: string; sourceEntryId?: string; type?: string }[]) => ({
  rows: 3,
  cols: 3,
  slots: slots.map((s) => ({ type: 'card', ...s })),
});

test('pockets are numbered the way a person counts them', () => {
  const p = pocketsOf([page([{ id: 'a', row: 0, col: 0 }]), page([{ id: 'b', row: 1, col: 2 }])]);
  assert.deepEqual(p.map((x) => [x.page, x.pocket]), [[1, 1], [2, 6]]);
});

test('a stamped pocket keeps its copy; a free one prefers loose, then a stack, then a binder', () => {
  const entries = [entry('bind', 'pika'), entry('stk', 'pika'), entry('loose', 'pika'), entry('mine', 'mew')];
  const pockets = pocketsOf([
    page([
      { id: 's1', row: 0, col: 0, cardId: 'mew', sourceEntryId: 'mine' },
      { id: 's2', row: 0, col: 1, cardId: 'pika' },
      { id: 's3', row: 0, col: 2, cardId: 'pika' },
      { id: 's4', row: 1, col: 0, cardId: 'pika' },
    ]),
  ]);
  const claimed = claimedByEntry([{ sourceEntryId: 'mine' }]);
  const plan = planPull(pockets, entries, claimed, spots({ bind: 'binder', stk: 'stack' }));
  assert.deepEqual(plan.items.map((i) => [i.slotId, i.entryId]), [['s1', 'mine'], ['s2', 'loose'], ['s3', 'stk'], ['s4', 'bind']]);
  assert.equal(plan.short, 0);
});

test('a copy placed in another binder is not offered; hunted cards are skipped, not short', () => {
  const entries = [entry('only', 'pika')];
  const pockets = pocketsOf([page([{ id: 's1', row: 0, col: 0, cardId: 'pika' }, { id: 's2', row: 0, col: 1, cardId: 'zard' }])]);
  const plan = planPull(pockets, entries, claimedByEntry([{ sourceEntryId: 'only' }]), spots({}));
  assert.deepEqual(plan.items, []);
  assert.equal(plan.short, 1);
  assert.equal(pullSummary(plan), 'No cards from your collection on this binder yet.');
});

test('a lot of two fills two pockets, and after the commit stamps them the counts read placed', () => {
  const entries = [entry('lot', 'pika', { quantity: 2 })];
  const pockets = pocketsOf([page([{ id: 'a', row: 0, col: 0, cardId: 'pika' }, { id: 'b', row: 0, col: 1, cardId: 'pika' }, { id: 'c', row: 0, col: 2, cardId: 'pika' }])]);
  const plan = planPull(pockets, entries, new Map(), spots({}));
  assert.deepEqual(plan.items.map((i) => i.entryId), ['lot', 'lot']);
  assert.equal(plan.short, 1);
  assert.equal(pullSummary(plan), '2 cards to pull. 1 more has no free copy.');
  // What BiBo's commit writes: source_entry_id on each item's pocket.
  const stamped = claimedByEntry(plan.items.map((i) => ({ sourceEntryId: i.entryId })));
  assert.equal(freeCopiesOf('pika', entries, stamped), 0);
});

test('art panels and inserts are never pulled', () => {
  const pockets = pocketsOf([page([{ id: 'x', row: 0, col: 0, cardId: 'pika', type: 'artwork' }])]);
  assert.deepEqual(planPull(pockets, [entry('e', 'pika')], new Map(), spots({})).items, []);
});

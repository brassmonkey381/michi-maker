import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyPending,
  collectionTable,
  filterTable,
  nextPocketState,
  pocketStateOf,
  stepsFor,
  tradeCopyFor,
  publicRows,
  unownedToWant,
  unsettled,
} from './collectionLists.ts';

test('the circle cycles NO > WANT > OWNED > TRADE > NO', () => {
  assert.equal(nextPocketState('no'), 'want');
  assert.equal(nextPocketState('want'), 'owned');
  assert.equal(nextPocketState('owned'), 'trade');
  assert.equal(nextPocketState('trade'), 'no');
});

test('owning beats wanting, and trade needs an owned copy', () => {
  const owned = new Set(['a', 'b']);
  const wanted = new Set(['a', 'c', 'd']);
  const traded = new Set(['b', 'd']);
  assert.equal(pocketStateOf('a', owned, wanted, traded), 'owned');
  assert.equal(pocketStateOf('b', owned, wanted, traded), 'trade');
  assert.equal(pocketStateOf('c', owned, wanted, traded), 'want');
  assert.equal(pocketStateOf('d', owned, wanted, traded), 'want');
  assert.equal(pocketStateOf('e', owned, wanted, traded), 'no');
});

test('each tap runs the writes that move it one step', () => {
  assert.deepEqual(stepsFor('no').map((s) => s.kind), ['addWant']);
  assert.deepEqual(stepsFor('want').map((s) => s.kind), ['removeWant', 'markOwned']);
  assert.deepEqual(stepsFor('owned').map((s) => s.kind), ['markTrade']);
  assert.deepEqual(stepsFor('trade').map((s) => s.kind), ['unmarkTrade', 'unmarkOwned']);
});

test('the trade mark lands on the placed copy, else a plain one before a scanned one', () => {
  const es = [
    { entryId: 'e1', cardId: 'x', hasScan: true },
    { entryId: 'e2', cardId: 'x', hasScan: false },
    { entryId: 'e3', cardId: 'y', hasScan: false },
  ];
  assert.equal(tradeCopyFor('x', 'e1', es)?.entryId, 'e1');
  assert.equal(tradeCopyFor('x', undefined, es)?.entryId, 'e2');
  assert.equal(tradeCopyFor('z', undefined, es), undefined);
});

test('mark every card I do not own as WANT skips owned, already wanted and repeats', () => {
  assert.deepEqual(unownedToWant(['a', 'b', 'c', 'c', ''], new Set(['a']), new Set(['b'])), ['c']);
});

test('the table counts owned | want | trade per card, copies listed, trade clamped to the copy', () => {
  const rows = collectionTable(
    [
      { entryId: 'e1', cardId: 'x', quantity: 3, variant: 'Normal', hasScan: false },
      { entryId: 'e2', cardId: 'x', quantity: 1, variant: 'Holofoil', condition: 'PSA 10', hasScan: true },
      { entryId: 'e3', cardId: 'y', quantity: 1, variant: 'Normal', hasScan: false },
    ],
    [{ cardId: 'x', quantity: 2 }, { cardId: 'z', quantity: 1 }],
    [{ entryId: 'e1', quantity: 5 }],
  );
  const x = rows.find((r) => r.cardId === 'x')!;
  assert.deepEqual([x.owned, x.want, x.trade], [4, 2, 3]);
  assert.deepEqual(x.copies.map((c) => [c.entryId, c.trade]), [['e1', 3], ['e2', 0]]);
  assert.deepEqual(filterTable(rows, 'trade').map((r) => r.cardId), ['x']);
  assert.deepEqual(filterTable(rows, 'want').map((r) => r.cardId), ['x', 'z']);
  assert.equal(filterTable(rows, 'all').length, 3);
});

test('a public profile table counts wants and trades per card, never owned', () => {
  const rows = publicRows({
    wants: [{ card_id: 'a', quantity: 2 }],
    trades: [{ card_id: 'a', quantity: 1 }, { card_id: 'b', quantity: 1 }],
  });
  assert.deepEqual(rows.map((r) => [r.cardId, r.owned, r.want, r.trade]), [['a', 0, 2, 1], ['b', 0, 0, 1]]);
});

test('a tap shows its target at once and never an in-between state, then settles on the real one', () => {
  // WANT -> OWNED: the device drops the want at once, the owned copy arrives a second later.
  const pending = new Map([['c', 'owned' as const]]);
  const steps = [
    { owned: new Set<string>(), wanted: new Set(['c']), traded: new Set<string>() }, // tap
    { owned: new Set<string>(), wanted: new Set<string>(), traded: new Set<string>() }, // want removed
    { owned: new Set(['c']), wanted: new Set<string>(), traded: new Set<string>() }, // owned arrived
  ];
  for (const real of steps) {
    const shown = applyPending(real.owned, real.wanted, real.traded, pending);
    assert.equal(pocketStateOf('c', shown.owned, shown.wanted, shown.traded), 'owned');
  }
  const last = steps[2];
  assert.equal(unsettled(pending, last.owned, last.wanted, last.traded).size, 0);
  assert.equal(unsettled(pending, steps[1].owned, steps[1].wanted, steps[1].traded).size, 1);
});

test('TRADE -> NO never flashes OWNED while the copy is being removed', () => {
  const pending = new Map([['c', 'no' as const]]);
  const midway = applyPending(new Set(['c']), new Set<string>(), new Set<string>(), pending);
  assert.equal(pocketStateOf('c', midway.owned, midway.wanted, midway.traded), 'no');
});

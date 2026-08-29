/**
 * The bug this module was written for, stated as tests: a card you own, placed twice, should be
 * placed once and wished for once — and each pocket should know WHICH of your cards it holds.
 *
 * Run with `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assignCopies,
  availableCopiesOf,
  availableOf,
  claimedByEntry,
  freeCopiesOf,
  type OwnedEntry,
} from './ownedCopies.ts';

function entry(over: Partial<OwnedEntry> & { entryId: string }): OwnedEntry {
  return { cardId: 'energy', quantity: 1, hasScan: false, scannedAt: null, ...over };
}

test('a pocket claiming a copy makes that copy unavailable', () => {
  const entries = [entry({ entryId: 'e1' })];
  const claimed = claimedByEntry([{ sourceEntryId: 'e1' }]);
  assert.equal(freeCopiesOf('energy', entries, claimed), 0);
  assert.deepEqual(availableCopiesOf('energy', entries, claimed), []);
});

test('the reported bug: one owned copy cannot fill five pockets', () => {
  const entries = [entry({ entryId: 'e1' })];
  const ids = ['energy', 'energy', 'energy', 'energy', 'energy'];
  const picks = assignCopies(ids, entries, new Map());
  // One pocket holds the card; the other four are aspirational, and say so by holding no copy.
  assert.deepEqual(picks, ['e1', undefined, undefined, undefined, undefined]);
});

test('a lot of three fills three pockets and no more', () => {
  const entries = [entry({ entryId: 'lot', quantity: 3 })];
  const picks = assignCopies(['energy', 'energy', 'energy', 'energy'], entries, new Map());
  assert.deepEqual(picks, ['lot', 'lot', 'lot', undefined]);
});

test('availability counts claims, not distinct pockets', () => {
  const e = entry({ entryId: 'lot', quantity: 3 });
  const claimed = claimedByEntry([{ sourceEntryId: 'lot' }, { sourceEntryId: 'lot' }]);
  assert.equal(availableOf(e, claimed), 1);
});

test('a batch consumes copies as it goes rather than handing out the same one', () => {
  const entries = [entry({ entryId: 'a' }), entry({ entryId: 'b' })];
  const picks = assignCopies(['energy', 'energy'], entries, new Map());
  assert.equal(new Set(picks).size, 2, 'two pockets, two different copies');
});

test('placements already in binders are respected by a later batch', () => {
  const entries = [entry({ entryId: 'a' }), entry({ entryId: 'b' })];
  const claimed = claimedByEntry([{ sourceEntryId: 'a' }]);
  assert.deepEqual(assignCopies(['energy'], entries, claimed), ['b']);
});

test('a scanned copy is preferred, so the pocket can show the real card', () => {
  const entries = [
    entry({ entryId: 'plain' }),
    entry({ entryId: 'photographed', hasScan: true, scannedAt: '2026-08-01T00:00:00Z' }),
  ];
  assert.deepEqual(assignCopies(['energy'], entries, new Map()), ['photographed']);
});

test('among photographed copies the newest scan wins', () => {
  const entries = [
    entry({ entryId: 'old', hasScan: true, scannedAt: '2026-01-01T00:00:00Z' }),
    entry({ entryId: 'new', hasScan: true, scannedAt: '2026-08-01T00:00:00Z' }),
  ];
  assert.deepEqual(assignCopies(['energy'], entries, new Map()), ['new']);
});

test('identical lots pick in a stable order, never a render-dependent one', () => {
  const a = entry({ entryId: 'aaa' });
  const b = entry({ entryId: 'bbb' });
  assert.deepEqual(assignCopies(['energy'], [a, b], new Map()), ['aaa']);
  assert.deepEqual(assignCopies(['energy'], [b, a], new Map()), ['aaa']);
});

test('a card you own none of is aspirational, not refused', () => {
  const entries = [entry({ entryId: 'e1', cardId: 'something-else' })];
  assert.deepEqual(assignCopies(['energy'], entries, new Map()), [undefined]);
});

test('copies of other cards are never handed to this one', () => {
  const entries = [entry({ entryId: 'e1', cardId: 'charizard' }), entry({ entryId: 'e2' })];
  assert.deepEqual(assignCopies(['energy'], entries, new Map()), ['e2']);
});

test('a claim on a lot that no longer exists reads as zero, not as negative', () => {
  // The lot was deleted in tcgscan while a pocket still points at it.
  const claimed = claimedByEntry([{ sourceEntryId: 'gone' }]);
  assert.equal(freeCopiesOf('energy', [], claimed), 0);
  assert.equal(availableOf(entry({ entryId: 'gone', quantity: 1 }), claimed), 0);
});

test('an over-claimed lot reads zero rather than lending a copy it does not have', () => {
  const e = entry({ entryId: 'lot', quantity: 1 });
  const claimed = claimedByEntry([{ sourceEntryId: 'lot' }, { sourceEntryId: 'lot' }]);
  assert.equal(availableOf(e, claimed), 0);
  assert.deepEqual(assignCopies(['energy'], [e], claimed), [undefined]);
});

test('pockets holding no copy are ignored by the tally', () => {
  const claimed = claimedByEntry([{}, { sourceEntryId: undefined }, { sourceEntryId: 'e1' }]);
  assert.equal(claimed.size, 1);
  assert.equal(claimed.get('e1'), 1);
});

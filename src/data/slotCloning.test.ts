/**
 * Copying a pocket must not copy the card in it — and moving one must not lose it.
 *
 * The reported bug: duplicating a page brought the original's real scans across, which means both
 * pages claimed the same physical cards. The two functions under test are the whole rule, and they
 * differ on exactly one thing, so a test that only checked "ids are fresh" would pass while the
 * cards were being cloned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { duplicatedSlots, movedSlots, type DemoSlot } from './binderTypes.ts';

function slot(over: Partial<DemoSlot> = {}): DemoSlot {
  return {
    id: 'slot-1',
    row: 0,
    col: 0,
    rowSpan: 1,
    colSpan: 1,
    type: 'card',
    cardId: 'zard',
    sourceEntryId: 'entry-1',
    fromCollection: true,
    ...over,
  };
}

test('a duplicated pocket does not claim the card the original holds', () => {
  const [copy] = duplicatedSlots([slot()]);
  assert.equal(copy.sourceEntryId, undefined);
  assert.equal(copy.fromCollection, undefined);
});

test('a duplicated pocket keeps everything that is about the POCKET', () => {
  const src = slot({ rowSpan: 2, colSpan: 2, imageUrl: 'https://x.test/a.png', cardId: 'pika' });
  const [copy] = duplicatedSlots([src]);
  assert.equal(copy.cardId, 'pika');
  assert.equal(copy.rowSpan, 2);
  assert.equal(copy.colSpan, 2);
  assert.equal(copy.imageUrl, 'https://x.test/a.png');
});

test('a MOVED pocket keeps its card: it went somewhere, it did not multiply', () => {
  const [moved] = movedSlots([slot()]);
  assert.equal(moved.sourceEntryId, 'entry-1');
  assert.equal(moved.fromCollection, true);
});

test('both give every slot a fresh id, so nothing overwrites anything on save', () => {
  const src = [slot({ id: 'a' }), slot({ id: 'b', col: 1, sourceEntryId: 'entry-2' })];
  for (const out of [duplicatedSlots(src), movedSlots(src)]) {
    const ids = out.map((x) => x.id);
    assert.equal(new Set(ids).size, 2);
    assert.equal(ids.includes('a'), false);
    assert.equal(ids.includes('b'), false);
  }
});

test('duplicating leaves the source untouched', () => {
  const src = slot();
  duplicatedSlots([src]);
  assert.equal(src.sourceEntryId, 'entry-1', 'the original still holds its card');
  assert.equal(src.fromCollection, true);
});

test('a pocket that claimed nothing duplicates as it was', () => {
  const [copy] = duplicatedSlots([slot({ sourceEntryId: undefined, fromCollection: undefined })]);
  assert.equal(copy.sourceEntryId, undefined);
  assert.equal(copy.fromCollection, undefined);
  assert.equal(copy.cardId, 'zard');
});

test('an artwork pocket carries no claim either way', () => {
  const art = slot({
    type: 'artwork',
    cardId: undefined,
    imageUrl: 'https://x.test/art.png',
    sourceEntryId: undefined,
    fromCollection: undefined,
  });
  assert.equal(duplicatedSlots([art])[0].imageUrl, 'https://x.test/art.png');
  assert.equal(movedSlots([art])[0].imageUrl, 'https://x.test/art.png');
});

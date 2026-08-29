/**
 * What a duplicated binder keeps, and what it must not.
 *
 * A copy is a new binder that happens to look like an old one. Two per-slot stamps are true of
 * the ORIGINAL and false of any copy: which owned card a pocket photographs, and whether the
 * pocket consumes one of those owned copies. Both have to be dropped at clone time, because
 * nothing downstream can tell a duplicate's slot from its source's.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cloneBinder, type DemoBinder } from './binderTypes.ts';

function binderWith(slot: Record<string, unknown>): DemoBinder {
  return {
    id: 'src',
    title: 'Source',
    layoutStyle: 'freeform',
    isExample: false,
    pages: [
      {
        id: 'p1',
        rows: 3,
        cols: 3,
        slots: [{ id: 's1', row: 0, col: 0, rowSpan: 1, colSpan: 1, type: 'card', ...slot }],
      },
    ],
  } as unknown as DemoBinder;
}

const slotOf = (b: DemoBinder) => b.pages[0].slots[0];

test('a copy shows catalog art, not the owner’s scans', () => {
  // sourceEntryId names one physical card the owner scanned. A copy has no claim to that
  // photograph — carried over, two binders would display the same scuffs and sleeve glare.
  const clone = cloneBinder(binderWith({ cardId: 'zard', sourceEntryId: 'entry-1' }));
  assert.equal(slotOf(clone).sourceEntryId, undefined);
  assert.equal(slotOf(clone).cardId, 'zard');
});

test('a copy does not claim to consume owned copies', () => {
  // Owning three and duplicating the binder holding them must not read as having placed six:
  // the free-copy maths behind "fill from my collection" would go negative and the reclaim list
  // would offer copies that are not there.
  const clone = cloneBinder(binderWith({ cardId: 'zard', fromCollection: true }));
  assert.equal(slotOf(clone).fromCollection, undefined);
});

test('everything else about the pocket survives the copy', () => {
  const clone = cloneBinder(
    binderWith({
      cardId: 'zard',
      rowSpan: 2,
      colSpan: 2,
      imageUrl: 'https://example.test/art.png',
      imageFit: 'contain',
      sourceEntryId: 'entry-1',
      fromCollection: true,
    }),
  );
  const s = slotOf(clone);
  assert.equal(s.rowSpan, 2);
  assert.equal(s.colSpan, 2);
  assert.equal(s.imageUrl, 'https://example.test/art.png');
  assert.equal(s.imageFit, 'contain');
  // Fresh ids throughout: a copy owns ids nothing else has ever held.
  assert.notEqual(clone.id, 'src');
  assert.notEqual(clone.pages[0].id, 'p1');
  assert.notEqual(s.id, 's1');
});

test('a copy is private and is neither the demo nor an example', () => {
  const clone = cloneBinder({ ...binderWith({ cardId: 'x' }), isPublic: true, isDemo: true } as DemoBinder);
  assert.equal(clone.isPublic, false);
  assert.equal(clone.isDemo, false);
  assert.equal(clone.isExample, false);
});

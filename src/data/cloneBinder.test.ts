/**
 * What a duplicated binder keeps, and what it must not — and the opposite rule for a re-mint.
 *
 * A copy is a new binder that happens to look like an old one. Two per-slot stamps are true of
 * the ORIGINAL and false of any copy: which owned card a pocket photographs, and whether the
 * pocket consumes one of those owned copies. Both have to be dropped at clone time, because
 * nothing downstream can tell a duplicate's slot from its source's.
 *
 * remintBinderIds is the MOVE twin: the guest→account migration re-creates the SAME binder under
 * fresh ids, so everything cloneBinder strips must survive it — routing the migration through
 * cloneBinder was the defect where upgrading silently unclaimed every pocket.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cloneBinder, remintBinderIds, type DemoBinder } from './binderTypes.ts';

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

test('a re-mint keeps the claims - migration is a move, not a copy', () => {
  // Same uid, same portfolio entries, same physical cards in the same pockets: only the ids are
  // new. Stripping the stamp here is how a converted guest's binder forgot every copy it held.
  const fresh = remintBinderIds(
    binderWith({ cardId: 'zard', sourceEntryId: 'entry-1', fromCollection: true }),
  );
  const s = slotOf(fresh);
  assert.equal(s.sourceEntryId, 'entry-1');
  assert.equal(s.fromCollection, true);
  assert.equal(s.cardId, 'zard');
  // Fresh ids throughout, exactly like a clone: no row is ever shared with the guest identity.
  assert.notEqual(fresh.id, 'src');
  assert.notEqual(fresh.pages[0].id, 'p1');
  assert.notEqual(s.id, 's1');
});

test('a re-mint keeps what the binder IS: demo, visibility, lock', () => {
  const fresh = remintBinderIds({
    ...binderWith({ cardId: 'x' }),
    isPublic: true,
    isDemo: true,
    locked: true,
  } as DemoBinder);
  assert.equal(fresh.isPublic, true, 'a public binder stays public through the upgrade');
  assert.equal(fresh.isDemo, true, 'the demo showcase stays the demo, not a counted real binder');
  assert.equal(fresh.locked, true);
});

test('a re-mint remaps the share-preview picks onto the new page ids', () => {
  const source = { ...binderWith({ cardId: 'x' }), sharePageIds: ['p1', 'ghost'] } as DemoBinder;
  const fresh = remintBinderIds(source);
  // The surviving pick follows its page to the page's new id; a pick naming no page is dropped
  // rather than carried as a dangling id.
  assert.deepEqual(fresh.sharePageIds, [fresh.pages[0].id]);
  const empty = remintBinderIds({ ...binderWith({ cardId: 'x' }), sharePageIds: ['ghost'] } as DemoBinder);
  assert.equal(empty.sharePageIds, undefined, 'no surviving picks means auto, not []');
});

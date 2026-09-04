/**
 * An undo must write back exactly what it changed. The whole-binder rewrite it used to do is how
 * a page nobody touched was overwritten from a stale copy; these pin the page-grained answer.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { diffSnapshots } from './binderSync.ts';

const page = (id: string) => ({ id });
const binder = (id: string, pages: { id: string }[], extra: Record<string, unknown> = {}) => ({ id, isExample: false, pages, ...extra });

test('an untouched binder is not written at all', () => {
  const a = binder('b', [page('p1'), page('p2')]);
  const d = diffSnapshots([a], [a]);
  assert.deepEqual(d, { full: [], scoped: [], removed: [] });
});

test('one edited page is written alone, and the binder row is left alone', () => {
  const p1 = page('p1');
  const before = binder('b', [p1, page('p2')], { title: 'T' });
  const after = binder('b', [p1, page('p2')], { title: 'T' }); // p2 is a new object: edited
  const d = diffSnapshots([before], [after]);
  assert.equal(d.full.length, 0);
  assert.deepEqual(d.scoped.map((s) => ({ meta: s.meta, pageIds: s.pageIds })), [{ meta: false, pageIds: ['p2'] }]);
});

test('a title change writes the binder row and no page', () => {
  const p1 = page('p1');
  const d = diffSnapshots([binder('b', [p1], { title: 'old' })], [binder('b', [p1], { title: 'new' })]);
  assert.deepEqual(d.scoped.map((s) => ({ meta: s.meta, pageIds: s.pageIds })), [{ meta: true, pageIds: [] }]);
});

test('a changed page list — added, removed or moved — is written whole', () => {
  const p1 = page('p1');
  const p2 = page('p2');
  assert.equal(diffSnapshots([binder('b', [p1, p2])], [binder('b', [p2, p1])]).full.length, 1);
  assert.equal(diffSnapshots([binder('b', [p1, p2])], [binder('b', [p1])]).full.length, 1);
  assert.equal(diffSnapshots([binder('b', [p1])], [binder('b', [p1, p2])]).full.length, 1);
});

test('a binder new to the snapshot is written whole; one that vanished is removed', () => {
  const a = binder('a', [page('p')]);
  const b = binder('b', [page('q')]);
  const d = diffSnapshots([a], [b]);
  assert.deepEqual(d.full.map((x) => x.id), ['b']);
  assert.deepEqual(d.removed.map((x) => x.id), ['a']);
});

test('example binders are never written or removed', () => {
  const ex = { ...binder('ex', [page('p')]), isExample: true };
  const d = diffSnapshots([ex], [{ ...ex, pages: [page('p')] }]);
  assert.deepEqual(d, { full: [], scoped: [], removed: [] });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sortByRecentEdit } from './binderTypes.ts';

test('a shelf lists the most recently edited binder first, undated ones last in their own order', () => {
  const shelf = [
    { id: 'old', updatedAt: '2026-08-01T10:00:00.000Z' },
    { id: 'example-a' },
    { id: 'new', updatedAt: '2026-09-06T08:30:00.000Z' },
    { id: 'example-b' },
    { id: 'mid', updatedAt: '2026-09-01T00:00:00.000Z' },
  ];
  assert.deepEqual(sortByRecentEdit(shelf).map((b) => b.id), ['new', 'mid', 'old', 'example-a', 'example-b']);
});

test('sorting does not mutate the store order', () => {
  const shelf = [{ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }, { id: 'b', updatedAt: '2026-02-01T00:00:00.000Z' }];
  sortByRecentEdit(shelf);
  assert.deepEqual(shelf.map((b) => b.id), ['a', 'b']);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupMakers } from './makers.ts';

const row = (id: string, author: string, likes: number, at: string, pages = 1) => ({ binder_id: id, author_name: author, like_count: likes, made_public_at: at, page_count: pages });

test('top makers rank by their public pages, likes only breaking ties', () => {
  const m = groupMakers([row('a', 'ann', 50, '2026-11-01', 2), row('b', 'bo', 1, '2026-11-02', 9), row('c', 'ann', 40, '2026-11-03', 3), row('d', 'cy', 9, '2026-11-03', 5)], 'pages');
  assert.deepEqual(m.map((x) => [x.name, x.pages]), [['bo', 9], ['ann', 5], ['cy', 5]]);
});

test('a binder in both rankings counts once', () => {
  const m = groupMakers([row('a', 'ann', 5, '2026-11-01', 4), row('a', 'ann', 5, '2026-11-01', 4)], 'pages');
  assert.equal(m[0].pages, 4);
});

test('recently active makers rank by their newest binder', () => {
  const m = groupMakers([row('a', 'ann', 5, '2026-11-01'), row('b', 'bo', 8, '2026-11-05'), row('c', 'ann', 4, '2026-11-03')], 'recent');
  assert.deepEqual(m.map((x) => x.name), ['bo', 'ann']);
});

test('the official account is left out and house personas go last', () => {
  const m = groupMakers([row('a', 'michimaker', 99, '2026-11-09'), row('b', 'fakemichi', 50, '2026-11-09'), row('c', 'cy', 1, '2026-11-01')], 'pages');
  assert.deepEqual(m.map((x) => x.name), ['cy', 'fakemichi']);
});

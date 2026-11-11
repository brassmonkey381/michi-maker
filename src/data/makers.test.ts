import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupMakers } from './makers.ts';

const row = (id: string, author: string, likes: number, at: string) => ({ binder_id: id, author_name: author, like_count: likes, made_public_at: at });

test('top makers rank by the likes their binders hold together', () => {
  const m = groupMakers([row('a', 'ann', 5, '2026-11-01'), row('b', 'bo', 8, '2026-11-02'), row('c', 'ann', 4, '2026-11-03')], 'likes');
  assert.deepEqual(m.map((x) => [x.name, x.likes, x.rows.length]), [['ann', 9, 2], ['bo', 8, 1]]);
});

test('recently active makers rank by their newest binder', () => {
  const m = groupMakers([row('a', 'ann', 5, '2026-11-01'), row('b', 'bo', 8, '2026-11-05'), row('c', 'ann', 4, '2026-11-03')], 'recent');
  assert.deepEqual(m.map((x) => x.name), ['bo', 'ann']);
});

test('the official account is left out and house personas go last', () => {
  const m = groupMakers([row('a', 'michimaker', 99, '2026-11-09'), row('b', 'fakemichi', 50, '2026-11-09'), row('c', 'cy', 1, '2026-11-01')], 'likes');
  assert.deepEqual(m.map((x) => x.name), ['cy', 'fakemichi']);
});

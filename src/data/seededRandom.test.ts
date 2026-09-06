import assert from 'node:assert/strict';
import { test } from 'node:test';

import { seedOf, seededRandom } from './seededRandom.ts';

test('the same seed replays the same sequence; a different seed does not', () => {
  const a = seededRandom('story:ivy_underleaf');
  const b = seededRandom('story:ivy_underleaf');
  const c = seededRandom('story:cloudwatcher');
  const seqA = Array.from({ length: 8 }, () => a.next());
  const seqB = Array.from({ length: 8 }, () => b.next());
  const seqC = Array.from({ length: 8 }, () => c.next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('int, range, pick and chance stay inside their bounds', () => {
  const r = seededRandom(42);
  for (let i = 0; i < 200; i += 1) {
    const n = r.int(5);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 5);
    const x = r.range(-3, 3);
    assert.ok(x >= -3 && x < 3);
    assert.ok(['a', 'b', 'c'].includes(r.pick(['a', 'b', 'c'])!));
  }
  assert.equal(r.int(0), 0);
  assert.equal(r.pick([]), undefined);
  assert.equal(seededRandom('x').chance(0), false);
  assert.equal(seededRandom('x').chance(1), true);
});

test('seedOf folds strings and numbers to a 32-bit integer', () => {
  assert.equal(seedOf('abc'), seedOf('abc'));
  assert.notEqual(seedOf('abc'), seedOf('abd'));
  assert.equal(seedOf(7), seedOf('7'));
  assert.ok(seedOf('anything') >= 0 && seedOf('anything') <= 0xffffffff);
});

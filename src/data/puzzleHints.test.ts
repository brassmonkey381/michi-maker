import assert from 'node:assert/strict';
import test from 'node:test';

import { CLUES, hintFor, hintGiveaways } from './puzzleHints.ts';
import { SYNONYM_FAMILIES } from './puzzleSynonyms.ts';

/** Every word the grader could accept for ANY answer: the clue keys and every synonym. */
const forbidden = new Set<string>();
for (const k of Object.keys(CLUES)) forbidden.add(k);
for (const words of Object.values(SYNONYM_FAMILIES)) for (const w of words) forbidden.add(w);
const bare = (w: string) => (w.endsWith('s') ? w.slice(0, -1) : w);
const forbiddenBare = new Set([...forbidden].map(bare));

test('NO CLUE CONTAINS A WORD THE GRADER ACCEPTS, for any answer, not only its own (owner, 2026-10-13)', () => {
  // Stricter than hintGiveaways on purpose: a clue is reused beside every other answer, so it may
  // not name any answer word at all, or the clue for "trees" could say "forest" and give away the
  // other half of a "forest + rocks" puzzle.
  for (const [key, clue] of Object.entries(CLUES)) {
    for (const token of clue.split(' ')) {
      assert.ok(!forbidden.has(token) && !forbiddenBare.has(bare(token)), `clue for ${key} says "${token}"`);
    }
    assert.ok(!clue.includes(','), `clue for ${key} has a comma; two clues are joined by one`);
    assert.equal(clue, clue.toLowerCase(), `clue for ${key} is not lower case`);
  }
});

test('two clues make one sentence, in the order the puzzle lists its answers', () => {
  assert.equal(hintFor(['forest', 'river']), 'Deep among the trunks, and a current running past.');
  assert.equal(hintFor(['river', 'forest']), 'A current running past, and deep among the trunks.');
  assert.equal(hintFor(['Sky']), 'Look up.');
});

test('a theme with no clue yields no hint rather than half of one', () => {
  assert.equal(hintFor(['forest', 'zeppelin']), null);
});

test('hintGiveaways names the accepted words a hand-written hint leaks', () => {
  assert.deepEqual(hintGiveaways('A village in winter.', ['snow', 'town']), ['village', 'winter']);
  assert.deepEqual(hintGiveaways('White puffs around a high peak.', ['clouds', 'mountain']), ['peak']);
  assert.deepEqual(hintGiveaways('Trunks and boulders.', ['forest', 'rocks']), ['boulders']);
  assert.deepEqual(hintGiveaways('Rooftops in the cold season.', ['snow', 'town']), []);
  for (const pair of [['forest', 'rocks'], ['city', 'sky'], ['clouds', 'sunset'], ['cave', 'light']]) {
    assert.deepEqual(hintGiveaways(hintFor(pair)!, pair), [], pair.join('+'));
  }
});

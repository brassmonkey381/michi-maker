import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SYNONYM_FAMILIES, familyList, sameFamily, synonymFamily } from './puzzleSynonyms.ts';

/**
 * The scenario the owner raised on 2026-09-26, verbatim: "someone getting it wrong for guessing
 * 'forest, lake' then the answer is 'tree, water'". Both halves have to land.
 */
test('the owner\'s example: forest/lake guessed against tree/water', () => {
  assert.equal(sameFamily('forest', 'tree'), true);
  assert.equal(sameFamily('lake', 'water'), true);
});

test('the words the audit caught on real scheduled puzzles', () => {
  assert.equal(sameFamily('trees', 'forest'), true);   // 9 of 9 cards, 2026-09-27
  assert.equal(sameFamily('ice', 'snow'), true);       // 7 of 9 cards, 2026-09-30
  assert.equal(sameFamily('sky', 'clouds'), true);     // 6 of 9 cards, 2026-10-02
});

test('plurals resolve either way round', () => {
  assert.equal(sameFamily('tree', 'trees'), true);
  assert.equal(sameFamily('flowers', 'flower'), true);
  assert.equal(sameFamily('mountains', 'mountain'), true);
  assert.equal(synonymFamily('clouds'), 'sky');
});

test('unrelated words stay unrelated', () => {
  // These are the near misses that must NOT pass, or the game stops meaning anything.
  assert.equal(sameFamily('night', 'light'), false);
  assert.equal(sameFamily('fire', 'water'), false);
  assert.equal(sameFamily('city', 'house'), false);
  assert.equal(sameFamily('cup', 'food'), false);      // on 7 of 9 cards and still not food
  assert.equal(sameFamily('kitchen', 'house'), false); // a room in one is not the thing itself
});

test('a word in no family matches nothing, including itself by family', () => {
  assert.equal(synonymFamily('food'), null);
  assert.equal(synonymFamily('bicycle'), null);
  assert.equal(sameFamily('food', 'food'), false, 'identical words are handled by the exact rule, not this one');
  assert.equal(sameFamily('', 'water'), false);
});

test('input is taken as typed, punctuation and case and all', () => {
  assert.equal(sameFamily('  Forest!  ', 'TREE'), true);
  assert.equal(synonymFamily('   '), null);
});

/**
 * THE INVARIANT THAT MAKES SOFT MATCHING SAFE. Two words in one family must never be the two
 * answers of one puzzle: a single guess would satisfy either, so it could solve half the puzzle
 * twice and the second theme would be unreachable. fill-queue enforces it when it builds a pair;
 * this asserts the list it enforces against is actually partitioned.
 */
test('families are disjoint, so no word can belong to two of them', () => {
  const seen = new Map<string, string>();
  for (const { family, words } of familyList()) {
    for (const w of words) {
      const already = seen.get(w);
      assert.equal(already, undefined, `"${w}" is in both ${already} and ${family}`);
      seen.set(w, family);
    }
  }
});

test('every family is keyed on a word it contains, so the family name is itself guessable', () => {
  for (const { family, words } of familyList()) {
    assert.ok(words.includes(family), `family "${family}" does not list its own name`);
    assert.ok(words.length > 1, `family "${family}" has nothing to match against`);
  }
});

test('the list is lower case and free of punctuation, which the seed relies on', () => {
  for (const [family, words] of Object.entries(SYNONYM_FAMILIES)) {
    assert.match(family, /^[a-z]+$/);
    for (const w of words) assert.match(w, /^[a-z]+$/, `"${w}" in ${family} is not a plain lower-case word`);
  }
});

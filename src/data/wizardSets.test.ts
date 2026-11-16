import assert from 'node:assert/strict';
import { test } from 'node:test';

import { wizardSetLanguage, withoutEmptySet } from './wizardSets.ts';

test('a Japanese set asks for Japanese cards (City Gym Decks, Base -JP)', () => {
  assert.equal(wizardSetLanguage('Base -JP'), 'ja');
  assert.equal(wizardSetLanguage('Scarlet & Violet -JP'), 'ja');
  assert.equal(wizardSetLanguage('Diamond & Pearl -jp'), 'ja');
});

test('an English set asks for English cards', () => {
  assert.equal(wizardSetLanguage('Base'), 'en');
  assert.equal(wizardSetLanguage('Scarlet & Violet'), 'en');
  assert.equal(wizardSetLanguage(''), 'en');
  assert.equal(wizardSetLanguage(null), 'en');
});

test('a set that loads no cards leaves the list', () => {
  const sets = [{ id: '24175', name: 'City Gym Decks' }, { id: '1', name: 'Base Set' }];
  assert.deepEqual(withoutEmptySet(sets, '24175').map((s) => s.id), ['1']);
  assert.equal(withoutEmptySet(sets, 'nope').length, 2);
});

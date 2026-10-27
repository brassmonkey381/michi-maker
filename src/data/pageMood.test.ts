import assert from 'node:assert/strict';
import { test } from 'node:test';

import { moodQuery, pageMood } from './pageMood.ts';

test('a page of one type takes that type, ignoring card classes', () => {
  const m = pageMood([['Pokémon', 'Water'], ['Water'], ['Water', 'Basic'], ['Trainer']]);
  assert.equal(m.type, 'water');
  assert.equal(moodQuery(m, 0), 'ocean waves');
  assert.equal(moodQuery(m, 1), 'underwater sunlight rays');
  assert.equal(moodQuery(m, 2), 'ocean waves');
});

test('a leading type needs two cards and two fifths of the typed ones', () => {
  assert.equal(pageMood([['Fire'], ['Water'], ['Grass'], ['Psychic'], ['Metal']]).type, null);
  assert.equal(pageMood([['Fire'], ['Fire'], ['Water'], ['Grass'], ['Psychic']]).type, 'fire');
  assert.equal(pageMood([['Fire']]).type, null);
});

test('a page with no Pokémon is neutral, and ties go alphabetically', () => {
  assert.deepEqual(pageMood([['Trainer'], ['Energy']]), { type: null, scenes: ['colorful bokeh lights', 'abstract light texture'] });
  assert.equal(pageMood([['Water'], ['Water'], ['Fire'], ['Fire']]).type, 'fire');
});

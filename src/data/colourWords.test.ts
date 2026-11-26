import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COLOUR_WORDS, colourWordIn } from './colourWords.ts';

test('a plain colour, a synonym and a shaded colour all name the family on their own', () => {
  assert.deepEqual(colourWordIn('green'), { family: 'green', onlyColour: true });
  assert.deepEqual(colourWordIn('Emerald'), { family: 'green', onlyColour: true });
  assert.deepEqual(colourWordIn('dark green'), { family: 'green', onlyColour: true });
  assert.deepEqual(colourWordIn('pastel pink'), { family: 'pink', onlyColour: true });
  assert.deepEqual(colourWordIn('forest green'), { family: 'green', onlyColour: true });
  assert.deepEqual(colourWordIn('  lavender  '), { family: 'purple', onlyColour: true });
});

test('a colour inside a longer query is found but does not lead', () => {
  assert.deepEqual(colourWordIn('green forest'), { family: 'green', onlyColour: false });
  assert.deepEqual(colourWordIn('Black Kyurem'), { family: 'black', onlyColour: false });
});

test('the first family named wins', () => {
  assert.deepEqual(colourWordIn('red and blue'), { family: 'red', onlyColour: true });
});

test('no colour word, no match; a word containing one is not a match', () => {
  assert.equal(colourWordIn('pikachu'), null);
  assert.equal(colourWordIn('greninja'), null);
  assert.equal(colourWordIn('redraw'), null);
  assert.equal(colourWordIn(''), null);
});

test('every word belongs to one family only', () => {
  const seen = new Map<string, string>();
  for (const [family, words] of Object.entries(COLOUR_WORDS)) {
    for (const w of words) {
      assert.equal(seen.get(w), undefined, `${w} is in ${seen.get(w)} and ${family}`);
      seen.set(w, family);
    }
  }
});

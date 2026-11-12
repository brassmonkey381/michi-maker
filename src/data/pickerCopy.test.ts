/**
 * Hand Search (owner, 2026-11-12): opened from the hand, the browser and its card sheet speak about
 * the hand, never about the pocket the editor last touched.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickerPrimaryLabel, pickerSelectedCard, pickerTitle } from './pickerCopy.ts';

const blastoise = { id: 'xy-blastoise', name: 'M Blastoise EX' };

test('from the hand: title and button say hand, whatever pocket is behind', () => {
  assert.equal(pickerTitle('hand', true), 'Add to your hand');
  assert.equal(pickerTitle('hand', false), 'Add to your hand');
  assert.equal(pickerPrimaryLabel('hand', 'sigilyph', blastoise), 'Add to hand');
});

test('from the hand: no pocket card is carried in (no highlight, no "in this pocket" chip)', () => {
  assert.equal(pickerSelectedCard('hand', { type: 'card', cardId: blastoise.id }), undefined);
});

test('from a pocket: unchanged', () => {
  assert.equal(pickerTitle('pocket', true), 'Edit pocket');
  assert.equal(pickerTitle('pocket', false), 'Add to pocket');
  assert.equal(pickerPrimaryLabel('pocket', 'sigilyph', blastoise), 'Replace “M Blastoise EX”');
  assert.equal(pickerPrimaryLabel('pocket', blastoise.id, blastoise), 'Place in pocket');
  assert.equal(pickerPrimaryLabel('pocket', 'sigilyph'), 'Place in pocket');
  assert.equal(pickerSelectedCard('pocket', { type: 'card', cardId: blastoise.id }), blastoise.id);
});

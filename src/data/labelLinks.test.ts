/**
 * A tapped label must become exactly the search that filters to it, in the browse grammar, or
 * nothing at all when the card has no such fact.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { labelIsProductLink, labelQuery } from './labelLinks.ts';

const card = {
  id: '610758',
  illustrator: 'Mitsuhiro Arita',
  setName: 'Evolving Skies',
  seriesId: 'SWSH',
  number: '120/203',
  rarity: 'Illustration Rare',
  stage: 'Basic',
  releaseDate: '2021-08-27',
};

test('each label becomes the field search that filters to it', () => {
  assert.equal(labelQuery('artist', card), 'artist:"Mitsuhiro Arita"');
  assert.equal(labelQuery('set', card), 'set:"Evolving Skies"');
  assert.equal(labelQuery('series', card), 'series:SWSH');
  assert.equal(labelQuery('rarityCode', card), 'rarity:"Illustration Rare"');
  assert.equal(labelQuery('stage', card), 'stage:Basic');
  assert.equal(labelQuery('released', card), 'year:2021');
});

test('a card number is only meaningful with its set', () => {
  assert.equal(labelQuery('number', card), 'set:"Evolving Skies" num:120/203');
  assert.equal(labelQuery('number', { ...card, setName: undefined }), null);
});

test('values are quoted only when they need it, and quotes inside are dropped', () => {
  assert.equal(labelQuery('artist', { ...card, illustrator: 'Arita' }), 'artist:Arita');
  assert.equal(labelQuery('set', { ...card, setName: 'Team "Rocket"' }), 'set:"Team Rocket"');
});

test('a missing fact is no link, and the price is the product page', () => {
  assert.equal(labelQuery('artist', { id: '1' }), null);
  assert.equal(labelQuery('released', { id: '1', releaseDate: 'soon' }), null);
  assert.equal(labelIsProductLink('price'), true);
  assert.equal(labelIsProductLink('artist'), false);
  assert.equal(labelQuery('price', card), null);
});

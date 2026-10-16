import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeComposeFilter, filterActive, frameOf, matchesComposeFilter } from './composeFilter.ts';

const card = (fullArtKind: string, types: string[] = []) => ({ fullArtKind, types });

test('a card is windowed, full art, or an illustration rare by its art kind', () => {
  assert.equal(frameOf(''), 'window');
  assert.equal(frameOf('scene_tagged'), 'window');
  assert.equal(frameOf(undefined), 'window');
  assert.equal(frameOf('named_full_art'), 'full');
  assert.equal(frameOf('measured'), 'full');
  assert.equal(frameOf('double_rare'), 'full');
  assert.equal(frameOf('illustration_rare'), 'illustration');
  assert.equal(frameOf('special_illustration_rare'), 'illustration');
});

test('an empty filter passes everything and reads as inactive', () => {
  assert.ok(matchesComposeFilter(card(''), undefined));
  assert.ok(matchesComposeFilter(card(''), {}));
  assert.ok(matchesComposeFilter(card(''), { frame: 'all', types: [] }));
  assert.ok(!filterActive({ frame: 'all', types: [] }));
  assert.ok(filterActive({ frame: 'window' }));
  assert.ok(filterActive({ types: ['Fire'] }));
});

test('full art includes illustration rares; illustration rares exclude the rest', () => {
  assert.ok(matchesComposeFilter(card('illustration_rare'), { frame: 'full' }));
  assert.ok(matchesComposeFilter(card('named_full_art'), { frame: 'full' }));
  assert.ok(!matchesComposeFilter(card('scene_tagged'), { frame: 'full' }));
  assert.ok(matchesComposeFilter(card('special_illustration_rare'), { frame: 'illustration' }));
  assert.ok(!matchesComposeFilter(card('named_full_art'), { frame: 'illustration' }));
  assert.ok(matchesComposeFilter(card(''), { frame: 'window' }));
  assert.ok(!matchesComposeFilter(card('measured'), { frame: 'window' }));
});

test('types OR together, ignore case, and stack with the frame', () => {
  assert.ok(matchesComposeFilter(card('', ['Fire']), { types: ['Fire', 'Water'] }));
  assert.ok(matchesComposeFilter(card('', ['water']), { types: ['Water'] }));
  assert.ok(!matchesComposeFilter(card('', ['Grass']), { types: ['Fire', 'Water'] }));
  assert.ok(matchesComposeFilter(card('illustration_rare', ['Fire']), { frame: 'illustration', types: ['Fire'] }));
  assert.ok(!matchesComposeFilter(card('scene_tagged', ['Fire']), { frame: 'illustration', types: ['Fire'] }));
});

test('the filter describes itself in the person\'s words', () => {
  assert.equal(describeComposeFilter(undefined), '');
  assert.equal(describeComposeFilter({ frame: 'all' }), '');
  assert.equal(describeComposeFilter({ frame: 'window' }), 'windowed');
  assert.equal(describeComposeFilter({ types: ['Fire', 'Water'] }), 'Fire or Water');
  assert.equal(describeComposeFilter({ frame: 'illustration', types: ['Fire'] }), 'Fire, illustration rares');
});

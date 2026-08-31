/**
 * These two functions exist to make labels fit in a space that is already too small, so the thing
 * worth testing is that they actually shorten — and that they never shorten a name into a lie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seriesCode, setDisplayName } from './seriesCode.ts';

test('the two that no rule can derive together', () => {
  // Identical "X & Y" shapes, different conventions. This pair is the entire reason the table
  // exists instead of an algorithm.
  assert.equal(seriesCode('Sword & Shield'), 'SWSH');
  assert.equal(seriesCode('Scarlet & Violet'), 'SV');
});

test('every series the catalogue publishes has a short form', () => {
  const published = [
    'Promos & Miscellaneous',
    'Mega Evolution',
    'Scarlet & Violet',
    'Sword & Shield',
    'Sun & Moon',
    'XY',
    'E-Card',
    'Black & White',
    'Platinum',
    'Diamond & Pearl',
    'EX',
    'Gym',
    'Base',
    'HeartGold & SoulSilver',
    'Neo',
    'Other',
    'POP',
  ];
  for (const name of published) {
    const code = seriesCode(name);
    assert.ok(code.length > 0, `${name} produced nothing`);
    // Wide enough to read, narrow enough for a chip on a pocket.
    assert.ok(code.length <= 5, `${name} → ${code} is too wide for a chip`);
    assert.ok(code.length <= name.length, `${name} → ${code} is not shorter`);
  }
});

test('a series nobody has written a short form for still shows something', () => {
  // Upstream can add a series at any time; a blank chip would look like a bug.
  assert.equal(seriesCode('Frost & Flame'), 'FF');
  assert.equal(seriesCode('Some Very Long New Series Name'), 'SVLN', 'capped at four');
});

test('no name, no chip', () => {
  assert.equal(seriesCode(''), '');
  assert.equal(seriesCode('   '), '');
  assert.equal(seriesCode(undefined), '');
  assert.equal(seriesCode(null), '');
});

test('the set shows its own name, with the prefix the series chip already carries removed', () => {
  assert.equal(setDisplayName('SWSH04: Vivid Voltage'), 'Vivid Voltage');
  assert.equal(setDisplayName('SV02: Paldea Evolved'), 'Paldea Evolved');
  assert.equal(setDisplayName('SWSH01: Sword & Shield Base Set'), 'Sword & Shield Base Set');
});

test('a set with no prefix is left exactly as it is', () => {
  assert.equal(setDisplayName("Champion's Path"), "Champion's Path");
  assert.equal(setDisplayName('Shining Fates'), 'Shining Fates');
});

test('a colon that belongs to the title keeps both halves', () => {
  // "Shining Fates: Shiny Vault" is a name, not a code and a name — stripping to "Shiny Vault"
  // would drop the set it belongs to.
  assert.equal(setDisplayName('Shining Fates: Shiny Vault'), 'Shining Fates: Shiny Vault');
  assert.equal(setDisplayName('SV: Scarlet & Violet 151'), 'Scarlet & Violet 151');
});

test('empty in, empty out', () => {
  assert.equal(setDisplayName(''), '');
  assert.equal(setDisplayName(undefined), '');
});

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

test('a series abbreviation used as a set-name prefix is dropped', () => {
  // "SM - Guardians Rising" sits beside a series chip already reading SM, so the prefix says the
  // same thing twice — on a label with room for one line.
  assert.equal(setDisplayName('SM - Guardians Rising'), 'Guardians Rising');
  assert.equal(setDisplayName('SWSH - Vivid Voltage'), 'Vivid Voltage');
  assert.equal(setDisplayName('SV - Paldea Evolved'), 'Paldea Evolved');
});

test('the dash may be any of the three, and the spacing anything', () => {
  for (const raw of ['SM - Guardians Rising', 'SM- Guardians Rising', 'SM -Guardians Rising', 'SM–Guardians Rising', 'SM — Guardians Rising']) {
    assert.equal(setDisplayName(raw), 'Guardians Rising', raw);
  }
});

test('only a KNOWN series abbreviation is stripped', () => {
  // The case this protects: a set whose real name has a dash in it. Nothing about the SHAPE of
  // "Team Rocket - Returns" distinguishes it from "SM - Guardians Rising"; only the list does.
  assert.equal(setDisplayName('Team - Returns'), 'Team - Returns');
  assert.equal(setDisplayName('ZZ - Something'), 'ZZ - Something');
});

test('a dash inside the title survives once the prefix is gone', () => {
  assert.equal(setDisplayName('SM - Burning Shadows - Special'), 'Burning Shadows - Special');
});

test('lower case still matches, because catalogues are not consistent', () => {
  assert.equal(setDisplayName('sm - Guardians Rising'), 'Guardians Rising');
});

test('the colon form still wins, and still does not need the list', () => {
  // A set CODE, not a series one: SWSH04 is not in SERIES_CODES and must still be stripped.
  assert.equal(setDisplayName('SWSH04: Vivid Voltage'), 'Vivid Voltage');
  assert.equal(setDisplayName('Shining Fates: Shiny Vault'), 'Shining Fates: Shiny Vault');
});

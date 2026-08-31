/**
 * These two functions exist to make labels fit in a space that is already too small, so the thing
 * worth testing is that they actually shorten — and that they never shorten a name into a lie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seriesCode, setShortCode } from './seriesCode.ts';

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

test('the set code drops the series prefix its neighbour chip already shows', () => {
  // The two chips are read together, so "SWSH · 04" says everything "SWSH · SWSH04" does in half
  // the width — and width is the whole reason this exists.
  assert.equal(setShortCode('SWSH04', 'SWSH'), '04');
  assert.equal(setShortCode('SV02', 'SV'), '02');
  assert.equal(setShortCode('SWSH11: TG', 'SWSH'), '11TG', 'separators go with it');
});

test('a code with no series prefix is left as it is', () => {
  assert.equal(setShortCode('BS', 'BASE'), 'BS');
  assert.equal(setShortCode('PAF', 'SV'), 'PAF');
  assert.equal(setShortCode('FO', 'BASE'), 'FO');
});

test('a set code equal to its series keeps its own name rather than vanishing', () => {
  // Stripping "SV" from "SV" leaves nothing, and an empty chip is the bug this all started with.
  assert.equal(setShortCode('SV', 'SV'), 'SV');
});

test('no code, no chip', () => {
  assert.equal(setShortCode('', 'SWSH'), '');
  assert.equal(setShortCode(undefined, 'SWSH'), '');
  assert.equal(setShortCode(null, ''), '');
});

test('every real set code shortens to something a chip can hold', () => {
  // The widest codes the catalogue publishes, which are what made this necessary.
  for (const [code, series] of [
    ['SWSH11: TG', 'SWSH'],
    ['SWSH12: TG', 'SWSH'],
    ['SWSH01', 'SWSH'],
    ['HIF:SV', 'SM'],
  ]) {
    const out = setShortCode(code, series);
    assert.ok(out.length > 0 && out.length <= 5, `${code} -> ${out}`);
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALL_MAT_FIELDS, matName, matPalette, matShows, mix, normalizeMatStyle, resolveMatStyle, withMatStyle } from './matStyle.ts';

test('an empty or bad value is no style', () => {
  assert.equal(normalizeMatStyle(undefined), undefined);
  assert.equal(normalizeMatStyle(null), undefined);
  assert.equal(normalizeMatStyle('x'), undefined);
  assert.equal(normalizeMatStyle([]), undefined);
  assert.equal(normalizeMatStyle({}), undefined);
  assert.equal(normalizeMatStyle({ paper: 'red', ink: 12, font: 'comic', picture: 'ftp://x' }), undefined);
});

test('defaults said out loud are dropped; every field is not stored', () => {
  assert.equal(normalizeMatStyle({ paper: '#111114', ink: '#F2EFE6', font: 'serif', fields: [...ALL_MAT_FIELDS] }), undefined);
});

test('the name option: clean is kept, anything else is as printed, and cleaning uses the species rule', () => {
  assert.deepEqual(normalizeMatStyle({ name: 'clean' }), { name: 'clean' });
  assert.equal(normalizeMatStyle({ name: 'card' }), undefined);
  assert.equal(normalizeMatStyle({ name: 'shout' }), undefined);
  assert.equal(matName({ name: 'clean' }, 'Mega Charizard X ex'), 'Charizard');
  assert.equal(matName({ name: 'clean' }, 'Professor Oak'), 'Professor Oak', 'a trainer keeps its printed name');
  assert.equal(matName(undefined, 'Mega Charizard X ex'), 'Mega Charizard X ex');
  assert.equal(withMatStyle({ name: 'clean', font: 'sans' }, { name: null })?.name, undefined);
});

test('the dropped No. and type line is ignored in a stored style; HP and rarity are fields', () => {
  assert.deepEqual(normalizeMatStyle({ fields: ['sub', 'hp', 'rarity'] }), { fields: ['hp', 'rarity'] });
  assert.equal(ALL_MAT_FIELDS[0], 'hp');
  assert.equal(ALL_MAT_FIELDS[1], 'rarity');
});

test('a usable style is kept, lower-cased, fields in the card order', () => {
  assert.deepEqual(normalizeMatStyle({ paper: '#FFFFFF', ink: '#102030', font: 'mono', picture: 'https://x/y.png', fields: ['released', 'set', 'bogus'] }), {
    paper: '#ffffff',
    ink: '#102030',
    font: 'mono',
    picture: 'https://x/y.png',
    fields: ['set', 'released'],
  });
});

test('an empty field list is the name alone and is kept', () => {
  assert.deepEqual(normalizeMatStyle({ fields: [] }), { fields: [] });
  assert.equal(matShows({ fields: [] }, 'set'), false);
  assert.equal(matShows(undefined, 'set'), true);
});

test('withMatStyle merges, null clears, clearing the last field is no style', () => {
  const a = withMatStyle(undefined, { paper: '#ffffff' });
  assert.deepEqual(a, { paper: '#ffffff' });
  const b = withMatStyle(a, { font: 'sans' });
  assert.deepEqual(b, { paper: '#ffffff', font: 'sans' });
  const c = withMatStyle(b, { paper: null, font: null });
  assert.equal(c, undefined);
});

test('a page style replaces the binder style whole', () => {
  assert.deepEqual(resolveMatStyle({ fields: [] }, { paper: '#ffffff' }), { fields: [] });
  assert.deepEqual(resolveMatStyle(null, { paper: '#ffffff' }), { paper: '#ffffff' });
  assert.equal(resolveMatStyle(null, undefined), undefined);
});

test('mix blends toward the paper and the palette follows the ink', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 2), '#ffffff');
  const p = matPalette({ paper: '#ffffff', ink: '#000000' });
  assert.equal(p.paper, '#ffffff');
  assert.equal(p.ink, '#000000');
  assert.equal(p.font, 'serif');
  assert.equal(p.label, '#808080');
  assert.equal(matPalette(undefined).paper, '#111114');
});

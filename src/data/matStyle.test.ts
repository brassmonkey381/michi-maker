import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ALL_MAT_FIELDS, AUTO_INK_DARK, AUTO_INK_LIGHT, luminanceUnder, matName, matPalette, matShows, mix, normalizeMatStyle, resolveMatStyle, spreadFits, spreadMinimum, spreadSlice, withAlphaHex, withMatStyle } from './matStyle.ts';

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
  assert.deepEqual(normalizeMatStyle({ name: 'none' }), { name: 'none' });
  assert.equal(matName({ name: 'none' }, 'Mega Charizard X ex'), '', 'None leaves the name off');
  assert.equal(matName(undefined, 'Mega Charizard X ex'), 'Mega Charizard X ex');
  assert.equal(withMatStyle({ name: 'clean', font: 'sans' }, { name: null })?.name, undefined);
});

test('the dropped No. and type line is ignored in a stored style; HP and rarity are fields', () => {
  assert.deepEqual(normalizeMatStyle({ fields: ['sub', 'hp', 'rarity'] }), { fields: ['hp', 'rarity'] });
  assert.equal(ALL_MAT_FIELDS[0], 'hp');
  assert.equal(ALL_MAT_FIELDS[1], 'rarity');
});

test('a spread needs a picture, and clearing the picture clears the spread', () => {
  assert.deepEqual(normalizeMatStyle({ picture: 'https://x/y.png', spread: 'page' }), { picture: 'https://x/y.png', spread: 'page' });
  assert.equal(normalizeMatStyle({ spread: 'page' }), undefined);
  assert.equal(normalizeMatStyle({ picture: 'https://x/y.png', spread: 'binder' })?.spread, undefined);
  assert.equal(withMatStyle({ picture: 'https://x/y.png', spread: 'page' }, { picture: null }), undefined);
});

test('the spread minimum is 300 by 420 a pocket, and a slice is the pocket\'s window onto the grid', () => {
  assert.deepEqual(spreadMinimum(3, 3), { w: 900, h: 1260 });
  assert.equal(spreadFits(900, 1260, 3, 3), true);
  assert.equal(spreadFits(899, 1260, 3, 3), false);
  assert.equal(spreadFits(2000, 2000, 2, 2), true);
  assert.deepEqual(spreadSlice(1, 2, 110, 150, 320, 440), { left: -220, top: -150, width: 320, height: 440 });
  assert.deepEqual(spreadSlice(0, 0, 110, 150, 320, 440), { left: 0, top: 0, width: 320, height: 440 });
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

test('the readability options: an outline, a scrim and a following ink; the last two need a picture', () => {
  assert.deepEqual(normalizeMatStyle({ halo: 'thin' }), { halo: 'thin' });
  assert.deepEqual(normalizeMatStyle({ halo: 'wide' }), { halo: 'wide' });
  assert.equal(normalizeMatStyle({ halo: 'glow' }), undefined);
  assert.equal(normalizeMatStyle({ scrim: 0.5, autoInk: true }), undefined, 'nothing to read without a picture');
  assert.deepEqual(normalizeMatStyle({ picture: 'https://x/y.png', scrim: 0.5, autoInk: true }), { picture: 'https://x/y.png', scrim: 0.5, autoInk: true });
  assert.equal(normalizeMatStyle({ picture: 'https://x/y.png', scrim: 0 })?.scrim, undefined, 'a zero scrim is no scrim');
  assert.equal(normalizeMatStyle({ picture: 'https://x/y.png', scrim: 7 })?.scrim, 1, 'clamped');
  assert.equal(normalizeMatStyle({ picture: 'https://x/y.png', scrim: 0.333 })?.scrim, 0.33);
  assert.equal(normalizeMatStyle({ picture: 'https://x/y.png', autoInk: 'yes' })?.autoInk, undefined);
  assert.equal(withMatStyle({ picture: 'https://x/y.png', scrim: 0.5, autoInk: true, halo: 'thin' }, { picture: null })?.scrim, undefined, 'clearing the picture clears the scrim');
  assert.deepEqual(withMatStyle({ picture: 'https://x/y.png', scrim: 0.5, autoInk: true, halo: 'thin' }, { picture: null }), { halo: 'thin' });
});

test('alignment: three sections, a known side each, the dex on the right being the default', () => {
  assert.deepEqual(normalizeMatStyle({ align: { name: 'center', rows: 'left', dex: 'left' } }), { align: { name: 'center', rows: 'left', dex: 'left' } });
  assert.equal(normalizeMatStyle({ align: { dex: 'right' } }), undefined);
  assert.equal(normalizeMatStyle({ align: { name: 'middle' } }), undefined);
  assert.equal(normalizeMatStyle({ align: 'center' }), undefined);
  const a = withMatStyle(undefined, { align: { name: 'center' } });
  assert.deepEqual(a, { align: { name: 'center' } });
  const b = withMatStyle(a, { align: { rows: 'right' } });
  assert.deepEqual(b, { align: { name: 'center', rows: 'right' } }, 'sections merge');
  const c = withMatStyle(b, { align: { name: null } });
  assert.deepEqual(c, { align: { rows: 'right' } });
  assert.equal(withMatStyle(c, { align: null }), undefined, 'the whole alignment cleared');
});

test('the palette: the wide outline sets the small lines in full ink; a following ink reads the brightness', () => {
  const wide = matPalette({ paper: '#ffffff', ink: '#000000', halo: 'wide' });
  assert.equal(wide.label, '#000000');
  assert.equal(wide.rule, '#000000');
  assert.equal(wide.halo, 'wide');
  assert.equal(wide.ground, '#ffffff');
  assert.equal(matPalette({ paper: '#ffffff', ink: '#000000', halo: 'thin' }).label, '#808080', 'the thin outline keeps the cuts');
  const auto = { picture: 'https://x/y.png', autoInk: true as const, ink: '#ff0000' };
  assert.equal(matPalette(auto).ink, '#ff0000', 'no reading yet: the chosen ink');
  assert.equal(matPalette(auto, 0.8).ink, AUTO_INK_DARK, 'a bright slice takes dark ink');
  assert.equal(matPalette(auto, 0.8).ground, AUTO_INK_LIGHT);
  assert.equal(matPalette(auto, 0.2).ink, AUTO_INK_LIGHT, 'a dark slice takes light ink');
  assert.equal(matPalette(auto, 0.2).ground, AUTO_INK_DARK);
  assert.equal(matPalette({ ink: '#ff0000' }, 0.8).ink, '#ff0000', 'without the option the reading is ignored');
  assert.equal(matPalette({ picture: 'https://x/y.png', scrim: 0.5 }).scrim, 0.5);
  assert.equal(matPalette(undefined).scrim, 0);
  assert.equal(withAlphaHex('#ffffff', 0.5), '#ffffff80');
  assert.equal(withAlphaHex('#ffffff', 0), '#ffffff00');
});

test('luminanceUnder reads the picture where the text is, through the cover fit', () => {
  // A 4 by 2 picture, black on the left half, white on the right, as a 4 by 2 grid.
  const sample = { pw: 400, ph: 200, lw: 4, lh: 2, data: [0, 0, 255, 255, 0, 0, 255, 255] };
  // Cover-fitted into a 200 by 200 box: scaled to 400 by 200 and centred, so the box sees the middle.
  assert.equal(luminanceUnder(sample, { width: 200, height: 200 }, { left: 0, top: 0, width: 100, height: 200 }), 0, 'the left of the box is the dark half');
  assert.equal(luminanceUnder(sample, { width: 200, height: 200 }, { left: 100, top: 0, width: 100, height: 200 }), 1, 'the right of the box is the light half');
  assert.equal(luminanceUnder(sample, { width: 200, height: 200 }, { left: 0, top: 0, width: 200, height: 200 }), 0.5);
  // A page-wide spread: the box is the grid and the rect is one pocket's text block.
  assert.equal(luminanceUnder(sample, { width: 400, height: 200 }, { left: 300, top: 100, width: 100, height: 100 }), 1);
  assert.equal(luminanceUnder(sample, { width: 400, height: 200 }, { left: 900, top: 0, width: 10, height: 10 }), 0.5, 'off the picture reads as middle grey');
  assert.equal(luminanceUnder({ pw: 0, ph: 0, lw: 0, lh: 0, data: [] }, { width: 1, height: 1 }, { left: 0, top: 0, width: 1, height: 1 }), 0.5);
});

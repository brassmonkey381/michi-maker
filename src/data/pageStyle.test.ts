import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isImageRef, luminance, normalizePageStyle, normalizeWear, resolveWear, seamLines, stitchInk, stitchStops, WEAR_NONE, withPageStyle } from './pageStyle.ts';

test('a pocket wears the first layer that speaks, and "none" speaks as nothing', () => {
  assert.equal(resolveWear(undefined, undefined, '#ffaa00'), '#ffaa00');
  assert.equal(resolveWear(undefined, '#123456', '#ffaa00'), '#123456');
  assert.equal(resolveWear('#000000', WEAR_NONE, '#ffaa00'), '#000000');
  assert.equal(resolveWear(undefined, WEAR_NONE, '#ffaa00'), undefined);
  assert.equal(resolveWear(null, '', undefined), undefined);
});

test('a page or pocket column is a colour, a picture, "none", or nothing at all', () => {
  assert.equal(normalizeWear('#FFAA00'), '#ffaa00');
  assert.equal(normalizeWear(WEAR_NONE), WEAR_NONE);
  assert.equal(normalizeWear('https://example.com/sleeve.png'), 'https://example.com/sleeve.png');
  for (const bad of [null, undefined, 3, 'red', '#12', 'NONE', 'ftp://x/y.png', 'https://a b']) assert.equal(normalizeWear(bad), undefined);
});

test('a picture is told from a colour by shape, in the binder style too', () => {
  assert.ok(isImageRef('http://example.com/a.jpg') && isImageRef('https://example.com/a.jpg'));
  assert.ok(!isImageRef('#ffaa00') && !isImageRef('none') && !isImageRef(''));
  assert.deepEqual(normalizePageStyle({ sleeve: 'https://example.com/s.png', artBacking: 'bad' }), { sleeve: 'https://example.com/s.png' });
});

test('anything storage hands back that is not a style reads as the plain page', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { material: 'velvet' }, { sleeve: 'red' }, { sleeve: '#12' }, { details: 'zip' }]) {
    assert.equal(normalizePageStyle(bad), undefined, JSON.stringify(bad) ?? 'undefined');
  }
});

test('classic is the absence of a material, so it never persists as one', () => {
  assert.equal(normalizePageStyle({ material: 'classic' }), undefined);
  assert.deepEqual(normalizePageStyle({ material: 'stitch' }), { material: 'stitch' });
  assert.deepEqual(normalizePageStyle({ material: 'double' }), { material: 'double' });
});

test('the two older shapes are read: stitched is double, zip is double with a zipper', () => {
  assert.deepEqual(normalizePageStyle({ material: 'stitched' }), { material: 'double' });
  assert.deepEqual(normalizePageStyle({ material: 'zip' }), { material: 'double', details: { zip: {} } });
});

test('colours are six-digit hex, lower-cased, and nothing else', () => {
  assert.deepEqual(normalizePageStyle({ sleeve: '#FFAA00', artBacking: '#123ABC' }), { sleeve: '#ffaa00', artBacking: '#123abc' });
  assert.deepEqual(normalizePageStyle({ sleeve: 'rgb(1,2,3)', artBacking: '#ffaa00' }), { artBacking: '#ffaa00' });
});

test('details are a set: a zip with a pull and a track, and a spine, in any combination', () => {
  assert.deepEqual(normalizePageStyle({ details: { zip: { pull: '#FF0000', track: 'wavy' }, spine: 'cross' } }), {
    details: { zip: { pull: '#ff0000', track: 'wavy' }, spine: 'cross' },
  });
  // A straight track is the default and never persists; a bad spine is dropped.
  assert.deepEqual(normalizePageStyle({ details: { zip: { track: 'straight' }, spine: 'velvet' } }), { details: { zip: {} } });
});

test('a patch clears with null, leaves alone with undefined, and empties back to undefined', () => {
  const s = withPageStyle({ material: 'double', sleeve: '#ffaa00' }, { sleeve: null });
  assert.deepEqual(s, { material: 'double' });
  assert.deepEqual(withPageStyle(s, { artBacking: '#000000' }), { material: 'double', artBacking: '#000000' });
  assert.equal(withPageStyle({ material: 'double' }, { material: null }), undefined);
  assert.equal(withPageStyle({ material: 'double' }, { material: 'classic' }), undefined);
});

test('zip and spine patch independently of the stitching and of each other', () => {
  let s = withPageStyle(undefined, { zip: {} });
  assert.deepEqual(s, { details: { zip: {} } });
  s = withPageStyle(s, { zip: { pull: '#ff0000' } });
  s = withPageStyle(s, { spine: 'ribbed' });
  assert.deepEqual(s, { details: { zip: { pull: '#ff0000' }, spine: 'ribbed' } });
  s = withPageStyle(s, { zip: { track: 'wavy' } });
  assert.deepEqual(s?.details?.zip, { pull: '#ff0000', track: 'wavy' });
  s = withPageStyle(s, { material: 'stitch' });
  assert.deepEqual(s?.details, { zip: { pull: '#ff0000', track: 'wavy' }, spine: 'ribbed' });
  s = withPageStyle(s, { zip: null });
  assert.deepEqual(s, { material: 'stitch', details: { spine: 'ribbed' } });
  assert.equal(withPageStyle({ details: { spine: 'cross' } }, { spine: null }), undefined);
});

test('the thread is pale on a dark page and dark on a pale one', () => {
  assert.ok(luminance('#000000') < 0.01 && luminance('#ffffff') > 0.99);
  assert.ok(stitchInk('#17171a').startsWith('rgba(255'));
  assert.ok(stitchInk('#f6f6f8').startsWith('rgba(0'));
});

test('one gap is bare, the first in from the outer edge; every other line is a seam', () => {
  // The reference: a left-hand page (spine on its right). Line 1 is bare; lines 0, 2 and 3 are seams.
  assert.deepEqual(seamLines(3, 3, 'left'), { v: [0, 2, 3], h: [0, 1, 2, 3] });
  // A right-hand page is the mirror image: line 2 bare.
  assert.deepEqual(seamLines(3, 3, 'right'), { v: [0, 1, 3], h: [0, 1, 2, 3] });
  // Alone, a page is a right-hand one.
  assert.deepEqual(seamLines(3, 3, undefined), seamLines(3, 3, 'right'));
  // The same reading at every size.
  assert.deepEqual(seamLines(2, 2, 'left'), { v: [0, 2], h: [0, 1, 2] });
  assert.deepEqual(seamLines(4, 4, 'right'), { v: [0, 1, 2, 4], h: [0, 1, 2, 3, 4] });
  assert.deepEqual(seamLines(4, 3, 'left'), { v: [0, 2, 3], h: [0, 1, 2, 3, 4] });
});

test('a stitch run is ink for a dash of every pitch, as gradient stops in order', () => {
  const run = stitchStops(20, 'ink', { pitch: 5, dash: 3 });
  assert.equal(run.colors.length, run.locations.length);
  // 4 stitches: 2 + 4 per stitch.
  assert.equal(run.colors.length, 2 + 4 * 4);
  for (let i = 1; i < run.locations.length; i += 1) assert.ok(run.locations[i] >= run.locations[i - 1], 'stops ascend');
  assert.equal(run.locations[0], 0);
  assert.equal(run.locations[run.locations.length - 1], 1);
  // The first stitch: 1px in, 3px long.
  assert.deepEqual(run.locations.slice(1, 5), [0.05, 0.05, 0.2, 0.2]);
  assert.deepEqual(run.colors.slice(1, 5), ['rgba(0,0,0,0)', 'ink', 'ink', 'rgba(0,0,0,0)']);
  // Nothing to draw is still a valid gradient.
  assert.deepEqual(stitchStops(0, 'ink'), { colors: ['rgba(0,0,0,0)', 'rgba(0,0,0,0)'], locations: [0, 1] });
});

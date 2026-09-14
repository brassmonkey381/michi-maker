import assert from 'node:assert/strict';
import { test } from 'node:test';

import { luminance, normalizePageStyle, stitchInk, withPageStyle } from './pageStyle.ts';

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

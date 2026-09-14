import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultMatFor, luminance, normalizePageStyle, stitchInk, withPageStyle } from './pageStyle.ts';

test('anything storage hands back that is not a style reads as the plain page', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { material: 'velvet' }, { sleeve: 'red' }, { sleeve: '#12' }]) {
    assert.equal(normalizePageStyle(bad), undefined, JSON.stringify(bad) ?? 'undefined');
  }
});

test('classic is the absence of a material, so it never persists as one', () => {
  assert.equal(normalizePageStyle({ material: 'classic' }), undefined);
  assert.deepEqual(normalizePageStyle({ material: 'stitched' }), { material: 'stitched' });
});

test('colours are six-digit hex, lower-cased, and nothing else', () => {
  assert.deepEqual(normalizePageStyle({ sleeve: '#FFAA00', artBacking: '#123ABC' }), { sleeve: '#ffaa00', artBacking: '#123abc' });
  assert.deepEqual(normalizePageStyle({ sleeve: 'rgb(1,2,3)', artBacking: '#ffaa00' }), { artBacking: '#ffaa00' });
});

test('a patch clears with null, leaves alone with undefined, and empties back to undefined', () => {
  const s = withPageStyle({ material: 'zip', sleeve: '#ffaa00' }, { sleeve: null });
  assert.deepEqual(s, { material: 'zip' });
  assert.deepEqual(withPageStyle(s, { artBacking: '#000000' }), { material: 'zip', artBacking: '#000000' });
  assert.equal(withPageStyle({ material: 'zip' }, { material: null }), undefined);
  assert.equal(withPageStyle({ material: 'zip' }, { material: 'classic' }), undefined);
});

test('the thread is pale on a dark page and dark on a pale one', () => {
  assert.ok(luminance('#000000') < 0.01 && luminance('#ffffff') > 0.99);
  assert.ok(stitchInk('#17171a').startsWith('rgba(255'));
  assert.ok(stitchInk('#f6f6f8').startsWith('rgba(0'));
});

test('a material brings a dark mat with it; classic brings nothing', () => {
  assert.equal(defaultMatFor(undefined), undefined);
  assert.equal(defaultMatFor('classic'), undefined);
  assert.equal(typeof defaultMatFor('stitched'), 'string');
});

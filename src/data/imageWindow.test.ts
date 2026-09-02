import { test } from 'node:test';
import assert from 'node:assert/strict';

import { windowedImageStyle } from './imageWindow.ts';

test('no crop: the element is the box', () => {
  const s = windowedImageStyle(200, 100, undefined);
  assert.equal(s.width, 200);
  assert.equal(s.height, 100);
  assert.equal(s.left, 0);
  assert.equal(s.top, 0);
  assert.deepEqual(s.transform, [{ rotate: '0deg' }, { scaleX: 1 }, { scaleY: 1 }]);
});

test('a half-width window doubles the element and slides it so the window lands on the box', () => {
  // Show the right half: the image is twice the box wide, pulled left by one box width.
  const s = windowedImageStyle(200, 100, { x: 0.5, y: 0, w: 0.5, h: 1 });
  assert.equal(s.width, 400);
  assert.equal(s.height, 100);
  assert.equal(s.left, -200);
  assert.equal(s.top, 0);
});

test('a quarter turn swaps the element and nudges it so the rotate lands it on the box', () => {
  const s = windowedImageStyle(200, 100, undefined, { rot: 90 });
  // Laid out as 100 wide × 200 tall, centred where the 200×100 box is.
  assert.equal(s.width, 100);
  assert.equal(s.height, 200);
  assert.equal(s.left, 50);
  assert.equal(s.top, -50);
  assert.deepEqual(s.transform[0], { rotate: '90deg' });
});

test('flips are scale −1, in the order rotate, then flipH, then flipV', () => {
  const s = windowedImageStyle(10, 10, undefined, { rot: 180, flipH: true, flipV: true });
  assert.deepEqual(s.transform, [{ rotate: '180deg' }, { scaleX: -1 }, { scaleY: -1 }]);
});

test('a degenerate window is floored, so the element cannot be absurdly large', () => {
  const s = windowedImageStyle(100, 100, { x: 0, y: 0, w: 0, h: 0.0001 });
  assert.equal(s.width, 100 / 0.02);
  assert.equal(s.height, 100 / 0.02);
});

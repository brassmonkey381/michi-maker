/**
 * Turning a card's palette back into mix-bar stops. Run: `npm test`.
 *
 * The contract that matters is the round trip: feed the positions this produces back through the
 * picker's own `stopWeights` and you must get the weights you asked for. That rule is duplicated
 * here on purpose — if ColorPicker's weighting ever changes, this fails loudly instead of the
 * picked card quietly landing on the wrong mix.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { paletteStops } from './paletteStops.ts';

/** A copy of components/color/ColorPicker's stopWeights: bands split at neighbour midpoints. */
function stopWeights(pos: number[]): number[] {
  const bounds = [0, ...pos.slice(0, -1).map((p, i) => (p + pos[i + 1]) / 2), 1];
  return pos.map((_, i) => bounds[i + 1] - bounds[i]);
}

const lab = (w: number, L = 50) => ({ L, a: 0, b: 0, w });

test('three equal colours land on the picker own defaults', () => {
  const out = paletteStops([lab(0.3), lab(0.3), lab(0.3)]);
  assert.deepEqual(out.map((s) => Number(s.pos.toFixed(3))), [0.167, 0.5, 0.833]);
});

test('the positions round-trip back to the weights they came from', () => {
  const colors = [lab(0.5), lab(0.3), lab(0.2)];
  const out = paletteStops(colors);
  const got = stopWeights(out.map((s) => s.pos));
  [0.5, 0.3, 0.2].forEach((want, i) => assert.ok(Math.abs(got[i] - want) < 1e-9, `weight ${i}: ${got[i]} vs ${want}`));
});

test('biggest colour first, whatever order the card stored them in', () => {
  const out = paletteStops([lab(0.1, 10), lab(0.7, 70), lab(0.2, 20)]);
  assert.deepEqual(out.map((s) => s.color.L), [70, 20, 10]);
});

test('weights are renormalised, so a dropped fourth colour does not shrink the rest', () => {
  // Four colours summing to 1; only three survive, and those three must still fill the bar.
  const out = paletteStops([lab(0.4), lab(0.3), lab(0.2), lab(0.1)]);
  const total = stopWeights(out.map((s) => s.pos)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `bar should be full, got ${total}`);
  assert.equal(out.length, 3);
});

test('a colour covering nothing is dropped rather than drawn black', () => {
  const out = paletteStops([lab(0.6), lab(0.4), lab(0)]);
  assert.equal(out.length, 2);
});

test('a card with one colour gives one stop', () => {
  const out = paletteStops([lab(1)]);
  assert.equal(out.length, 1);
  assert.ok(out[0].pos >= 0 && out[0].pos <= 1);
});

test('an empty or weightless palette gives no stops at all', () => {
  assert.deepEqual(paletteStops([]), []);
  assert.deepEqual(paletteStops([lab(0), lab(0)]), []);
});

test('an extreme mix still reads left to right inside the bar', () => {
  // 0.96/0.02/0.02 is not representable as three stops on the bar, so it falls back to band
  // centres: the ranking survives even though the exact split cannot.
  const out = paletteStops([lab(0.96), lab(0.02), lab(0.02)]);
  assert.equal(out.length, 3);
  out.forEach((s) => assert.ok(s.pos >= 0 && s.pos <= 1, `pos out of range: ${s.pos}`));
  assert.ok(out[0].pos < out[1].pos && out[1].pos < out[2].pos, 'stops must stay in order');
});

test('max caps how many stops come back', () => {
  assert.equal(paletteStops([lab(0.3), lab(0.3), lab(0.2), lab(0.2)], 2).length, 2);
});

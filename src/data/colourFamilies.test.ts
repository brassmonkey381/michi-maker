import assert from 'node:assert/strict';
import { test } from 'node:test';

import { colourFamily, colourMemberships, familyShare, pagesTagText } from './colourFamilies.ts';

/** A Lab colour from sRGB 0..255 (D65), for readable cases. */
function lab(r: number, g: number, b: number) {
  const lin = [r, g, b].map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
  const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

test('soft colours join their families (owner: lavender and pastel pink)', () => {
  assert.equal(colourFamily(lab(200, 180, 235)), 'purple'); // lavender
  assert.equal(colourFamily(lab(248, 200, 220)), 'pink'); // pastel pink
  assert.equal(colourFamily(lab(180, 215, 245)), 'blue'); // baby blue
  assert.equal(colourFamily(lab(190, 240, 205)), 'green'); // mint
  assert.equal(colourFamily(lab(250, 238, 170)), 'yellow'); // butter yellow
});

test('near-greys and whites belong to no family; dark is black', () => {
  assert.deepEqual(colourMemberships(lab(140, 140, 145)), {});
  assert.deepEqual(colourMemberships(lab(245, 243, 240)), {});
  assert.equal(colourFamily(lab(20, 20, 30)), 'black');
});

test('magenta is pink, violet is shared by blue and purple', () => {
  assert.equal(colourFamily(lab(220, 40, 170)), 'pink');
  const violet = colourMemberships(lab(110, 90, 200));
  assert.ok((violet.blue ?? 0) > 0 && (violet.purple ?? 0) > 0, JSON.stringify(violet));
});

test('a card counts toward several families at once', () => {
  const card = [
    { ...lab(60, 90, 200), w: 0.5 },
    { ...lab(150, 80, 200), w: 0.5 },
  ];
  assert.ok(familyShare(card, 'blue') > 0.3);
  assert.ok(familyShare(card, 'purple') > 0.3);
});

test('the post-it collapses runs and keeps every number that fits', () => {
  assert.equal(pagesTagText([3, 4, 5, 9, 12]), 'p. 3–5, 9, 12');
  assert.equal(pagesTagText([1, 2, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21], 24), 'p. 1–3, 5, 7, 9, 11 +5');
});

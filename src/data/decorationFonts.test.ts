import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DECORATION_FONTS, fontFamilyFor } from './decorationFonts.ts';

test('every font the type allows is in the picker, once, and the marker leads', () => {
  const ids = DECORATION_FONTS.map((f) => f.id);
  assert.deepEqual([...ids].sort(), ['brand', 'marker', 'mono', 'rounded', 'sans', 'serif']);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], 'marker');
});

test('the marker is never called Sharpie', () => {
  for (const f of DECORATION_FONTS) {
    assert.ok(!/sharpie/i.test(f.label + f.hint), f.id);
  }
});

test('fontFamilyFor resolves through the theme map and falls back to the sans', () => {
  const fonts = { sans: 'S', serif: 'F', marker: 'M' };
  assert.equal(fontFamilyFor('marker', fonts), 'M');
  assert.equal(fontFamilyFor('serif', fonts), 'F');
  assert.equal(fontFamilyFor('comic', fonts), 'S');
  assert.equal(fontFamilyFor('marker', {}), 'sans-serif');
});

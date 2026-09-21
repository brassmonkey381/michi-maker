import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BINDER_MODELS } from './binderModels.ts';
import { BINDER_PRESETS } from './binderPresets.ts';
import { coverForPreset, coverLabel } from './presetCovers.ts';

test('every suggested cover is a model and colourway that is actually sold', () => {
  for (const preset of BINDER_PRESETS) {
    const hit = coverForPreset(preset.id);
    if (!hit) continue;
    const model = BINDER_MODELS.find((m) => m.id === hit.modelId);
    assert.ok(model, `${preset.id}: model ${hit.modelId}`);
    assert.ok(model.colourways.some((c) => c.id === hit.colourway), `${preset.id}: colourway ${hit.colourway}`);
    assert.ok(hit.label.length > 0);
  }
});

test('the dark named binders each have a cover, and Classic White has none', () => {
  for (const id of ['anniversary-gold', 'midnight-black', 'navy', 'forest', 'crimson']) {
    assert.ok(coverForPreset(id), id);
  }
  assert.equal(coverForPreset('classic-white'), null);
  assert.equal(coverForPreset(undefined), null);
  assert.equal(coverForPreset('no-such-binder'), null);
});

test('a cover reads as its model and colour', () => {
  assert.equal(coverLabel({ modelId: 'vaultx-exotec-zip-12-xl', colourway: 'royal-blue' }), '12-pocket XL · Royal Blue');
  assert.equal(coverLabel(null), null);
});

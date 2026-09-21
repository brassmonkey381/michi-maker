/**
 * WHICH COVER GOES WITH WHICH NAMED BINDER.
 *
 * A named binder (data/binderPresets) is the INSIDE of the binder: the cloth round the pages, the
 * zip, the spine. A cover (data/binderModels) is the OUTSIDE: a real model in one of its
 * colourways, with four surfaces to decorate. They were chosen in two different places, so nothing
 * said that Navy pages have a Royal Blue shell to go with them. This is that link, and nothing
 * more: a suggestion the settings sheet offers, never something applied behind anyone's back,
 * because a model carries its own page grid and a cover may already be decorated.
 *
 * Kept out of binderPresets on purpose: that file is mirrored by api/_binderPresets.js for the
 * share image, which has no use for this.
 */
import { binderColourway, binderModel } from './binderModels.ts';

const PRESET_COVER: Record<string, { modelId: string; colourway: string }> = {
  'anniversary-gold': { modelId: 'vaultx-exotec-zip-9-anniversary', colourway: 'anniversary-white' },
  'midnight-black': { modelId: 'vaultx-exotec-zip-12-xl', colourway: 'signature-black' },
  navy: { modelId: 'vaultx-exotec-zip-12-xl', colourway: 'royal-blue' },
  forest: { modelId: 'vaultx-exotec-zip-12-xl', colourway: 'forest-green' },
  crimson: { modelId: 'vaultx-exotec-zip-12-xl', colourway: 'fire-red' },
  // Classic White has no cover of its own: the only white shell sold is the Anniversary edition,
  // and that one is stamped as such.
};

/** The cover that goes with a named binder, or null when none does. */
export function coverForPreset(presetId: string | undefined | null): { modelId: string; colourway: string; label: string } | null {
  const hit = presetId ? PRESET_COVER[presetId] : undefined;
  if (!hit) return null;
  const model = binderModel(hit.modelId);
  const colour = binderColourway(model, hit.colourway);
  // A mapping that names a model or colourway nobody sells any more is not a suggestion.
  if (model.id !== hit.modelId || colour.id !== hit.colourway) return null;
  return { ...hit, label: colour.name };
}

/** "12-pocket XL · Royal Blue", or null with no cover chosen. */
export function coverLabel(cover: { modelId: string; colourway: string } | undefined | null): string | null {
  if (!cover) return null;
  const model = binderModel(cover.modelId);
  return `${model.shortName} · ${binderColourway(model, cover.colourway).name}`;
}

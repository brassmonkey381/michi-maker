/**
 * THE PRESET PICTURE LIBRARY: textures for sleeves and art backings, themes for the picture behind
 * the share image. Picked by the owner on 2026-10-13 from Pexels and Pixabay candidates
 * (scripts/presets/gather-candidates.mjs) and hosted in our own bucket (scripts/presets/rehost.mjs),
 * because a preset is a promise the app makes and a hotlink is a promise someone else keeps.
 *
 * LISTED IN src/data/presets.json (owner's sheet, tools/presets-sheet.html): the order there is the
 * order offered, and `offered: false` hides a picture without losing it. The pictures themselves are
 * hosted by scripts/presets/rehost.mjs, which adds its entries to the same file.
 *
 * Neither licence requires a credit. `author` and `page` are kept and shown because they are true.
 */
import presets from './presets.json' with { type: 'json' };


export type PresetKind = 'texture' | 'theme';

export interface PresetPicture {
  id: string;
  kind: PresetKind;
  label: string;
  /** The hosted picture, the address a surface stores. */
  url: string;
  /** 360x240 for the picker grid. */
  thumb: string;
  width: number;
  height: number;
  provider: 'pexels' | 'pixabay';
  author: string;
  /** The picture's page at the provider. */
  page: string;
}

export const PRESET_PICTURES: readonly PresetPicture[] = (presets.pictures as (PresetPicture & { offered?: boolean })[]).filter((p) => p.offered !== false);

export function presetsOf(kind: PresetKind): PresetPicture[] {
  return PRESET_PICTURES.filter((p) => p.kind === kind);
}

/** The preset a stored address came from, if any; a pasted link is not one. */
export function presetFor(url: string | undefined | null): PresetPicture | null {
  return url ? PRESET_PICTURES.find((p) => p.url === url) ?? null : null;
}

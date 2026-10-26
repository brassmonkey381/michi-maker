/**
 * NAMED BINDERS (owner, 2026-09-15). A binder is a product: its cloth, its zip and its spine come
 * together, the way a white binder has a white zip and the anniversary one a gold zip on pale
 * cloth. Picking one sets the page colour and the hardware at once, and fixes the zip's colours to
 * the binder's own when it has some (`zip` null means cut from the cloth, see pageStyle zipCloth).
 *
 * LISTED IN src/data/presets.json (owner's sheet, tools/presets-sheet.html), which the share image's
 * api/_binderPresets.js reads too, so the two cannot drift; pageStyle.test.ts still checks.
 */
import presets from './presets.json' with { type: 'json' };

export interface BinderPreset {
  id: string;
  label: string;
  /** The page colour, #rrggbb. */
  cloth: string;
  /** The zip's own colours, or null to cut them from the cloth. */
  zip: { tape: string; tooth: string; lit: string; slider: string; sliderEdge: string; pull: string } | null;
  zipper: boolean;
  spine: 'cross' | 'ribbed' | null;
}

export const BINDER_PRESETS: readonly BinderPreset[] = (presets.binders as (BinderPreset & { offered?: boolean })[]).filter((b) => b.offered !== false);

export function binderPreset(id: string | undefined | null): BinderPreset | undefined {
  return id ? BINDER_PRESETS.find((p) => p.id === id) : undefined;
}

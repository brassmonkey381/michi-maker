/**
 * NAMED BINDERS (owner, 2026-09-15). A binder is a product: its cloth, its zip and its spine come
 * together, the way a white binder has a white zip and the anniversary one a gold zip on pale
 * cloth. Picking one sets the page colour and the hardware at once, and fixes the zip's colours to
 * the binder's own when it has some (`zip` null means cut from the cloth, see pageStyle zipCloth).
 *
 * MIRRORED IN api/_binderPresets.js for the share image, which cannot import TypeScript. A test
 * in pageStyle.test.ts fails the build if the two drift.
 */
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

export const BINDER_PRESETS: readonly BinderPreset[] = [
  { id: 'classic-white', label: 'Classic White', cloth: '#f4f4f4', zip: null, zipper: true, spine: 'cross' },
  {
    id: 'anniversary-gold',
    label: 'Anniversary Gold',
    cloth: '#efeeea',
    zip: { tape: '#d9bd6f', tooth: '#c9a24e', lit: '#f3dd92', slider: '#d4af37', sliderEdge: '#8a6d1f', pull: '#d4af37' },
    zipper: true,
    spine: 'cross',
  },
  { id: 'midnight-black', label: 'Midnight Black', cloth: '#0d0d10', zip: null, zipper: true, spine: 'cross' },
  { id: 'navy', label: 'Navy', cloth: '#1b2a4a', zip: null, zipper: true, spine: 'cross' },
  { id: 'forest', label: 'Forest', cloth: '#1f3b2c', zip: null, zipper: true, spine: 'ribbed' },
  { id: 'crimson', label: 'Crimson', cloth: '#6b1d24', zip: null, zipper: true, spine: 'cross' },
];

export function binderPreset(id: string | undefined | null): BinderPreset | undefined {
  return id ? BINDER_PRESETS.find((p) => p.id === id) : undefined;
}

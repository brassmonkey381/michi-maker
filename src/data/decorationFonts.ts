/**
 * THE FONTS A COVER'S TEXT MAY USE — a small table, because a chip row wants a list and a
 * renderer wants a family name, and both should read from one place.
 *
 * Pure: the theme's Fonts object (which needs react-native's Platform) is passed IN rather than
 * imported, so `npm test` can pin the table and the fallback without a bundler.
 */

import type { CoverTextFont } from './binderTypes.ts';

export interface DecorationFont {
  id: CoverTextFont;
  /** What the chip says. "Marker", never "Sharpie" — that is a trademark. */
  label: string;
  /** A one-line description for a tooltip or a picker's second line. */
  hint: string;
}

/** In the order the picker shows them: the handwriting face first, because it is why this exists. */
export const DECORATION_FONTS: readonly DecorationFont[] = [
  { id: 'marker', label: 'Marker', hint: 'Thick felt-tip, like a label written by hand' },
  { id: 'sans', label: 'Sans', hint: 'The app’s own face' },
  { id: 'serif', label: 'Serif', hint: 'Book type' },
  { id: 'brand', label: 'Display', hint: 'The wordmark’s face, for a big title' },
  { id: 'rounded', label: 'Rounded', hint: 'Soft and friendly' },
  { id: 'mono', label: 'Mono', hint: 'Typewriter' },
];

/** The family name for a font id, given the theme's Fonts map; an unknown id gets the sans. */
export function fontFamilyFor(font: string, fonts: Record<string, string>): string {
  return fonts[font] ?? fonts.sans ?? 'sans-serif';
}

/** Below this many pixels a glyph is a smudge; the renderer draws bars instead (see the view). */
export const TEXT_LEGIBLE_PX = 4;

/** The default line height, as a multiple of the size. */
export const TEXT_DEFAULT_LEADING = 1.2;

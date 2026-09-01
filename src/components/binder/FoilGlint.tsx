/**
 * The glint is a POINTER affordance — light moving across a foil as the mouse crosses it — and a
 * touch screen has no pointer to move. Rather than invent a substitute nobody asked for (a looping
 * shimmer would draw the eye on a page of nine cards and never stop), native renders nothing and
 * keeps the static sheen that already sits under it.
 *
 * The web implementation lives in FoilGlint.web.tsx.
 */
import type { GlintMask } from '@/constants/printVariant';

export function FoilGlint(_props: { radius: number; mask: GlintMask }) {
  return null;
}

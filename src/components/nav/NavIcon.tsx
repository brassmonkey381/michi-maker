/**
 * Native: no glyph. There is no rail on iOS or Android and the drawer keeps its labels; the
 * web file beside this one draws the inline SVG. Same props, so callers never branch.
 */
import type { NavIconName } from '@/components/nav/navItems';

export function NavIcon(_props: { name: NavIconName; size?: number }) {
  return null;
}

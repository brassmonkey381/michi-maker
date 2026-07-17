/**
 * Left nav rail — native no-op. The real rail is web-only (AppRail.web.tsx); native keeps the
 * header-based navigation, so this resolves to nothing and the layout frame collapses.
 */
export function AppRail() {
  return null;
}

/**
 * THE CARD BROWSER'S LAYOUT (MIC-017 style picker, round 1). One place holds michi's choice for each
 * question the picker asks, so applying the owner's picks is a change here and nowhere else.
 *
 * `undefined` for a flag keeps the kit's width-based default (the phone's arrangement on a phone,
 * open strips on a desk). The values below are round 1's picks.
 *
 * In a UI-lab build (EXPO_PUBLIC_UI_LAB=1, used only to shoot the picker's screenshots) the address
 * can override them: `?ui=sheet,types,sort,arttop` turns those flags on, `?ui=none` turns all off.
 * A normal build ignores `?ui=` entirely.
 */
export interface BrowseLayout {
  filtersSheet?: boolean;
  typesDropdown?: boolean;
  sortDropdown?: boolean;
  artTypeInFilters?: boolean;
}

/**
 * Michi's choice: round 1 of the style picker (owner's picks, 2026-11-09, all four "our
 * suggestion"): one Filters panel at every width, the energy types and sort as dropdowns, and the
 * art type inside Filters.
 */
export const BROWSE_LAYOUT: BrowseLayout = { filtersSheet: true, typesDropdown: true, sortDropdown: true, artTypeInFilters: true };

/** Parse a `?ui=` value into a layout. Pure, for tests. */
export function parseUiParam(value: string | null | undefined): BrowseLayout | null {
  if (value == null) return null;
  const on = new Set(value.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean));
  if (on.has('none')) return { filtersSheet: false, typesDropdown: false, sortDropdown: false, artTypeInFilters: true };
  return {
    filtersSheet: on.has('sheet'),
    typesDropdown: on.has('types'),
    sortDropdown: on.has('sort'),
    // arttop keeps the art-type row on top even inside a Filters sheet.
    artTypeInFilters: !on.has('arttop'),
  };
}

/** The layout this page load uses: the lab override when allowed and present, else michi's choice. */
export function browseLayout(): BrowseLayout {
  if (process.env.EXPO_PUBLIC_UI_LAB === '1' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const lab = parseUiParam(new URLSearchParams(window.location.search).get('ui'));
    if (lab) return lab;
  }
  return BROWSE_LAYOUT;
}

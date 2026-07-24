/**
 * Theme variations — the DATA now lives in the shared **tcgscan-theme** package
 * (github:brassmonkey381/tcgscan-theme, pinned in package.json) so michi-maker and tcgscan-app
 * theme from one source. This file keeps michi's own RESOLUTION: which variant is active and how
 * its palette resolves under the effective scheme. `theme.ts` re-exports the resolved tokens, so
 * every component still imports `Palette`/`Colors`/`Radius`/`BinderSurface` from `@/constants/theme`.
 *
 * Selecting a variant on web (local dev): append `?variant=vintage`, or use the Settings picker
 * (writes localStorage + reloads). `neutral` is the default.
 *
 * NOTE: a few interactive/status tokens (accentSoft, link, success, danger, warning) were nudged
 * in the shared source to clear WCAG-AA — that's the one place michi's colours shifted when the
 * two apps unified. Everything else is michi's original palette, moved verbatim.
 */
import { Appearance, Platform } from 'react-native';

import {
  VARIANTS,
  VARIANT_LIST,
  isDarkHex,
  type Tokens,
  type VariantId,
} from 'tcgscan-theme';

export { VARIANTS, VARIANT_LIST };
export type { Tokens, VariantId };

/** The resolved semantic palette shape (light base keys). */
type PaletteRoles = Tokens['palette'];

const STORAGE_KEY = 'michi-variant';

function isId(v: string | null | undefined): v is VariantId {
  return !!v && v in VARIANTS;
}

/** Resolve the active variant id — URL `?variant=` wins, then localStorage (web). */
export function activeVariantId(): VariantId {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const q = new URLSearchParams(window.location.search).get('variant');
      if (isId(q)) return q;
      const s = window.localStorage?.getItem(STORAGE_KEY);
      if (isId(s)) return s;
    } catch {
      // ignore — fall through to default
    }
  }
  return 'neutral';
}

/** Persist + activate a variant (web dev switcher). Reloads so static styles re-eval. */
export function setVariant(id: VariantId) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(STORAGE_KEY, id);
      const url = new URL(window.location.href);
      url.searchParams.delete('variant');
      window.location.href = url.toString();
    } catch {
      // ignore
    }
  }
}

export const activeVariant: Tokens = VARIANTS[activeVariantId()];

/** The OS scheme at module load (web + native). Falls back to light. */
function loadTimeScheme(): 'light' | 'dark' {
  try {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * The palette for the active variant under the scheme in effect at load. Darkness is judged from
 * the variant's resolved background — not the raw OS scheme — because a variant may pin a scheme
 * (Dark Vault renders dark under a light OS). Resolves once at module load; a mid-session OS
 * scheme flip repaints the scheme-reactive `Colors` roles but needs a reload for palette-styled
 * chrome (the pre-existing limitation documented in theme.ts).
 */
export const activePalette: PaletteRoles = (() => {
  const roles = activeVariant.colors[loadTimeScheme()];
  return isDarkHex(roles.background)
    ? { ...activeVariant.palette, ...activeVariant.paletteDark }
    : activeVariant.palette;
})();

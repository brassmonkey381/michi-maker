/**
 * The shape of "how you last looked at your binder", and the guard on reading one back.
 *
 * Split out of the hook so it can be tested: `npm test` runs node --test over the repo's test
 * files with no bundler and no `@/` alias, so anything a test touches has to be reachable by a
 * relative import and free of React and Supabase. The hook that stores and resolves these lives
 * in `src/hooks/use-view-prefs.ts`.
 */

export interface ViewPrefs {
  /** Green ✓ on pockets holding a card you own. */
  owned: boolean;
  /** Your own photo of a card in place of catalog art. */
  scans: boolean;
  /** Pages paired like a physical binder: 1 alone, then 2·3, 4·5, … */
  doubleSided: boolean;
  /**
   * Where the page-navigation strip lives. Bottom is the default and the familiar one; left turns
   * it into a rail, which costs width instead of height — and height is what the page is short of.
   */
  navDock: 'bottom' | 'left';
}

export const VIEW_PREF_DEFAULTS: ViewPrefs = {
  owned: false,
  scans: false,
  doubleSided: false,
  navDock: 'bottom',
};

/**
 * Anything stored can be stale or hostile — a hand-edited profile row, or a shape from a release
 * that had different pills. Each field is taken only when it is genuinely a boolean, and anything
 * else falls back to the default rather than making a truthy string into an enabled pill.
 */
export function normalizeViewPrefs(value: unknown): ViewPrefs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const flag = (k: 'owned' | 'scans' | 'doubleSided') =>
    typeof raw[k] === 'boolean' ? (raw[k] as boolean) : VIEW_PREF_DEFAULTS[k];
  // A bag with none of our keys is not a preference we wrote; treat it as absent so the next
  // source in the precedence chain gets its say.
  if (!('owned' in raw) && !('scans' in raw) && !('doubleSided' in raw) && !('navDock' in raw)) {
    return null;
  }
  return {
    owned: flag('owned'),
    scans: flag('scans'),
    doubleSided: flag('doubleSided'),
    // An enum, not a boolean: anything that is not one of the two known values is not an answer.
    navDock: raw.navDock === 'left' || raw.navDock === 'bottom' ? raw.navDock : VIEW_PREF_DEFAULTS.navDock,
  };
}


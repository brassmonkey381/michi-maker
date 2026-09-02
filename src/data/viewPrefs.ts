/**
 * The shape of "how you last looked at your binder", and the guard on reading one back.
 *
 * Split out of the hook so it can be tested: `npm test` runs node --test over the repo's test
 * files with no bundler and no `@/` alias, so anything a test touches has to be reachable by a
 * relative import and free of React and Supabase. The hook that stores and resolves these lives
 * in `src/hooks/use-view-prefs.ts`.
 */

// The dock cap lives with the layout that enforces it, so there is one number rather than two.
import { DOCK_PCT_MAX } from './binderLayout.ts';
import { isCurrentEpoch, stamp } from './prefsEpoch.ts';

export interface ViewPrefs {
  /** Green ✓ on pockets holding a card you own. */
  owned: boolean;
  /** Your own photo of a card in place of catalog art. */
  scans: boolean;
  /** Pages paired like a physical binder: 1 alone, then 2·3, 4·5, … */
  doubleSided: boolean;
  /**
   * Where the page-navigation strip lives. Left is the default: as a rail it costs width instead
   * of height, and height is what the page is short of. Bottom is the older, more familiar spot.
   */
  navDock: 'bottom' | 'left';
  /**
   * How much of the WINDOW each side dock takes, 0..1, when its edge has been dragged.
   *
   * A fraction and not pixels, because the choice travels to a monitor of a different size: "about
   * a third" survives that trip and "620px" does not. Zero means NO CHOICE MADE — size me the way
   * you always did — so nobody who has never touched a handle notices this exists.
   *
   * The layout clamps it and never writes the clamped value back: a window too narrow to honour
   * the choice must not quietly erase it.
   */
  cardsDockPct: number;
  artDockPct: number;
}

export const VIEW_PREF_DEFAULTS: ViewPrefs = {
  owned: true,
  scans: false,
  doubleSided: true,
  navDock: 'left',
  cardsDockPct: 0,
  artDockPct: 0,
};

/**
 * The 2026-09-01 rollout, applied to a bag stored before it (see `prefsEpoch`). Owned ticks,
 * double-sided spreads and the left rail are how a binder is meant to read, and almost nobody was
 * finding the three pills that say so.
 *
 * `scans` is NOT in here on purpose. The rollout names three settings, and reaching past those
 * into a fourth someone had already answered would be the thing the epoch exists to avoid.
 */
function applyEpoch(prefs: ViewPrefs): ViewPrefs {
  return { ...prefs, owned: true, doubleSided: true, navDock: 'left' };
}

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
  if (
    !('owned' in raw) &&
    !('scans' in raw) &&
    !('doubleSided' in raw) &&
    !('navDock' in raw) &&
    !('cardsDockPct' in raw) &&
    !('artDockPct' in raw)
  ) {
    return null;
  }
  /**
   * A number, and a number in range. A stored NaN, Infinity or 3 would put a dock over the page —
   * and out-of-range is REJECTED rather than clamped, for the same reason `flag` rejects a truthy
   * string: a value this code could not have written is not an answer, so the default stands.
   */
  const pct = (k: 'cardsDockPct' | 'artDockPct') => {
    const v = raw[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= DOCK_PCT_MAX
      ? v
      : VIEW_PREF_DEFAULTS[k];
  };
  const prefs: ViewPrefs = {
    owned: flag('owned'),
    scans: flag('scans'),
    doubleSided: flag('doubleSided'),
    // An enum, not a boolean: anything that is not one of the two known values is not an answer.
    navDock:
      raw.navDock === 'left' || raw.navDock === 'bottom' ? raw.navDock : VIEW_PREF_DEFAULTS.navDock,
    cardsDockPct: pct('cardsDockPct'),
    artDockPct: pct('artDockPct'),
  };
  // Written before the current rollout: force that rollout's settings on, keep the rest of what
  // they chose. Idempotent, so it re-applies harmlessly on every read until they next save.
  return isCurrentEpoch(raw) ? prefs : applyEpoch(prefs);
}

/**
 * The bag we write, stamped so the rollout above does not re-apply over the owner's own choice.
 *
 * Spelled out as an object type rather than `ViewPrefs & { v: number }` because the generated
 * `preferences` column is a recursive Json union: TypeScript infers an index signature for an
 * anonymous type literal but never for an interface, so the tidier return type is the one that
 * will not assign.
 */
export function storedViewPrefs(prefs: ViewPrefs): {
  owned: boolean;
  scans: boolean;
  doubleSided: boolean;
  navDock: 'bottom' | 'left';
  cardsDockPct: number;
  artDockPct: number;
  v: number;
} {
  return stamp({
    owned: prefs.owned,
    scans: prefs.scans,
    doubleSided: prefs.doubleSided,
    navDock: prefs.navDock,
    cardsDockPct: prefs.cardsDockPct,
    artDockPct: prefs.artDockPct,
  });
}

/**
 * A TEMPORARY SWITCH FOR THE PAGE-TURN MOUNT FLASH. Delete this file and its four call sites once
 * one of the options wins (see docs at the bottom of this comment for exactly where they are).
 *
 * THE PROBLEM. A binder page turn mounts fresh copies of pages that are already on screen, and
 * every fresh `CardImage` paints an opaque pulsing Skeleton over its pocket until `onLoad` fires.
 * `onLoad` is asynchronous even for an image sitting in the memory cache, so the block paints for a
 * frame or two on EVERY turn no matter how warm the cache is. That is why prefetching the pages a
 * turn reveals did nothing for it. Owner artwork has the same problem wearing a different hat: a
 * hardcoded 120ms fade-in that runs on every copy.
 *
 * Three different ways to stop it, one switch, so they can be compared in one build instead of
 * three. `off` is byte-for-byte today's behaviour, so the comparison always has a baseline.
 *
 *   off     What ships today. Skeleton on every mount, fade on every artwork.
 *   copies  Animation copies are silent. Narrow: only the decorative grids a turn mounts skip the
 *           skeleton and the fade. Real pages behave exactly as they do now. Cannot regress a
 *           genuine load, because a decorative copy is BY DEFINITION a copy of something already
 *           on screen; worst case it is briefly transparent instead of briefly grey.
 *   delay   Nothing appears unless loading is genuinely slow. Global: the skeleton waits
 *           SKELETON_DELAY_MS before painting, so anything that resolves quickly (every cache hit)
 *           never shows one at all, and artwork stops fading. Needs no bookkeeping and helps cold
 *           loads too, but a slow first load now sits on an empty pocket for a beat before the
 *           skeleton admits it is working.
 *   cache   Known-cached images mount silently. Global and exact: URLs that have loaded once, or
 *           that the page-turn prefetcher has warmed, are remembered, and an image whose URL is on
 *           that list starts out already loaded with no skeleton and no fade. The most precise of
 *           the three and the only one that makes the existing prefetch pay for itself, at the
 *           cost of carrying a Set around.
 *
 * HOW TO SWITCH. Add `?flash=copies` (or `delay`, `cache`, `off`) to any michi URL. The choice is
 * remembered in localStorage, so it survives moving around the app, and it is read ONCE at load:
 * changing it means a reload, which is what you want anyway when comparing two renderers. The
 * active mode is logged to the console at startup so there is never any doubt which one is on.
 *
 * Call sites: BinderGrid.tsx (CardImage, ArtworkImage) and BinderPages.tsx (the prefetcher).
 */

export type FlashMode = 'off' | 'copies' | 'delay' | 'cache';

const MODES: FlashMode[] = ['off', 'copies', 'delay', 'cache'];
const STORAGE_KEY = 'michi.flashMode';

/** How long a load may take before the skeleton appears, in `delay` mode. */
export const SKELETON_DELAY_MS = 140;

function read(): FlashMode {
  // Native has no URL to put a query on and no localStorage; it runs the shipped behaviour.
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return 'off';
  try {
    const asked = new URLSearchParams(window.location.search).get('flash');
    if (asked && (MODES as string[]).includes(asked)) {
      window.localStorage.setItem(STORAGE_KEY, asked);
      return asked as FlashMode;
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && (MODES as string[]).includes(saved)) return saved as FlashMode;
  } catch {
    // A browser with site data blocked still gets a working binder, just not the switch.
  }
  return 'off';
}

/**
 * Read once, at module load. A mode that could change mid-session would mean two pages of the same
 * spread rendering under different rules, which is the one thing that would make this untestable.
 */
export const FLASH_MODE: FlashMode = read();

if (FLASH_MODE !== 'off' && typeof console !== 'undefined') {
  // Logged deliberately: the whole point is knowing which option you are looking at.
  console.log(`[michi] page-turn flash mode: ${FLASH_MODE} (?flash=off to restore the default)`);
}

/**
 * URLs known to be in the image cache: every one that has fired onLoad in this session, plus every
 * one the page-turn prefetcher has warmed. Only consulted in `cache` mode, and only ever grown, so
 * a wrong answer is impossible in one direction: an image can be missing from it (and simply
 * behaves as it does today) but can never be on it without having been fetched.
 */
const warmed = new Set<string>();

/** Remember that this URL's bytes have been fetched. No-op unless `cache` mode is running. */
export function markWarm(uri: string | null | undefined): void {
  if (FLASH_MODE !== 'cache' || !uri) return;
  warmed.add(uri);
}

/** Whether this URL can be drawn immediately, with no skeleton and no fade. */
export function isWarm(uri: string | null | undefined): boolean {
  return FLASH_MODE === 'cache' && !!uri && warmed.has(uri);
}

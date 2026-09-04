/**
 * A TASTE OF THEME SEARCH. `theme:` is a PRO feature, and the cheatsheet's one theme recipe is
 * deliberately not gated: pressing Try it on it arms this switch, and while it is armed the
 * browser does not lock theme search. The switch is released the moment the browser is asked to
 * do anything else (another command) or is closed, so the taste is one recipe's worth, not a
 * loophole — and the plan wall is still one typed query away for everything else.
 *
 * Module-level, like the browse command bus it rides beside: the cheatsheet arms it on one page
 * and the browser on the next reads it, with nothing threaded through the router.
 */
import { useSyncExternalStore } from 'react';

/**
 * The one theme query given away. Checked against the live search on 2026-09-03: forest is one of
 * the three largest captioned scenes (sky 120, glow 112, forest 105) and the most page-like of
 * them. Galaxy and castle, the obvious guesses, have no captions at all.
 */
export const FREE_THEME_SAMPLE = 'theme:forest';

let armed = false;
const listeners = new Set<() => void>();

function set(on: boolean) {
  if (armed === on) return;
  armed = on;
  listeners.forEach((l) => l());
}

/** Arm before sending the sample query to the browser. */
export function armFreeThemeSample(): void {
  set(true);
}

/** Release: any other browse command, or the browser leaving. */
export function releaseFreeThemeSample(): void {
  set(false);
}

/** True while the sample is live and theme search should not be locked. */
export function useFreeThemeSample(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => armed,
    () => armed,
  );
}

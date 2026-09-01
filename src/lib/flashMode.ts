/**
 * WHEN A POCKET IS ALLOWED TO SAY IT IS LOADING.
 *
 * `CardImage` paints an opaque pulsing Skeleton over its pocket from the moment it mounts until
 * `onLoad` fires, and `onLoad` is asynchronous even for an image already in the memory cache. On a
 * page turn that means a pocket can announce a load that has, in practice, already happened.
 *
 * So the skeleton waits. Nothing that resolves inside the length of a page turn ever shows one,
 * which covers every cache hit and most warm-network loads; a genuinely slow load still gets its
 * skeleton, just after the turn it was competing with has finished. The delay is TURN_MS on
 * purpose rather than a tuned constant: the question a skeleton answers is "is this taking longer
 * than the thing you are watching", and the thing you are watching is the turn.
 *
 * `?flash=off` on any URL turns the wait off and restores the immediate skeleton, for comparison.
 * The choice is remembered in localStorage and read once at load.
 */
import { TURN_MS } from '@/components/binder/pageTurn';

const STORAGE_KEY = 'michi.flashMode';

/** How long a load may run before the skeleton appears: exactly one page turn. */
export const SKELETON_DELAY_MS = TURN_MS;

function read(): boolean {
  // Native has no URL to put a query on and no localStorage; it takes the default.
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return true;
  try {
    const asked = new URLSearchParams(window.location.search).get('flash');
    if (asked === 'off' || asked === 'delay') {
      window.localStorage.setItem(STORAGE_KEY, asked);
      return asked === 'delay';
    }
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    // A browser with site data blocked still gets a working binder, just not the switch.
    return true;
  }
}

/**
 * Read once, at module load. A value that could change mid-session would mean two pockets of the
 * same page disagreeing about when to draw a skeleton.
 */
export const SKELETON_DELAYED: boolean = read();

/**
 * DIAGNOSTICS FOR THE PAGE-TURN FLASH. Temporary. Delete this file and its call sites once the
 * cause is known: BinderPages.tsx (the turn) and BinderGrid.tsx (the pockets).
 *
 * Three rounds of candidate fixes have now missed, so these are not fixes. Each one REMOVES one
 * layer of the turn so that what is left either still flashes or does not, and every switch is
 * chosen so that the answer means something on its own:
 *
 *   slow      The turn takes six times as long. Does not change what happens, only how long you
 *             have to look at it. A one-frame artefact stays one frame and becomes a blink at a
 *             known moment; a per-frame artefact stretches out with the animation. Combine this
 *             with any of the others.
 *   noimages  Pockets draw a flat colour instead of an image, so no <Image> mounts, decodes,
 *             fades or loads anywhere. If it STILL flashes, images are not involved at all and
 *             everything about caching, prefetching and skeletons is a dead end for good.
 *   nooverlay No leaf, no turning sheet, no overlay: the spread simply changes. If it still
 *             flashes, the flash belongs to the page CHANGE and not to the animation.
 *   hold      The overlay is never taken down; it stays on screen frozen at the end of its arc.
 *             If the flash goes, the flash is the unmount, and the fix is to hand over from the
 *             overlay to the settled spread more carefully.
 *   freeze    The settled spread underneath keeps drawing the OLD pages until the turn ends, so
 *             nothing under the overlay changes mid-turn. If the flash goes, the flash is the
 *             base spread remounting under the animation and showing through it.
 *
 * HOW TO SWITCH. Add `?turn=slow` to any binder URL, or several at once: `?turn=slow,noimages`.
 * `?turn=off` clears it. Remembered in localStorage, read once at load, logged to the console.
 */

const FLAGS = ['slow', 'noimages', 'nooverlay', 'hold', 'freeze'] as const;
type Flag = (typeof FLAGS)[number];

const STORAGE_KEY = 'michi.turnProbe';

/** How much longer a turn runs under `slow`. Enough to watch, not so long it stops reading as one. */
export const SLOW_FACTOR = 6;

function read(): Set<string> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return new Set();
  try {
    const asked = new URLSearchParams(window.location.search).get('turn');
    if (asked !== null) {
      const kept = asked
        .split(',')
        .map((f) => f.trim())
        .filter((f) => (FLAGS as readonly string[]).includes(f));
      window.localStorage.setItem(STORAGE_KEY, kept.join(','));
      return new Set(kept);
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return new Set(saved ? saved.split(',').filter(Boolean) : []);
  } catch {
    // Site data blocked: the binder works, the switch does not.
    return new Set();
  }
}

const on = read();
const has = (f: Flag) => on.has(f);

/**
 * Read once, at module load. A probe that could change mid-session would mean two halves of the
 * same spread being drawn under different rules, which is the one thing that would make the
 * results meaningless.
 */
export const PROBE = {
  slow: has('slow'),
  noImages: has('noimages'),
  noOverlay: has('nooverlay'),
  hold: has('hold'),
  freeze: has('freeze'),
  any: on.size > 0,
};

if (PROBE.any && typeof console !== 'undefined') {
  // The point is knowing which probe you are looking at.
  console.log(`[michi] turn probe: ${[...on].join(', ')} (?turn=off to clear)`);
}

/**
 * A stable colour per pocket for `noimages`, so pages still look different from one another and a
 * swap is still visible. Hue from the id, nothing clever: the eye only needs to tell two pages
 * apart, and identical grey rectangles would hide the very thing being looked for.
 */
export function probeColour(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 62%)`;
}

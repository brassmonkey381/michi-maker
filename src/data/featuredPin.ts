/**
 * A TIME-LIMITED PIN on the Featured shelf.
 *
 * Featured is a rolling three-day likes leaderboard (`featured_binders`), which is the right way to
 * run that shelf and the reason house binders are demoted inside it: it exists to put members' work
 * in front of people. A pin suspends that for one binder, so it is deliberately the smallest,
 * loudest exception we can write, and it EXPIRES ON ITS OWN.
 *
 * WHY THIS ONE (owner, 2026-09-11). The anniversary cards came out two days ago and there is
 * already a thirty-page binder built on them. That is the claim worth making right now, and it is
 * only worth making right now: in a month it is an ordinary binder about an ordinary set, and the
 * pin would just be us standing in front of our own members. Hence the date rather than a boolean.
 *
 * THE EXPIRY IS THE POINT. Nobody has to remember to take it down, and a pin that outlives its
 * reason cannot quietly become permanent, which is what every "temporary" flag in every codebase
 * eventually does. When it lapses the shelf goes back to being purely earned, with no code change
 * and nothing to clean up.
 */

export interface FeaturedPin {
  /** The binder's id. The BUNDLED id, since the pin prepends the example rather than a database row. */
  binderId: string;
  /** Exclusive: the pin is live strictly before this instant. ISO date, UTC midnight. */
  until: string;
  /** Shown nowhere. Here so the next reader knows what it was for without a commit archaeology dig. */
  because: string;
}

/** Set to null when nothing is pinned. One at a time, on purpose. */
export const FEATURED_PIN: FeaturedPin | null = {
  binderId: 'anniv-thirty-years',
  until: '2026-09-18',
  because:
    'The 30th anniversary sets landed on 2026-09-09 and this thirty-page binder was built on them '
    + 'two days later. Seven days to show that, then it competes like everything else.',
};

/**
 * The pin if it is live at `nowMs`, otherwise null.
 *
 * A malformed date is treated as EXPIRED rather than as forever. The failure modes are not
 * symmetric: a pin that quietly stops early costs us a week of promotion, and one that quietly
 * never stops is the thing this whole module exists to prevent.
 */
export function activePin(nowMs: number, pin: FeaturedPin | null = FEATURED_PIN): FeaturedPin | null {
  if (!pin) return null;
  const until = Date.parse(`${pin.until}T00:00:00Z`);
  if (Number.isNaN(until)) return null;
  return nowMs < until ? pin : null;
}

/**
 * The Featured list with the pinned binder at the front.
 *
 * `all` is every binder the app holds (the bundled examples included); `featured` is what the
 * leaderboard returned. The pinned binder is removed from the ranked part first, so a binder that
 * is both pinned AND earning likes appears once, at the front, rather than twice.
 */
export function withPinnedFeatured<T extends { id: string }>(
  featured: T[],
  all: T[],
  nowMs: number,
  pin: FeaturedPin | null = FEATURED_PIN,
): T[] {
  const live = activePin(nowMs, pin);
  if (!live) return featured;
  const pinned = all.find((b) => b.id === live.binderId);
  // A pin naming a binder that is not there is a typo, not an emergency: leave the shelf alone.
  if (!pinned) return featured;
  return [pinned, ...featured.filter((b) => b.id !== live.binderId)];
}

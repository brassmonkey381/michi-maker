/**
 * FORCING A SETTING ON, ONCE, WITHOUT TAKING IT AWAY AGAIN.
 *
 * Changing a default only reaches people who have never touched the setting. Everyone else has a
 * stored preference — in AsyncStorage on this device, in `profiles.preferences` on their account —
 * and a stored preference outranks a default forever, which is the whole point of storing it. So
 * "everyone gets double-sided on today" is not a default change; it is a one-time upgrade applied
 * to what is already stored.
 *
 * THE MECHANISM IS A STAMP, NOT A REWRITE. Every bag we write carries `v: PREFS_EPOCH`. A bag read
 * back without the current stamp is run through that store's upgrade before it is used. Nothing is
 * migrated server-side and nothing is deleted: the upgrade is pure and idempotent, so it costs one
 * function call per read and re-applies harmlessly until the person next changes something, at
 * which point their own choice is written back WITH the stamp and the upgrade stops applying to
 * them. That is what makes this a nudge rather than a lock — they can turn any of it off, and it
 * stays off.
 *
 * IT TOUCHES ONLY THE SETTINGS IT NAMES. An upgrade that reset a bag to the new defaults would
 * also quietly undo every unrelated choice in it, so each store's upgrade forces exactly the
 * fields in this rollout and passes the rest through untouched.
 *
 * BUMPING IT. Raise the number for the next rollout that has to reach people who already chose,
 * and change the upgrades to match. Do not raise it for an ordinary default change: a default is
 * for people who have not decided, and reaching past that into what someone did decide should be
 * a deliberate, occasional act.
 */

/** Rollout 1 (2026-09-01): double-sided, owned ticks, the left page rail, and labelled cards. */
export const PREFS_EPOCH = 1;

/** Has this stored bag already been through the current rollout? */
export function isCurrentEpoch(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && (raw as { v?: unknown }).v === PREFS_EPOCH;
}

/**
 * Mark a bag as having been through it, on the way to being stored. Paired with `isCurrentEpoch`
 * here rather than written out at each call site, so the two can never disagree about the key.
 */
export function stamp<T extends object>(bag: T): T & { v: number } {
  return { ...bag, v: PREFS_EPOCH };
}

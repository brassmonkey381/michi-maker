/**
 * THE OPENING RIFFLE: how a `?page=N` link gets from the front of the binder to page N.
 *
 * Jumping straight there is correct and reads as nothing at all: the binder simply appears already
 * open, and a reader who followed a link to page 14 has no idea the other thirteen exist. Turning
 * the pages instead says "this is a book, and your page is a way in" in about two seconds, which is
 * the whole reason the app draws pockets rather than a grid of pictures.
 *
 * The shape of the plan, and why it is not just "turn N times":
 *
 *   - THE TOTAL IS FIXED, not the per-page rate. A four page hop and a forty page hop both finish
 *     in the same couple of seconds, because the wait is the reader's cost and it should not scale
 *     with how deep the link points. So a long hop JUMPS most of the way instantly and riffles only
 *     the last stretch. The reader still sees pages moving under their thumb and still lands on N.
 *   - THERE IS A FLOOR UNDER THE STEP. Below roughly a tenth of a second a turn stops reading as a
 *     turn and becomes a flicker, which looks like a bug rather than an animation.
 *   - THERE IS A CEILING TOO. A two page hop should not luxuriate for a second per page just
 *     because it has the budget; it should feel brisk and get out of the way.
 *   - IT HOLDS STILL FIRST. The binder paints, the reader sees where they are, and only then does
 *     it move. Without the hold the movement has already happened before anyone has focused on it.
 *
 * Pure on purpose: the timing is the part worth testing and the part worth arguing about, and none
 * of it needs a component. `use-opening-flip` runs the plan; `openingFlip.test.ts` pins it.
 */

export interface FlipOptions {
  /** Total time the riffle may take, excluding the hold. */
  budgetMs?: number;
  /** The fastest a single turn may be and still read as a turn. */
  minStepMs?: number;
  /** The slowest a single turn should be when there is budget to spare. */
  maxStepMs?: number;
  /** How long the binder sits still before the first turn. */
  holdMs?: number;
  /** Honour the reader's reduce-motion setting: land on the page with no movement at all. */
  reduceMotion?: boolean;
}

export interface FlipPlan {
  /** The page the binder shows while it is still, before any turning. */
  startAt: number;
  /** Page indexes to step through in order, ending on the target. Empty means nothing to animate. */
  steps: number[];
  /** Milliseconds between steps. */
  stepMs: number;
  /** Milliseconds to hold on `startAt` before the first step. */
  holdMs: number;
}

export const FLIP_BUDGET_MS = 2200;
export const FLIP_MIN_STEP_MS = 150;
export const FLIP_MAX_STEP_MS = 420;
export const FLIP_HOLD_MS = 420;

/** The whole opening, cover included, must land inside this. Owner's number: two to three seconds. */
export const FLIP_TOTAL_MS = 2900;
/** How long the shut binder is seen before the cover starts to move. Long enough to register. */
export const FLIP_COVER_BEAT_MS = 260;

/**
 * The riffle's share of the opening, once the cover has taken its turn.
 *
 * A binder with a cover spends the beat plus one COMPLETE cover turn before a single page moves,
 * and that turn is not negotiable: a cover that opens in a third of a turn reads as a glitch, not
 * as a book. So the cover is paid first and the riffle gets the remainder, which is why a binder
 * with a cover riffles faster than one without to reach the same page in the same total.
 */
export function riffleBudget(coverTurnMs: number): { holdMs: number; budgetMs: number } {
  const holdMs = coverTurnMs > 0 ? FLIP_COVER_BEAT_MS + coverTurnMs : FLIP_HOLD_MS;
  return { holdMs, budgetMs: Math.max(FLIP_MIN_STEP_MS, FLIP_TOTAL_MS - holdMs) };
}

/**
 * How to get from the front of the binder to `target` (a zero-based page index).
 *
 * `target <= 0` is the ordinary case of a link with no page on it, and plans nothing: the binder
 * opens at the front and stays there.
 */
export function flipPlan(target: number, opts: FlipOptions = {}): FlipPlan {
  const budgetMs = opts.budgetMs ?? FLIP_BUDGET_MS;
  const minStepMs = opts.minStepMs ?? FLIP_MIN_STEP_MS;
  const maxStepMs = opts.maxStepMs ?? FLIP_MAX_STEP_MS;
  const holdMs = opts.holdMs ?? FLIP_HOLD_MS;

  if (!Number.isInteger(target) || target <= 0) {
    return { startAt: 0, steps: [], stepMs: minStepMs, holdMs };
  }
  // Reduce motion: be where the link asked for, immediately. Not a shorter animation, none.
  if (opts.reduceMotion) return { startAt: target, steps: [], stepMs: minStepMs, holdMs: 0 };

  /** The most turns the budget can pay for at the floor rate. */
  const maxSteps = Math.max(1, Math.floor(budgetMs / minStepMs));

  if (target <= maxSteps) {
    // Every page gets turned. Spend the budget, but never dawdle past the ceiling.
    // FLOOR, not round: rounding up puts steps * stepMs past the budget and the total over its
    // ceiling, which is the one promise this module makes.
    const stepMs = Math.min(maxStepMs, Math.max(minStepMs, Math.floor(budgetMs / target)));
    return { startAt: 0, steps: range(1, target), stepMs, holdMs };
  }

  // Too deep to show in full: open partway in and riffle the last stretch at the floor rate.
  const startAt = target - maxSteps;
  return { startAt, steps: range(startAt + 1, target), stepMs: minStepMs, holdMs };
}

/** The total wall time a plan takes, for callers that need to know when it is over. */
export function flipDuration(plan: FlipPlan): number {
  return plan.holdMs + plan.steps.length * plan.stepMs;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

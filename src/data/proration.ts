/**
 * THE money + print maths for mid-term plan changes. One implementation, imported by everything
 * that needs it — the app, `stripe-checkout` (quote AND charge), and `payments-webhook` (the
 * allocation it writes to the ledger).
 *
 * This module exists because the maths used to live in three hand-copied places, and they drifted:
 * a mid-term upgrade quoted the right PRICE while granting a full fresh year of PRINTS. Anything
 * that computes a proration must import from here rather than reimplement it.
 *
 * Deliberately dependency-free (no React, no Supabase, no Stripe, no Deno globals) so it runs
 * unchanged in the Expo bundle, in a Deno edge function, and under `node --test`.
 *
 * The rule, decided by the owner: prorate by WHOLE MONTHS, never by the second. You keep your old
 * plan's rate for the months you already served and pick up the new plan's rate for the months
 * still to come. Stripe prorates to the second and would say $59.55 two days into a year where the
 * offer is plainly "$60 — a year of VIP minus a year of PRO".
 */

export const MONTHS_PER_YEAR = 12;

/**
 * Included prints per month, by michi tier product key. The single source of this table.
 *
 * ZERO ON EVERY TIER SINCE THE 2026-09 REWORK. `tier_caps.includedPrintsPerMonth` was set to 0 for
 * the whole app (migration 20260920130000) — prints are in no plan; the print offer is being
 * reworked and until then nothing is "included". This constant kept saying 1 and 3 for three
 * months because it is a SECOND mirror, keyed by product rather than tier, and nothing ran the
 * guard that compares it (scripts/check-tier-caps.mjs, which reports it by name).
 *
 * It was not a money leak — `michi_print_window` short-circuits at rate 0 server-side, so the
 * server granted nothing regardless. It was worse in a quieter way: `termPrintAllocation` below
 * feeds `payments-webhook`, which stamped `term_print_allocation: 12` onto every new PRO yearly
 * entitlement, and it feeds the plan-change confirm dialog, which quoted a print allocation the
 * server would never honour. The ledger and the dialog both promised something that did not exist.
 *
 * If prints come back, change `tier_caps` first and let the guard tell you to change this.
 */
export const PRINTS_PER_MONTH: Record<string, number> = {
  tier_pro: 0,
  tier_vip: 0,
};

/**
 * Add `n` months, clamping the day to the target month's length so a term anchored on the 31st
 * doesn't skip February. Mirrors how billing anniversaries actually behave.
 */
export function addMonths(ms: number, n: number): number {
  const src = new Date(ms);
  const day = src.getUTCDate();
  const out = new Date(ms);
  // Move off the day-of-month first, or setUTCMonth can roll a 31st into the next month.
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const daysInTarget = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, daysInTarget));
  return out.getTime();
}

/**
 * Whole months elapsed since `startMs`, clamped to [0, cap]. Never negative (a future term reads
 * as 0) and never past the cap, so a lagging webhook can't produce a negative remainder.
 */
export function monthsElapsed(startMs: number, nowMs: number, cap = MONTHS_PER_YEAR): number {
  const s = new Date(startMs);
  const n = new Date(nowMs);
  let months = (n.getUTCFullYear() - s.getUTCFullYear()) * 12 + (n.getUTCMonth() - s.getUTCMonth());
  // Step back until the anniversary has genuinely passed. Compare the full INSTANT, not just the
  // date: an earlier draft checked `n.getUTCDate() < s.getUTCDate()`, which treats the anniversary
  // as starting at midnight and so counted a whole extra month for anyone acting in the hours
  // before it — a $5 swing on a PRO→VIP quote. A unit test caught the two copies disagreeing.
  if (addMonths(startMs, months) > nowMs) months -= 1;
  return Math.max(0, Math.min(cap, months));
}

/** A price's cost per month in minor units. Yearly prices divide by 12. */
export function perMonthMinor(amountMinor: number | null | undefined, interval: string | null | undefined): number | null {
  if (typeof amountMinor !== 'number' || !interval) return null;
  if (interval === 'year') return amountMinor / MONTHS_PER_YEAR;
  if (interval === 'month') return amountMinor;
  return null;
}

export interface UpgradeQuoteInput {
  fromAmountMinor: number | null | undefined;
  fromInterval: string | null | undefined;
  toAmountMinor: number | null | undefined;
  toInterval: string | null | undefined;
  /** Seconds since epoch — the current term's start. */
  periodStartSec: number | null;
  nowMs: number;
}

/**
 * What moving up costs today: `(newPerMonth − oldPerMonth) × whole months left in the term`.
 *
 * A full year left of PRO → VIP is $99.99 − $39.99 = $60.00; three months left is a quarter of
 * each, $15.00. Returns null when the model doesn't apply (cross-interval, missing data) — callers
 * must then refuse or fall back rather than invent a number.
 */
export function upgradeQuoteMinor(input: UpgradeQuoteInput): number | null {
  const { fromAmountMinor, fromInterval, toAmountMinor, toInterval, periodStartSec, nowMs } = input;
  const from = perMonthMinor(fromAmountMinor, fromInterval);
  const to = perMonthMinor(toAmountMinor, toInterval);
  if (from == null || to == null || !periodStartSec) return null;
  // Across intervals "months remaining" has no honest reading — a monthly plan has at most one.
  if (fromInterval !== toInterval) return null;
  const termMonths = toInterval === 'year' ? MONTHS_PER_YEAR : 1;
  const left = Math.max(0, termMonths - monthsElapsed(periodStartSec * 1000, nowMs, termMonths));
  return Math.round((to - from) * left);
}

/**
 * Included prints for the WHOLE term after a plan change, prorated the same way as the price:
 * old rate for months served, new rate for months remaining.
 *
 * Upgrading to VIP 8 months into a PRO year gives `1×8 + 3×4 = 20` — which is the owner's framing
 * (full PRO year 12, plus 4 months of VIP 12, minus the 4 PRO months replaced 4). A fresh
 * subscriber is the `monthsElapsed = 0` case, so this also produces the plain `rate × 12`.
 *
 * Yearly terms only — monthly plans have no annual pool. Returns null when it doesn't apply.
 */
export function termPrintAllocation(
  fromProduct: string | null | undefined,
  toProduct: string | null | undefined,
  toInterval: string | null | undefined,
  periodStartSec: number | null,
  nowMs: number,
): number | null {
  const newRate = toProduct ? PRINTS_PER_MONTH[toProduct] : undefined;
  if (newRate === undefined || toInterval !== 'year' || !periodStartSec) return null;
  const oldRate = fromProduct ? PRINTS_PER_MONTH[fromProduct] : undefined;
  return termPrintPool(oldRate, newRate, monthsElapsed(periodStartSec * 1000, nowMs));
}

/**
 * The pool arithmetic alone, with the rates HANDED IN rather than read from the table above.
 *
 * Split out so the formula can be tested independently of what michi happens to sell this month.
 * The tests for this once asserted 12, 20, 28 and 36 by reading the live rates, so setting every
 * tier to 0 in the 2026-09 rework turned four genuine regression tests into four failures about
 * business policy — and the pressure then is to delete them, which would throw away the guard for
 * a real shipped bug: a mid-term upgrade four months into a year granted a FRESH year (36) instead
 * of the prorated 28. That bug is in the arithmetic, and the arithmetic has not changed.
 *
 * `oldRate === undefined` means no prior plan — a fresh subscription, or a renewal onto a new
 * term — so the whole year bills at the new rate.
 */
export function termPrintPool(
  oldRate: number | undefined,
  newRate: number,
  elapsedMonths: number,
): number {
  if (oldRate === undefined) return newRate * MONTHS_PER_YEAR;
  return oldRate * elapsedMonths + newRate * (MONTHS_PER_YEAR - elapsedMonths);
}

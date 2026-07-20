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

/** Included prints per month, by michi tier product key. The single source of this table. */
export const PRINTS_PER_MONTH: Record<string, number> = {
  tier_pro: 1,
  tier_vip: 3,
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
  const elapsed = monthsElapsed(periodStartSec * 1000, nowMs);
  // No prior plan (fresh subscription or renewal onto a new term): the whole year at the new rate.
  if (oldRate === undefined) return newRate * MONTHS_PER_YEAR;
  return oldRate * elapsed + newRate * (MONTHS_PER_YEAR - elapsed);
}

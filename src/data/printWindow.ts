/**
 * Which included prints are available RIGHT NOW, and over what window they're counted.
 *
 * Pure data/logic (no React, no Supabase), same discipline as tiers.ts — the print sheet and the
 * plan meters both resolve through here so they can never disagree about the allocation.
 *
 * Three windows exist:
 *
 *   'calendar'  No billing term on the entitlement row (manual grant, lifetime unlock, or the
 *               interval columns not yet applied to the live DB). Falls back to the calendar
 *               month — exactly the behaviour that shipped before terms existed.
 *   'month'     A monthly slice of the real billing term, anchored on the subscription
 *               anniversary. Used for monthly subscribers AND for yearly subscribers who
 *               haven't unlocked their pool. Fixes the old calendar-month bug where subscribing
 *               on the 28th handed out two allocations in four days.
 *   'year'      The whole annual term at once, released to a yearly subscriber who unlocked their
 *               pool. The total is `term_print_allocation` when the webhook has computed one —
 *               PRO 12 / VIP 36 on a full year, PRORATED down if they upgraded mid-term — and
 *               falls back to 12× the monthly rate when it hasn't.
 *
 * The pool unlock is IRREVERSIBLE within a term and resets on renewal — that lives in the
 * schema (no update/delete policies, row keyed to period_start), not here.
 */

/** How the subscription that granted a tier is billed. NULL = not a subscription grant. */
export type BillingInterval = 'month' | 'year';

/** Months of allocation released at once when a yearly subscriber unlocks their pool. */
export const MONTHS_PER_YEAR = 12;

export interface PrintWindow {
  /** Count print_events at or after this instant. */
  startMs: number;
  /** Included prints available across this window. Infinity when metering is off. */
  allocation: number;
  kind: 'calendar' | 'month' | 'year';
  /** When this window rolls over — i.e. when the next allocation arrives. */
  resetsAtMs: number;
}

export interface PrintWindowInput {
  /** TierLimits.includedPrintsPerMonth for the user's tier. */
  includedPerMonth: number;
  interval: BillingInterval | null;
  /** entitlements.period_start for the active tier row, in ms. */
  periodStartMs: number | null;
  /** Has this exact term's annual pool been unlocked? */
  poolUnlocked: boolean;
  /**
   * entitlements.term_print_allocation — prints for the WHOLE term, already prorated for any
   * mid-term upgrade by the webhook. null falls back to a full year at the current rate, which is
   * right for fresh subscribers and for rows written before the column existed.
   */
  termAllocation?: number | null;
  nowMs: number;
}

/** The term's pool total: the stored (prorated) figure when we have one, else a full year. */
function poolTotal(includedPerMonth: number, termAllocation?: number | null): number {
  if (!Number.isFinite(includedPerMonth)) return includedPerMonth; // unlimited stays unlimited
  return termAllocation != null ? termAllocation : includedPerMonth * MONTHS_PER_YEAR;
}

/**
 * Add `n` months, clamping the day to the target month's length so a term anchored on the 31st
 * doesn't skip February. Mirrors how billing anniversaries actually behave.
 */
export function addMonths(ms: number, n: number): number {
  const src = new Date(ms);
  const day = src.getDate();
  const out = new Date(ms);
  // Move off the day-of-month first, or setMonth can roll a 31st into the next month.
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  const daysInTarget = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, daysInTarget));
  return out.getTime();
}

/** Whole billing months elapsed since `startMs`. Never negative (a future term reads as 0). */
export function monthsElapsed(startMs: number, nowMs: number): number {
  const start = new Date(startMs);
  const now = new Date(nowMs);
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  // The calendar-month difference overshoots until the anniversary DAY is reached.
  if (addMonths(startMs, months) > nowMs) months -= 1;
  return Math.max(0, months);
}

/** Start of the calendar month containing `nowMs` — the no-billing-term fallback. */
function calendarMonthStart(nowMs: number): number {
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** The window the user's included prints are counted over right now. */
export function resolvePrintWindow(input: PrintWindowInput): PrintWindow {
  const { includedPerMonth, interval, periodStartMs, poolUnlocked, termAllocation, nowMs } = input;

  // No billing term to anchor to → calendar month, as before terms existed.
  if (periodStartMs == null || !Number.isFinite(periodStartMs)) {
    const startMs = calendarMonthStart(nowMs);
    return {
      startMs,
      allocation: includedPerMonth,
      kind: 'calendar',
      resetsAtMs: addMonths(startMs, 1),
    };
  }

  // Unlocked annual pool: the entire term is one window, 12× the monthly allocation.
  if (interval === 'year' && poolUnlocked) {
    return {
      startMs: periodStartMs,
      allocation: poolTotal(includedPerMonth, termAllocation),
      kind: 'year',
      resetsAtMs: addMonths(periodStartMs, MONTHS_PER_YEAR),
    };
  }

  // Otherwise release one month at a time, sliced from the billing anniversary. Applies to
  // monthly subscribers too — and slicing (rather than trusting period_start to be current)
  // means a lagging renewal webhook can't strand someone on a stale window.
  const slice = monthsElapsed(periodStartMs, nowMs);
  return {
    startMs: addMonths(periodStartMs, slice),
    allocation: includedPerMonth,
    kind: 'month',
    resetsAtMs: addMonths(periodStartMs, slice + 1),
  };
}

export interface PoolOfferInput {
  includedPerMonth: number;
  interval: BillingInterval | null;
  periodStartMs: number | null;
  poolUnlocked: boolean;
  /** Prints recorded since the start of the current TERM (not the current monthly slice). */
  printsThisTerm: number;
  /** Prorated term total; see PrintWindowInput.termAllocation. */
  termAllocation?: number | null;
}

export type PoolOffer =
  /** Not a yearly subscriber, or metering is off — say nothing about pools. */
  | { state: 'none' }
  /** Yearly, eligible, but hasn't spent a print this term yet. */
  | { state: 'needsFirstPrint'; total: number }
  /** Yearly and allowed to unlock right now. */
  | { state: 'available'; total: number }
  /** Already unlocked for this term. */
  | { state: 'unlocked'; total: number };

/**
 * Where a user stands with the annual pool. Mirrors the INSERT policy in
 * 20260719120000_billing_interval_and_print_pool.sql — the server is the real gate; this only
 * decides what the UI offers, so the two must be kept in step.
 */
export function resolvePoolOffer(input: PoolOfferInput): PoolOffer {
  const { includedPerMonth, interval, periodStartMs, poolUnlocked, printsThisTerm, termAllocation } =
    input;
  if (interval !== 'year' || periodStartMs == null) return { state: 'none' };
  // Unlimited (metering off) or no allocation at all — a pool is meaningless either way.
  if (!Number.isFinite(includedPerMonth) || includedPerMonth <= 0) return { state: 'none' };
  const total = poolTotal(includedPerMonth, termAllocation);
  if (poolUnlocked) return { state: 'unlocked', total };
  // "Spend one first": proof the user has actually used the feature before we release the year.
  if (printsThisTerm < 1) return { state: 'needsFirstPrint', total };
  return { state: 'available', total };
}

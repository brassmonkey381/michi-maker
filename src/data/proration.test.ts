/**
 * The money maths. Run: `npm test`.
 *
 * Every case here is one we either shipped wrong or verified by hand against live Stripe during
 * the plan-change build. The point of the file is that those verifications now re-run for free —
 * the mid-term proration bug shipped precisely because the only proof it worked was a manual test
 * at 12 months remaining, where the wrong answer equals the right one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonths,
  monthsElapsed,
  perMonthMinor,
  PRINTS_PER_MONTH,
  termPrintAllocation,
  upgradeQuoteMinor,
} from './proration.ts';

const PRO_YEARLY = 3999;
const VIP_YEARLY = 9999;
const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h);
/** A term starting 2026-01-15, as seconds — the anchor for the month-arithmetic cases. */
const TERM_START_SEC = utc(2026, 1, 15, 12) / 1000;

const quote = (nowMs: number) =>
  upgradeQuoteMinor({
    fromAmountMinor: PRO_YEARLY,
    fromInterval: 'year',
    toAmountMinor: VIP_YEARLY,
    toInterval: 'year',
    periodStartSec: TERM_START_SEC,
    nowMs,
  });

// ── the price table the plans page promises ───────────────────────────────────────────────
test('upgrade quote: 12 months left is the plain yearly difference', () => {
  // Verified live: quoted $60.00, Stripe invoice in_1Tv9AP… paid exactly 6000.
  assert.equal(quote(utc(2026, 1, 15, 13)), 6000);
  assert.equal(quote(utc(2026, 1, 15, 13)), VIP_YEARLY - PRO_YEARLY);
});

test('upgrade quote: prorates by whole months, not by the second', () => {
  // Two days in is still month 0 — Stripe would say 5955 here, and we deliberately do not.
  assert.equal(quote(utc(2026, 1, 17, 12)), 6000);
  // Verified live on the backdated rig: quoted $40.00, invoice in_1Tv9Xa… paid exactly 4000.
  assert.equal(quote(utc(2026, 5, 15, 12)), 4000); // 4 months elapsed → 8 left
  assert.equal(quote(utc(2026, 7, 15, 12)), 3000); // 6 elapsed → 6 left
  assert.equal(quote(utc(2026, 10, 15, 12)), 1500); // 9 elapsed → 3 left
  assert.equal(quote(utc(2026, 12, 15, 12)), 500); // 11 elapsed → 1 left
});

test('upgrade quote: a day short of the anniversary is still the earlier month', () => {
  assert.equal(quote(utc(2026, 5, 14, 12)), 4500); // 3 elapsed → 9 left
  assert.equal(quote(utc(2026, 5, 15, 11)), 4500); // same day, hour early: UTC date decides
});

test('upgrade quote: never negative, never past the term', () => {
  assert.equal(quote(utc(2027, 1, 15, 12)), 0); // exactly a year in → nothing left
  assert.equal(quote(utc(2030, 1, 1, 0)), 0); // far past the term, clamped not negative
  assert.equal(quote(utc(2025, 1, 1, 0)), 6000); // before the term → treated as month 0
});

test('upgrade quote: refuses cross-interval and missing data', () => {
  const base = {
    fromAmountMinor: 399,
    fromInterval: 'month',
    toAmountMinor: VIP_YEARLY,
    toInterval: 'year',
    periodStartSec: TERM_START_SEC,
    nowMs: utc(2026, 3, 15, 12),
  };
  assert.equal(upgradeQuoteMinor(base), null, 'monthly → yearly has no months-remaining reading');
  assert.equal(upgradeQuoteMinor({ ...base, periodStartSec: null }), null);
  assert.equal(upgradeQuoteMinor({ ...base, fromInterval: 'year', toAmountMinor: null }), null);
});

test('upgrade quote: monthly → monthly uses a one-month term', () => {
  assert.equal(
    upgradeQuoteMinor({
      fromAmountMinor: 399,
      fromInterval: 'month',
      toAmountMinor: 999,
      toInterval: 'month',
      periodStartSec: TERM_START_SEC,
      nowMs: utc(2026, 1, 20, 12),
    }),
    600,
  );
});

// ── the print allocation the ledger stores ────────────────────────────────────────────────
test('print allocation: fresh subscriptions get the whole year', () => {
  assert.equal(termPrintAllocation(null, 'tier_pro', 'year', TERM_START_SEC, utc(2026, 1, 15, 13)), 12);
  assert.equal(termPrintAllocation(null, 'tier_vip', 'year', TERM_START_SEC, utc(2026, 1, 15, 13)), 36);
});

test('print allocation: the owner’s worked example — VIP 8 months into a PRO year', () => {
  // "full 12 months of PRO, plus 4 months of VIP, minus the 4 months of PRO" = 20.
  assert.equal(12 + 4 * 3 - 4 * 1, 20);
  assert.equal(
    termPrintAllocation('tier_pro', 'tier_vip', 'year', TERM_START_SEC, utc(2026, 9, 15, 12)),
    20,
  );
});

test('print allocation: mid-term upgrades do NOT grant a fresh year', () => {
  // The shipped bug: 4 months in granted 36 instead of 28. Verified live on the backdated rig.
  assert.equal(
    termPrintAllocation('tier_pro', 'tier_vip', 'year', TERM_START_SEC, utc(2026, 5, 15, 12)),
    28,
  );
  assert.notEqual(
    termPrintAllocation('tier_pro', 'tier_vip', 'year', TERM_START_SEC, utc(2026, 5, 15, 12)),
    36,
  );
  // Upgrading with one month left buys one month of the better rate, not a year of it.
  assert.equal(
    termPrintAllocation('tier_pro', 'tier_vip', 'year', TERM_START_SEC, utc(2026, 12, 15, 12)),
    14,
  );
});

test('print allocation: at month 0 an upgrade equals a fresh year (the case that hid the bug)', () => {
  assert.equal(
    termPrintAllocation('tier_pro', 'tier_vip', 'year', TERM_START_SEC, utc(2026, 1, 16, 12)),
    36,
  );
});

test('print allocation: only yearly terms have a pool', () => {
  assert.equal(termPrintAllocation(null, 'tier_pro', 'month', TERM_START_SEC, utc(2026, 2, 1)), null);
  assert.equal(termPrintAllocation(null, 'tcgscan_pro', 'year', TERM_START_SEC, utc(2026, 2, 1)), null);
  assert.equal(termPrintAllocation(null, 'tier_pro', 'year', null, utc(2026, 2, 1)), null);
});

// ── month arithmetic ──────────────────────────────────────────────────────────────────────
test('addMonths clamps to the end of shorter months', () => {
  assert.equal(addMonths(utc(2026, 1, 31), 1), utc(2026, 2, 28), 'Jan 31 + 1mo → Feb 28');
  assert.equal(addMonths(utc(2028, 1, 31), 1), utc(2028, 2, 29), 'leap year → Feb 29');
  assert.equal(addMonths(utc(2026, 3, 31), 1), utc(2026, 4, 30), 'Mar 31 + 1mo → Apr 30');
  assert.equal(addMonths(utc(2026, 1, 31), 12), utc(2027, 1, 31), 'a full year keeps the day');
});

test('addMonths matches the real renewal observed on the clock rig', () => {
  // period_start 2026-07-20 05:42:13Z renewed to exactly 2027-07-20 05:42:13Z.
  const start = Date.UTC(2026, 6, 20, 5, 42, 13);
  assert.equal(addMonths(start, 12), Date.UTC(2027, 6, 20, 5, 42, 13));
});

test('monthsElapsed counts anniversaries, not calendar months', () => {
  const start = utc(2026, 1, 31, 12);
  assert.equal(monthsElapsed(start, utc(2026, 2, 27, 12)), 0, 'a day short of Feb 28 is month 0');
  // Clamping decides this: a Jan-31 term's February anniversary IS Feb 28, so the month has
  // elapsed on that date — it does not wait for a 31st that February never has.
  assert.equal(monthsElapsed(start, utc(2026, 2, 28, 12)), 1, 'clamped anniversary counts');
  assert.equal(monthsElapsed(start, utc(2026, 2, 28, 11)), 0, 'but not an hour before it');
  assert.equal(monthsElapsed(start, utc(2026, 3, 31, 12)), 2);
  assert.equal(monthsElapsed(start, utc(2025, 1, 1, 0)), 0, 'future term clamps to 0');
  assert.equal(monthsElapsed(start, utc(2040, 1, 1, 0)), 12, 'clamped to the cap');
});

test('perMonthMinor divides yearly prices and passes monthly through', () => {
  assert.equal(perMonthMinor(VIP_YEARLY, 'year'), 9999 / 12);
  assert.equal(perMonthMinor(399, 'month'), 399);
  assert.equal(perMonthMinor(399, 'week'), null);
  assert.equal(perMonthMinor(null, 'year'), null);
});

test('per-tier print rates are the numbers the plans page advertises', () => {
  assert.equal(PRINTS_PER_MONTH.tier_pro, 1);
  assert.equal(PRINTS_PER_MONTH.tier_vip, 3);
  assert.equal(PRINTS_PER_MONTH.tier_pro * 12, 12);
  assert.equal(PRINTS_PER_MONTH.tier_vip * 12, 36);
});

/**
 * Which included prints are available, over which window. Run: `npm test`.
 *
 * The pool rules encode two decisions that are easy to undo by accident: prints are counted from
 * the BILLING anniversary rather than the calendar month, and the pool total comes from the
 * STORED (already prorated) allocation rather than a fresh year at the current rate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePoolOffer, resolvePrintWindow } from './printWindow.ts';

const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h);
const TERM = utc(2026, 1, 15, 12);

test('no billing term falls back to the calendar month', () => {
  const w = resolvePrintWindow({
    includedPerMonth: 1,
    interval: null,
    periodStartMs: null,
    poolUnlocked: false,
    nowMs: utc(2026, 3, 20, 12),
  });
  assert.equal(w.kind, 'calendar');
  assert.equal(w.startMs, utc(2026, 3, 1), 'manual grants meter on the 1st');
  assert.equal(w.allocation, 1);
});

test('a subscriber meters from the billing anniversary, not the 1st', () => {
  // The bug this replaced: subscribing on the 28th handed out two allocations in four days.
  const w = resolvePrintWindow({
    includedPerMonth: 3,
    interval: 'year',
    periodStartMs: TERM,
    poolUnlocked: false,
    nowMs: utc(2026, 3, 20, 12),
  });
  assert.equal(w.kind, 'month');
  assert.equal(w.startMs, utc(2026, 3, 15, 12), 'slice starts on the 15th');
  assert.equal(w.resetsAtMs, utc(2026, 4, 15, 12));
  assert.equal(w.allocation, 3, 'a monthly slice is the monthly rate');
});

test('an unlocked pool opens the whole term at the STORED allocation', () => {
  const w = resolvePrintWindow({
    includedPerMonth: 3,
    interval: 'year',
    periodStartMs: TERM,
    poolUnlocked: true,
    termAllocation: 28, // prorated mid-term upgrade
    nowMs: utc(2026, 6, 1, 12),
  });
  assert.equal(w.kind, 'year');
  assert.equal(w.startMs, TERM, 'counts across the whole term');
  assert.equal(w.allocation, 28, 'NOT 36 — the stored figure wins');
});

test('pool total falls back to a full year only when nothing is stored', () => {
  const w = resolvePrintWindow({
    includedPerMonth: 3,
    interval: 'year',
    periodStartMs: TERM,
    poolUnlocked: true,
    termAllocation: null,
    nowMs: utc(2026, 6, 1, 12),
  });
  assert.equal(w.allocation, 36);
});

test('monthly subscribers never get a year window, unlocked or not', () => {
  const w = resolvePrintWindow({
    includedPerMonth: 1,
    interval: 'month',
    periodStartMs: TERM,
    poolUnlocked: true,
    nowMs: utc(2026, 3, 20, 12),
  });
  assert.equal(w.kind, 'month');
  assert.equal(w.allocation, 1);
});

test('unlimited allocation stays unlimited (metering off)', () => {
  const w = resolvePrintWindow({
    includedPerMonth: Infinity,
    interval: 'year',
    periodStartMs: TERM,
    poolUnlocked: true,
    nowMs: utc(2026, 3, 1),
  });
  assert.equal(w.allocation, Infinity);
});

// ── who is offered the pool ───────────────────────────────────────────────────────────────
const offer = (over: Partial<Parameters<typeof resolvePoolOffer>[0]> = {}) =>
  resolvePoolOffer({
    includedPerMonth: 3,
    interval: 'year',
    periodStartMs: TERM,
    poolUnlocked: false,
    printsThisTerm: 1,
    ...over,
  });

test('pool is yearly-only and needs a print spent first', () => {
  assert.equal(offer().state, 'available');
  assert.equal(offer({ printsThisTerm: 0 }).state, 'needsFirstPrint', 'the chargeback gate');
  assert.equal(offer({ interval: 'month' }).state, 'none', 'monthly plans have no pool');
  assert.equal(offer({ periodStartMs: null }).state, 'none');
  assert.equal(offer({ poolUnlocked: true }).state, 'unlocked');
});

test('pool total mirrors the stored allocation, so the dialog cannot over-promise', () => {
  // The shipped bug: a mid-term upgrader was told "unlock all 36" and given 36.
  const o = offer({ termAllocation: 28 });
  assert.equal(o.state === 'none' ? null : o.total, 28);
  const fresh = offer();
  assert.equal(fresh.state === 'none' ? null : fresh.total, 36);
});

test('no pool when metering is off or the tier has no prints', () => {
  assert.equal(offer({ includedPerMonth: Infinity }).state, 'none');
  assert.equal(offer({ includedPerMonth: 0 }).state, 'none');
});

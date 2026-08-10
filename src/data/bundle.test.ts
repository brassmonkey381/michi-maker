/**
 * Bundle-discount eligibility (src/data/bundle.ts).
 *
 * These pin a MONEY rule, so they're written as the exploit that motivated it rather than as
 * coverage of the branches. The hole: holding ANY active sibling entitlement earned 60% off ANY
 * sibling plan, so $3.99 of tcgscan PRO monthly bought michi VIP yearly for $40 instead of $99.99
 * — a $59.99 discount off a $3.99 ticket, in both directions, and a free trial did it for $0.
 *
 *   node --test "src/**\/*.test.ts"     (npm test)
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { bundleQualifies, bundleSiblingsFor, termFor } from './bundle.ts';

const NOW = Date.parse('2026-07-28T12:00:00Z');
const LATER = '2027-01-01T00:00:00Z';
const PAST = '2026-01-01T00:00:00Z';

const monthly = { expires_at: LATER, interval: 'month', source: 'stripe' };
const yearly = { expires_at: LATER, interval: 'year', source: 'stripe' };
/** A manual/comp grant: never came from a Stripe subscription, but WAS given deliberately. */
const noInterval = { expires_at: LATER, interval: null, source: 'manual' };
/** A live 14-day free trial. Paid nothing, so earns nothing. */
const trial = { expires_at: LATER, interval: null, source: 'trial' };

test('THE EXPLOIT: monthly does not unlock a yearly discount', () => {
  // $3.99 tcgscan PRO monthly must not buy michi VIP yearly at $40.
  assert.equal(bundleQualifies([monthly], 'michi_vip_yearly', NOW), false);
  // ...and symmetrically, michi monthly must not buy tcgscan VIP yearly.
  assert.equal(bundleQualifies([monthly], 'tcgscan_vip_yearly', NOW), false);
});

test('a FREE trial unlocks no yearly discount either', () => {
  // The worse version of the same hole: $0 in, $59.99 of discount out.
  assert.equal(bundleQualifies([trial], 'michi_vip_yearly', NOW), false);
  assert.equal(bundleQualifies([noInterval], 'michi_vip_yearly', NOW), false);
});

test('A TRIAL EARNS NOTHING, on either term (owner call 2026-08-10)', () => {
  // Matching the term closed the yearly hole but left this one: a live trial bought 60% off a
  // MONTHLY sibling plan having paid nothing. The bundle is a thank-you for paying.
  assert.equal(bundleQualifies([trial], 'michi_vip_monthly', NOW), false);
  assert.equal(bundleQualifies([trial], 'tcgscan_pro_monthly', NOW), false);
  // ...and a trial sitting beside a real subscription must not spoil the real one.
  assert.equal(bundleQualifies([trial, monthly], 'michi_vip_monthly', NOW), true);
});

test('a manual/comp grant still qualifies monthly: we gave it deliberately', () => {
  // Excluded on SOURCE, not on the null interval, so comps are unaffected by the trial rule.
  assert.equal(bundleQualifies([noInterval], 'michi_vip_monthly', NOW), true);
});

test('an unknown or missing source keeps the old behaviour', () => {
  // Fail toward honouring a discount someone may have paid for, rather than silently removing it.
  assert.equal(bundleQualifies([{ expires_at: LATER, interval: 'month' }], 'michi_vip_monthly', NOW), true);
  assert.equal(bundleQualifies([{ expires_at: LATER, interval: 'month', source: null }], 'michi_vip_monthly', NOW), true);
});

test('yearly unlocks yearly — the bundle working as intended', () => {
  assert.equal(bundleQualifies([yearly], 'michi_vip_yearly', NOW), true);
  assert.equal(bundleQualifies([yearly], 'tcgscan_pro_yearly', NOW), true);
});

test('yearly also unlocks monthly: a longer commitment covers a shorter claim', () => {
  assert.equal(bundleQualifies([yearly], 'michi_vip_monthly', NOW), true);
});

test('monthly unlocks monthly — ~$4 of discount for a ~$4 entry, in proportion', () => {
  assert.equal(bundleQualifies([monthly], 'michi_vip_monthly', NOW), true);
});

test('TIER is deliberately not matched: PRO earns a discount on VIP', () => {
  // Owner call 2026-07-28. bundleSiblingsFor returns BOTH tiers, and holding either qualifies.
  assert.deepEqual(bundleSiblingsFor('michi_vip_yearly'), ['tcgscan_pro', 'tcgscan_vip']);
  assert.deepEqual(bundleSiblingsFor('tcgscan_pro_monthly'), ['tier_pro', 'tier_vip']);
});

test('an EXPIRED entitlement never qualifies, whatever its term', () => {
  assert.equal(bundleQualifies([{ expires_at: PAST, interval: 'year' }], 'michi_vip_yearly', NOW), false);
  assert.equal(bundleQualifies([{ expires_at: PAST, interval: 'month' }], 'michi_vip_monthly', NOW), false);
});

test('a never-expiring yearly grant still qualifies', () => {
  assert.equal(bundleQualifies([{ expires_at: null, interval: 'year' }], 'michi_vip_yearly', NOW), true);
});

test('no entitlements at all never qualifies', () => {
  assert.equal(bundleQualifies([], 'michi_vip_monthly', NOW), false);
  assert.equal(bundleQualifies([], 'michi_vip_yearly', NOW), false);
});

test('the yearly row is what counts, even beside a lapsed or monthly one', () => {
  const rows = [{ expires_at: PAST, interval: 'year' }, monthly, yearly];
  assert.equal(bundleQualifies(rows, 'michi_vip_yearly', NOW), true);
});

test('one-time products have no bundle and no term', () => {
  assert.equal(bundleSiblingsFor('michi_binder_pdf'), null);
  assert.equal(termFor('michi_binder_pdf'), null);
});

test('termFor reads the catalog naming convention', () => {
  assert.equal(termFor('michi_vip_yearly'), 'year');
  assert.equal(termFor('tcgscan_pro_monthly'), 'month');
});

/**
 * Tier resolution, with the free-PRO-trial in mind. Run: `npm test`.
 *
 * A trial is just a `tier_pro` entitlement row with a future `expires_at` (source is irrelevant to
 * resolution) — so these pin that a running trial reads as PRO and a lapsed one falls back to free,
 * which is the whole reason the trial needs no special-casing anywhere downstream.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveTier,
  isActive,
  hasFindSimilar,
  limitsForTier,
  TIER_LIMITS,
  type EntitlementRow,
} from './tiers.ts';

const NOW = Date.parse('2026-07-21T12:00:00Z');
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

const signedIn = (rows: EntitlementRow[]) => resolveTier({ isSignedIn: true, rows }, NOW);

test('an active PRO trial (future expiry) resolves to pro', () => {
  assert.equal(signedIn([{ product: 'tier_pro', expires_at: inDays(14) }]), 'pro');
});

test('a lapsed PRO trial falls back to free, no special-casing needed', () => {
  assert.equal(signedIn([{ product: 'tier_pro', expires_at: inDays(-1) }]), 'free');
});

test('guests never hold a tier even with a row present', () => {
  assert.equal(resolveTier({ isSignedIn: false, rows: [{ product: 'tier_pro', expires_at: inDays(14) }] }, NOW), 'guest');
});

test('a real VIP outranks a still-running PRO trial row', () => {
  assert.equal(
    signedIn([
      { product: 'tier_pro', expires_at: inDays(10) },
      { product: 'tier_vip', expires_at: inDays(365) },
    ]),
    'vip',
  );
});

test('isActive: future = active, past = lapsed, null = lifetime', () => {
  assert.equal(isActive({ product: 'tier_pro', expires_at: inDays(1) }, NOW), true);
  assert.equal(isActive({ product: 'tier_pro', expires_at: inDays(-1) }, NOW), false);
  assert.equal(isActive({ product: 'tier_pro', expires_at: null }, NOW), true);
});

/**
 * "Pages around this card" is the ONLY thing VIP has that PRO does not, other than caps and
 * print volume. If PRO ever reads true here the tier stops being distinguishable on features,
 * so pin the whole column rather than just the VIP cell.
 */
test('multiPageCompose is VIP-only', () => {
  assert.equal(TIER_LIMITS.vip.multiPageCompose, true);
  for (const tier of ['guest', 'free', 'pro'] as const) {
    assert.equal(TIER_LIMITS[tier].multiPageCompose, false, `${tier} must not have it`);
  }
});

test('a VIP entitlement is what actually unlocks it', () => {
  const NOW2 = Date.parse('2026-08-20T12:00:00Z');
  const tierOf = (rows: EntitlementRow[]) => resolveTier({ isSignedIn: true, rows }, NOW2);
  const proRow: EntitlementRow = { product: 'tier_pro', expires_at: null };
  const vipRow: EntitlementRow = { product: 'tier_vip', expires_at: null };
  assert.equal(TIER_LIMITS[tierOf([proRow])].multiPageCompose, false);
  assert.equal(TIER_LIMITS[tierOf([vipRow])].multiPageCompose, true);
  // A lapsed VIP loses it, same as every other paid capability.
  assert.equal(
    TIER_LIMITS[tierOf([{ product: 'tier_vip', expires_at: '2026-01-01T00:00:00Z' }])].multiPageCompose,
    false,
  );
});

/**
 * FIND SIMILAR moved behind PRO on 2026-09-01, having been free since it shipped. The column is
 * pinned whole rather than just the two paid cells: the failure that matters is a tier quietly
 * regaining it, and only free/guest can regress in that direction.
 */
test('find similar is PRO and above', () => {
  assert.equal(hasFindSimilar('pro'), true);
  assert.equal(hasFindSimilar('vip'), true);
  for (const tier of ['guest', 'free'] as const) {
    assert.equal(hasFindSimilar(tier), false, `${tier} must not have it`);
  }
});

test('the trial is what buys it, and losing the trial takes it back', () => {
  const NOW2 = Date.parse('2026-08-20T12:00:00Z');
  const tierOf = (rows: EntitlementRow[]) => resolveTier({ isSignedIn: true, rows }, NOW2);
  assert.equal(hasFindSimilar(tierOf([])), false);
  assert.equal(hasFindSimilar(tierOf([{ product: 'tier_pro', expires_at: null }])), true);
  assert.equal(
    hasFindSimilar(tierOf([{ product: 'tier_pro', expires_at: '2026-01-01T00:00:00Z' }])),
    false,
  );
});

/**
 * The LIMITS_ENFORCED dev switch relaxes numeric caps so a developer is not fighting a 3-binder
 * limit all day. It must not hand out a paid capability: doing so would mean the one build where
 * the gate is easiest to notice is the build that does not have it.
 */
test('the dev switch does not hand out the similarity search', () => {
  for (const tier of ['guest', 'free'] as const) {
    assert.equal(limitsForTier(tier).findSimilar, false, `${tier} via limitsForTier`);
  }
});

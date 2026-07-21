/**
 * Tier resolution, with the free-PRO-trial in mind. Run: `npm test`.
 *
 * A trial is just a `tier_pro` entitlement row with a future `expires_at` (source is irrelevant to
 * resolution) — so these pin that a running trial reads as PRO and a lapsed one falls back to free,
 * which is the whole reason the trial needs no special-casing anywhere downstream.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveTier, isActive, type EntitlementRow } from './tiers.ts';

const NOW = Date.parse('2026-07-21T12:00:00Z');
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

const signedIn = (rows: EntitlementRow[]) => resolveTier({ isSignedIn: true, rows }, NOW);

test('an active PRO trial (future expiry) resolves to pro', () => {
  assert.equal(signedIn([{ product: 'tier_pro', expires_at: inDays(14) }]), 'pro');
});

test('a lapsed PRO trial falls back to free — no special-casing needed', () => {
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

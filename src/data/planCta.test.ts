/**
 * The comparison sheet's CTA rules. Run: `npm test`.
 *
 * Pins the whole matrix, because the interesting cases are ABSENCES — no downgrade buttons, no
 * active button on your own plan — and an absence is exactly what a refactor removes silently.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planCta, PLAN_HEADERS } from './subscriptions.ts';
import type { Tier } from './tiers.ts';

const col = (t: 'free' | 'pro' | 'vip') => PLAN_HEADERS.find((p) => p.tier === t)!;
const kindOf = (c: 'free' | 'pro' | 'vip', viewer: Tier) => planCta(col(c), viewer).kind;
const labelOf = (c: 'free' | 'pro' | 'vip', viewer: Tier) => {
  const cta = planCta(col(c), viewer);
  return 'label' in cta ? cta.label : null;
};

test('guest: Free is a sign-up, paid plans are purchases', () => {
  assert.equal(kindOf('free', 'guest'), 'signIn');
  assert.equal(labelOf('pro', 'guest'), 'Choose PRO');
  assert.equal(labelOf('vip', 'guest'), 'Choose VIP');
});

test('free: on their own plan, both paid columns are upgrades they can buy', () => {
  assert.equal(kindOf('free', 'free'), 'current');
  assert.equal(kindOf('pro', 'free'), 'buy', 'no subscription yet — Checkout is safe here');
  assert.equal(labelOf('pro', 'free'), 'Upgrade to PRO');
  assert.equal(labelOf('vip', 'free'), 'Upgrade to VIP');
});

test('pro: no downgrade, no re-buying their own plan, VIP is a SWITCH not a purchase', () => {
  assert.equal(kindOf('free', 'pro'), 'none', 'never offer a downgrade');
  assert.equal(kindOf('pro', 'pro'), 'current', 'buying it again would open a 2nd subscription');
  assert.equal(kindOf('vip', 'pro'), 'switch', 'must move the existing sub, not add one');
  assert.equal(labelOf('vip', 'pro'), 'Upgrade to VIP');
});

test('vip: nothing to buy, nothing to downgrade into', () => {
  assert.equal(kindOf('free', 'vip'), 'none');
  assert.equal(kindOf('pro', 'vip'), 'none');
  assert.equal(kindOf('vip', 'vip'), 'current');
});

test('an existing subscriber NEVER gets a Checkout button for a tier', () => {
  // The invariant behind the 409 guard: Checkout can only CREATE a subscription, so a paying
  // customer reaching it would be billed for both plans.
  for (const viewer of ['pro', 'vip'] as const) {
    for (const c of ['free', 'pro', 'vip'] as const) {
      assert.notEqual(kindOf(c, viewer), 'buy', `${viewer} viewer must not get 'buy' on ${c}`);
    }
  }
});

test('no column ever offers a lower tier than the viewer holds', () => {
  const rank = { guest: 0, free: 1, pro: 2, vip: 3 };
  for (const viewer of ['guest', 'free', 'pro', 'vip'] as const) {
    for (const c of ['free', 'pro', 'vip'] as const) {
      if (rank[c] < rank[viewer]) {
        assert.equal(kindOf(c, viewer), 'none', `${viewer} must see nothing on ${c}`);
      }
    }
  }
});

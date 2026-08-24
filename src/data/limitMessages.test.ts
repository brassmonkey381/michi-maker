/**
 * Cap-gate copy and the button each cap toast carries. Run: `npm test`.
 *
 * The rule worth pinning is the guest one, and it is a product decision rather than a detail: a
 * guest at a cap is not a sales lead, their next step is the free account that lifts the cap. So
 * guests are sent to the auth sheet and everyone else to the plans page. A regression that hands
 * guests a "See plans" button would be pitching a price table at someone who has not signed up
 * yet, which is exactly what this module's docstring exists to prevent.
 *
 * All three caps are covered together because they now share one CTA rule, and the failure mode
 * of a shared rule is one caller quietly opting out of it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TIER_LIMITS, type Tier } from './tiers.ts';
import {
  artLimitMessage,
  binderLimitMessage,
  limitCta,
  pageLimitMessage,
} from './limitMessages.ts';

const PAID: Tier[] = ['free', 'pro', 'vip'];

test('guests are sent to the auth sheet, never to the price table', () => {
  assert.deepEqual(limitCta('guest'), { kind: 'signin', label: 'Sign in (free)' });
});

test('every tier that can pay is sent to plans', () => {
  for (const tier of PAID) {
    assert.deepEqual(limitCta(tier), { kind: 'plans', label: 'See plans' });
  }
});

test('all three cap messages point guests at signing in, not at upgrading', () => {
  const messages = [
    binderLimitMessage('guest', TIER_LIMITS.guest),
    pageLimitMessage('guest', TIER_LIMITS.guest),
    artLimitMessage('guest', TIER_LIMITS.guest),
  ];
  for (const msg of messages) {
    assert.match(msg, /Sign in \(free\)/);
    assert.doesNotMatch(msg, /[Uu]pgrade/);
  }
});

test('all three cap messages offer paid tiers an upgrade, not a sign-in', () => {
  for (const tier of PAID) {
    const messages = [
      binderLimitMessage(tier, TIER_LIMITS[tier]),
      pageLimitMessage(tier, TIER_LIMITS[tier]),
      artLimitMessage(tier, TIER_LIMITS[tier]),
    ];
    for (const msg of messages) {
      assert.match(msg, /[Uu]pgrade/);
      assert.doesNotMatch(msg, /Sign in/);
    }
  }
});

test('free hits the documented 16-page cap', () => {
  assert.equal(TIER_LIMITS.free.pagesPerBinder, 16);
  assert.match(pageLimitMessage('free', TIER_LIMITS.free), /16-page limit/);
});

/**
 * The page-limit gate's copy and its call to action.
 *
 * The subtle rule here is the guest one, and it is a product decision rather than a detail: a
 * guest at a cap is not a sales lead, their next step is the free account that lifts the cap.
 * So they get "Sign in (free)" wording and NO plans button, which is also what keeps their
 * toast the quiet pill rather than the prominent card. A regression that hands guests a
 * "See plans" button would be an upgrade pitch aimed at someone who has not signed up yet.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TIER_LIMITS } from './tiers.ts';
import { pageLimitCta, pageLimitMessage } from './limitMessages.ts';

test('guests are pointed at a free account, never at a plan', () => {
  assert.equal(pageLimitCta('guest'), null);
  const msg = pageLimitMessage('guest', TIER_LIMITS.guest);
  assert.match(msg, /Sign in \(free\)/);
  assert.doesNotMatch(msg, /[Uu]pgrade/);
});

test('free hits the documented 16-page cap and gets a route to plans', () => {
  assert.equal(TIER_LIMITS.free.pagesPerBinder, 16);
  assert.deepEqual(pageLimitCta('free'), { label: 'See plans', href: '/plans' });
  assert.match(pageLimitMessage('free', TIER_LIMITS.free), /16-page limit/);
});

test('paid tiers that can still hit a cap also get the route out', () => {
  for (const tier of ['pro', 'vip'] as const) {
    assert.deepEqual(pageLimitCta(tier), { label: 'See plans', href: '/plans' });
  }
});

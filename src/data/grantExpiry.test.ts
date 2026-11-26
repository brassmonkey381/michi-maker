/**
 * MIC-073 (owner, 2026-11-26: "make sure entitlements work as expected and for the correct amount
 * of time and cancelling stops trial immediately"). The webhook's expiry rules, run on the
 * subscription shapes Stripe sends through a holiday trial's life.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GRACE_MS, grantExpiryMs } from '../../supabase/functions/_shared/grantExpiry.ts';
import { HOLIDAY_LAST_START, HOLIDAY_TRIAL_END, holidayTrialEnd } from './holiday.ts';

const JAN1 = HOLIDAY_TRIAL_END / 1000;
const START = Date.parse('2026-12-05T18:00:00Z') / 1000;
const NOW = Date.parse('2026-12-10T12:00:00Z');

test('a holiday trial started any day until Dec 30 ends Jan 1, and not before Dec 30 ends', () => {
  assert.equal(holidayTrialEnd(Date.parse('2026-11-27T12:00:00Z')), HOLIDAY_TRIAL_END);
  assert.equal(holidayTrialEnd(HOLIDAY_LAST_START - 1000), HOLIDAY_TRIAL_END);
  assert.equal(holidayTrialEnd(HOLIDAY_LAST_START + 1000), null);
  assert.equal(new Date(HOLIDAY_TRIAL_END).toISOString(), '2027-01-01T08:00:00.000Z');
});

test('while trialing, PRO lasts exactly until Jan 1, with no grace days', () => {
  assert.equal(grantExpiryMs({ status: 'trialing', trial_end: JAN1 }, START, JAN1, NOW), HOLIDAY_TRIAL_END);
});

test('cancelling: the webhook cancels the trial now, and PRO ends at that moment', () => {
  const cancelledAt = NOW / 1000;
  assert.equal(grantExpiryMs({ status: 'canceled', trial_end: JAN1, ended_at: cancelledAt, canceled_at: cancelledAt }, START, JAN1, NOW + 5000), NOW);
});

test('if the immediate cancel ever failed, a trial set to cancel still never outlives Jan 1', () => {
  assert.equal(grantExpiryMs({ status: 'trialing', trial_end: JAN1, cancel_at_period_end: true }, START, JAN1, NOW), HOLIDAY_TRIAL_END);
});

test('kept past Jan 1 and paid: the first month runs from Jan 1, plus the paying-member grace', () => {
  const feb1 = Date.parse('2027-02-01T08:00:00Z') / 1000;
  assert.equal(grantExpiryMs({ status: 'active', trial_end: JAN1 }, JAN1, feb1, NOW), feb1 * 1000 + GRACE_MS);
});

test('the first charge on Jan 1 fails: PRO ends at Jan 1, no grace for a card that never paid', () => {
  const feb1 = Date.parse('2027-02-01T08:00:00Z') / 1000;
  assert.equal(grantExpiryMs({ status: 'past_due', trial_end: JAN1 }, JAN1, feb1, NOW), HOLIDAY_TRIAL_END);
});

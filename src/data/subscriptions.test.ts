/**
 * The plan page's money arithmetic.
 *
 * These two functions decide what a buyer is told they save, which is a claim we have to be able to
 * defend from the two numbers printed beside it. The rounding here is not cosmetic: the anchor
 * rounds UP to a whole dollar for display while the saving is FLOORED against the true list, and
 * getting that backwards silently overstates the discount.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLAN_HEADERS, PLANS_TRIAL_BUTTON_LABEL, TRIAL_CTA_LABEL, annualAnchor, annualListMinor, annualSavingPercent, planCta } from './subscriptions.ts';

const pro = PLAN_HEADERS.find((h) => h.tier === 'pro')!;

test('PRO is $24.99 a year and $2.99 a month, with no coupon (price cut 2026-10-11)', () => {
  assert.equal(pro.yearlyMinor, 2499);
  assert.equal(pro.monthlyMinor, 299);
  assert.equal(pro.price, '$24.99');
  assert.equal(pro.badge, 'Best value');
});

test('the anchor is twelve months at the monthly rate', () => {
  assert.equal(annualListMinor(pro), 3588, '12 x $2.99');
  assert.equal(annualAnchor(pro), '$36', 'shown flat, without cents (owner, 2026-09-21)');
});

test('THE SAVING IS NEVER LARGER THAN THE PAGE CAN JUSTIFY', () => {
  // The two figures on screen are $36 and $24.99, which is a 30.58% saving; the true list of
  // $35.88 is 30.35%. Rounding either to the nearest whole number gives 31% and 30% respectively,
  // so rounding the DISPLAYED pair would print a bigger number than the true prices support.
  // Flooring the true figure gives 30 from both, which is the number a reader can check.
  assert.equal(annualSavingPercent(pro), 30);

  const roundedFromAnchor = Math.round(((3600 - 2499) / 3600) * 100);
  assert.equal(roundedFromAnchor, 31, 'this is the overstatement the flooring avoids');
  assert.ok(annualSavingPercent(pro)! < roundedFromAnchor, 'the badge must understate, never overstate');
});

test('no saving is claimed when there is nothing to save', () => {
  assert.equal(annualListMinor({ monthlyMinor: undefined }), null);
  assert.equal(annualAnchor({ monthlyMinor: undefined }), null);
  assert.equal(annualSavingPercent({ monthlyMinor: undefined, yearlyMinor: 4999 }), null);
  // A yearly price at or above twelve monthly payments is not a discount, so nothing is shown
  // rather than a "Save 0%" sticker or a negative one.
  assert.equal(annualSavingPercent({ monthlyMinor: 400, yearlyMinor: 4800 }), null, 'equal is not a saving');
  assert.equal(annualSavingPercent({ monthlyMinor: 400, yearlyMinor: 5000 }), null, 'dearer is not a saving');
});

test('Free advertises no price to discount', () => {
  const free = PLAN_HEADERS.find((h) => h.tier === 'free')!;
  assert.equal(free.price, '$0');
  assert.equal(annualAnchor(free), null);
});

test('THE PRO BUTTON NAMES THE FREE DAYS for an account that can still have them (2026-10-11)', () => {
  // The trial lives in Stripe Checkout now, so the gate says what pressing it gets you.
  assert.deepEqual(planCta(pro, 'free', false, true), { kind: 'buy', label: PLANS_TRIAL_BUTTON_LABEL });
  assert.equal(TRIAL_CTA_LABEL, 'PRO Free Trial');
  assert.equal(PLANS_TRIAL_BUTTON_LABEL, 'Try PRO for FREE');
  // Used or ineligible: an ordinary purchase, and it says so.
  assert.deepEqual(planCta(pro, 'free', false, false), { kind: 'buy', label: 'Upgrade to PRO' });
  // A guest chooses first: checkout needs an account, so the free days are not promised yet.
  assert.deepEqual(planCta(pro, 'guest', false, true), { kind: 'buy', label: 'Choose PRO' });
  // Mid-trial and already-paid cases are untouched by the flag.
  assert.deepEqual(planCta(pro, 'pro', true, true), { kind: 'buy', label: 'Subscribe to PRO' });
  assert.deepEqual(planCta(pro, 'pro', false, true), { kind: 'current' });
});

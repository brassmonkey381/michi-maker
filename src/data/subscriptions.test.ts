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

import { PLAN_HEADERS, annualAnchor, annualListMinor, annualSavingPercent } from './subscriptions.ts';

const pro = PLAN_HEADERS.find((h) => h.tier === 'pro')!;

test('PRO is $49.99 a year and $5.99 a month, with no coupon', () => {
  assert.equal(pro.yearlyMinor, 4999);
  assert.equal(pro.monthlyMinor, 599);
  assert.equal(pro.price, '$49.99');
  assert.equal(pro.badge, 'Best value');
});

test('the anchor is twelve months at the monthly rate', () => {
  assert.equal(annualListMinor(pro), 7188, '12 x $5.99');
  assert.equal(annualAnchor(pro), '$72', 'shown flat, without cents (owner, 2026-09-21)');
});

test('THE SAVING IS NEVER LARGER THAN THE PAGE CAN JUSTIFY', () => {
  // The two figures on screen are $72 and $49.99, which is a 30.57% saving; the true list of
  // $71.88 is 30.45%. Rounding either to the nearest whole number gives 31% and 30% respectively,
  // so rounding the DISPLAYED pair would print a bigger number than the true prices support.
  // Flooring the true figure gives 30 from both, which is the number a reader can check.
  assert.equal(annualSavingPercent(pro), 30);

  const roundedFromAnchor = Math.round(((7200 - 4999) / 7200) * 100);
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

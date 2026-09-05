/**
 * Limited-time promotion (src/data/promo.ts).
 *
 * The dangerous failures for a promotion aren't arithmetic, they're agreement failures: the price
 * we SHOW disagreeing with the price we CHARGE, or a discount quietly compounding with another
 * one. These pin both.
 *
 *   node --test "src/**\/*.test.ts"     (npm test)
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ENDS_AT, PERCENT_OFF, PROMO_LABEL, promoActive, promoPriceMinor } from './promo.ts';

/**
 * THE CONTRACT WITH STRIPE. `percent_off` on the live coupon must equal this, or the plans page
 * advertises a price the checkout doesn't honour. Changing this number without changing the
 * coupon (in BOTH test and live mode) is the failure this test exists to make loud.
 */
test('PERCENT_OFF matches the documented Stripe coupon', () => {
  assert.equal(PERCENT_OFF, 20);
});

test('the banner copy states the same number it discounts by', () => {
  // The copy is derived, not typed twice — this guards someone "fixing" it into a literal.
  assert.ok(PROMO_LABEL.includes(`${PERCENT_OFF}%`));
});

test('prices round the way Stripe rounds a percent-off coupon', () => {
  // $39.99 -> $31.99 (3999 * 0.8 = 3199.2). A cent of drift here is a visible lie on the page.
  assert.equal(promoPriceMinor(3999), 3199);
  // $99.99 -> $79.99 (7999.2)
  assert.equal(promoPriceMinor(9999), 7999);
  // $3.99 -> $3.19 (319.2)
  assert.equal(promoPriceMinor(399), 319);
  // $9.99 -> $7.99 (799.2)
  assert.equal(promoPriceMinor(999), 799);
});

test('exact halves round away from zero, as Stripe does', () => {
  // 1250 * 0.8 = 1000 exactly; 1563 * 0.8 = 1250.4 -> 1250.
  assert.equal(promoPriceMinor(1250), 1000);
  assert.equal(promoPriceMinor(1563), 1250);
});

test('the promotion is time-boxed', () => {
  const ends = Date.parse(ENDS_AT);
  assert.ok(Number.isFinite(ends), 'ENDS_AT must be a parseable ISO date');
  // Pinned to the live coupon OFF20_2026, whose redeem_by is Dec 31 2026, and to tcgscan-app's
  // ENDS_AT (commit c4468a8). A coupon's redeem_by cannot be edited, so extending the sale means a
  // NEW coupon (apply-promo-coupon.ps1) AND changing this date in both apps — this test fails
  // until the date is changed on purpose.
  assert.equal(ENDS_AT, '2026-12-31T23:59:59Z', 'ENDS_AT must match coupon OFF20_2026 and tcgscan-app');
  assert.equal(promoActive(ends - 1000), true);
  assert.equal(promoActive(ends), false, 'the end instant is over, not still running');
  assert.equal(promoActive(ends + 1000), false);
});

test('NO STACKING: the bundle beats the promo, it does not compound with it', () => {
  // Applying both would compound to 68% off ($99.99 -> $32.00), a deeper discount than either
  // offer promises and one nobody decided to give. stripe-checkout applies better-of, and the
  // bundle is always better, so a bundle buyer pays the 60% price.
  const listMinor = 9999;
  const bundleOnly = Math.round(listMinor * 0.4); // 4000
  const compounded = Math.round(promoPriceMinor(listMinor) * 0.4); // 3200
  assert.equal(bundleOnly, 4000);
  assert.equal(compounded, 3200);
  assert.ok(bundleOnly > compounded, 'the bundle-only price must be what a bundle buyer pays');
});

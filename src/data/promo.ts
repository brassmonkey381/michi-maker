/**
 * Limited-time promotional discount — a flat percentage off every subscription plan, in BOTH apps.
 *
 * Lives beside proration and bundle for the same reason: it changes what someone is charged, so it
 * gets ONE implementation, shared by the `stripe-checkout` edge function that applies it and by
 * anything that displays a price.
 *
 * ── The Stripe coupon is the source of truth for MONEY. This file is the source of truth for the
 *    STORY. They must agree. ────────────────────────────────────────────────────────────────────
 * `percentOff` here only decides what the UI SHOWS (the struck-through price, the banner). What is
 * actually charged is whatever `STRIPE_PROMO_COUPON` says. If the two drift, the app advertises a
 * price it doesn't honour — which is the single worst failure mode a promotion has, and the reason
 * `promo.test.ts` pins the number against the documented coupon.
 *
 * Setup checklist when changing this:
 *   1. Stripe → Coupons → percent_off matches `PERCENT_OFF`, in BOTH test and live mode.
 *   2. `redeem_by` on the coupon matches `ENDS_AT` (a third backstop; see below).
 *   3. `supabase secrets set STRIPE_PROMO_COUPON=<id>` for the live project.
 *
 * ── It does not stack with the bundle ─────────────────────────────────────────────────────────
 * A bundle customer already gets 60% off (see bundle.ts). Applying both would compound to 68%,
 * which is not what "the bundle keeps working" means, and Stripe would happily do it. The checkout
 * applies the BETTER of the two, which is always the bundle — so a bundle customer is never made
 * worse off by a promotion, and never accidentally handed a deeper one.
 *
 * ── Expiry is enforced three times, on purpose ────────────────────────────────────────────────
 *   client  — hides the banner and stops quoting the sale price (cosmetic, and a lying clock only
 *             ever costs us a wrong-looking price, never a wrong charge);
 *   server  — stripe-checkout refuses to attach the coupon past ENDS_AT (this is the one that
 *             decides money, and it runs on a clock the user cannot set);
 *   Stripe  — `redeem_by` on the coupon itself, so even a bug in the two above cannot sell at the
 *             sale price forever.
 */

/** Percent off every plan while the promotion runs. MUST equal the Stripe coupon's percent_off. */
export const PERCENT_OFF = 20;

/** When the promotion stops, ISO 8601. MUST equal the Stripe coupon's redeem_by. */
export const ENDS_AT = '2026-08-31T23:59:59Z';

/** Marketing line for the banner. Kept here so the copy can't disagree with the number. */
export const PROMO_LABEL = `Limited time · ${PERCENT_OFF}% off every plan`;

/** Is the promotion running? */
export function promoActive(now: number = Date.now()): boolean {
  return now < Date.parse(ENDS_AT);
}

/**
 * The promotional price for an amount in MINOR units (cents), rounded the way Stripe rounds a
 * percent-off coupon: to the nearest cent, half away from zero. Doing our own arithmetic here and
 * letting Stripe do its own is exactly how a displayed price ends up a cent off the charge, so
 * this mirrors Stripe's rule rather than inventing one.
 */
export function promoPriceMinor(minor: number, percentOff: number = PERCENT_OFF): number {
  return Math.round(minor * (1 - percentOff / 100));
}

/** Minor units → "$31.99". Trailing ".00" is kept: a price is a price, not a number. */
export function formatMinor(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

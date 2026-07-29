/**
 * Cross-app BUNDLE discount eligibility — who has earned 60% off the sibling app.
 *
 * Lives here, next to proration, for the same reason: it decides what someone is charged, so it
 * gets ONE implementation shared by the `stripe-checkout` edge function (which enforces it) and
 * anything client-side that wants to predict it. A client asking for `bundle: true` proves
 * nothing; the server re-derives eligibility from the entitlements ledger.
 *
 * ── The rule ──────────────────────────────────────────────────────────────────────────────────
 * TERM must be matched. TIER need not be.
 *
 *   holding YEARLY   → yearly OR monthly discounted   (a year-long commitment covers either)
 *   holding MONTHLY  → monthly only
 *
 * It used to be enough to hold ANY active sibling entitlement, which priced a 60%-off YEARLY plan
 * off the back of a month-to-month one:
 *
 *   $3.99 tcgscan PRO monthly → michi VIP yearly for $40 instead of $99.99 → cancel the $3.99
 *
 * A $3.99 ticket bought a $59.99 discount — about 15x the entry price — and the same trick ran in
 * both directions. The coupon is `duration: once`, so it was a one-shot leak rather than a
 * permanent repricing, but one shot is still the entire margin on that sale.
 *
 * Matching the term isn't just a patch on that number: a yearly discount should require a yearly
 * commitment. 60% off michi VIP MONTHLY is about $4, which is in proportion to a ~$4 entry rather
 * than 15x it, so the monthly→monthly case needs no special handling.
 *
 * TIER is deliberately NOT matched (owner call 2026-07-28): tcgscan PRO earns a discount on michi
 * VIP and vice versa. That's the cross-app bridge working as intended, and whether a VIP should
 * earn a deeper discount than a PRO is a separate open question (docs/SYNERGY.md).
 *
 * A NULL `interval` means the entitlement never came from a Stripe subscription — a free trial or
 * a manual/comp grant — so it proves no yearly commitment and cannot unlock a yearly discount.
 * That also closes the worse version of the same hole: a FREE 14-day tcgscan PRO trial buying
 * michi VIP yearly for $40 with nothing paid at all.
 */

/** The shape `bundleQualifies` needs from an entitlements row. */
export interface BundleEntitlement {
  /** ISO timestamp, or null for a grant that never expires. */
  expires_at: string | null;
  /** Stripe recurring interval ('month' | 'year'), or null for trial / manual grants. */
  interval: string | null;
}

/** Billing term a subscription lookup key is sold on. Null for one-time products. */
export function termFor(lookupKey: string): 'month' | 'year' | null {
  if (lookupKey.endsWith('_yearly')) return 'year';
  if (lookupKey.endsWith('_monthly')) return 'month';
  return null;
}

/**
 * The sibling products whose ACTIVE ownership can qualify a lookup key for the bundle discount.
 * Null for one-time products, which have no bundle.
 */
export function bundleSiblingsFor(lookupKey: string): string[] | null {
  if (lookupKey.startsWith('tcgscan_pro') || lookupKey.startsWith('tcgscan_vip')) {
    return ['tier_pro', 'tier_vip'];
  }
  if (lookupKey.startsWith('michi_pro') || lookupKey.startsWith('michi_vip')) {
    return ['tcgscan_pro', 'tcgscan_vip'];
  }
  return null;
}

/**
 * Do these sibling entitlements earn the bundle coupon for `lookupKey`? See the module note.
 *
 * `rows` must already be scoped to the sibling products (bundleSiblingsFor) and to one user;
 * expiry is checked here so a lapsed row can never qualify.
 */
export function bundleQualifies(rows: BundleEntitlement[], lookupKey: string, now = Date.now()): boolean {
  const active = rows.filter((r) => !r.expires_at || Date.parse(r.expires_at) > now);
  // Buying yearly demands a yearly commitment; anything else only needs an active sibling.
  if (termFor(lookupKey) === 'year') return active.some((r) => r.interval === 'year');
  return active.length > 0;
}

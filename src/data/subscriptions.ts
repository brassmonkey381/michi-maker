/**
 * Subscriptions-page display data — the ONE place marketing copy/numbers live in the app. The
 * payment provider's dashboard is the source of truth for what is actually charged at checkout;
 * these strings describe the plans on /subscriptions and must be kept in sync with
 * docs/roadmap/MONETIZATION-TIERS.md (owner-set 2026-07-16) and tiers.ts TIER_LIMITS.
 *
 * Guest is deliberately absent: it is a taste of the product, not an advertised plan.
 */

/**
 * When true, plan CTAs launch real Stripe Checkout (see src/data/checkout.ts). Env-driven so
 * test mode can be exercised locally (EXPO_PUBLIC_CHECKOUT_OPEN=1 in .env.local) while the
 * deployed site keeps the honest "coming soon" note until live keys + owner go-live.
 */
import type { Tier } from '@/data/tiers';
// Relative, with its extension: the unit tests load this file without the path aliases.
import { SHOW_CROSS_APP } from '../lib/crossApp.ts';

export const CHECKOUT_OPEN = process.env.EXPO_PUBLIC_CHECKOUT_OPEN === '1';

/**
 * Whether the free trial is OFFERED. It used to be CHECKOUT_OPEN and nothing else, on the
 * reasoning that an expiring trial should always have a subscribe path. Closing checkout for the
 * tier rework (2026-09-20) therefore took every trial offer in the app down with it, which nobody
 * intended: a trial costs nothing to grant and is the main way a Free account meets PRO. So it
 * has its own switch now (owner, 2026-09-20). Open checkout still implies open trials.
 */
export const TRIALS_OPEN = process.env.EXPO_PUBLIC_TRIALS_OPEN === '1' || CHECKOUT_OPEN;

/**
 * Upgrades are driven SERVER-SIDE (`change_plan` in stripe-checkout), not through Checkout or the
 * Customer Portal:
 *   - Checkout can only CREATE a subscription, so it would bill both plans at once.
 *   - The Portal can switch plans, but bills Stripe's second-accurate proration rather than the
 *     whole-month figure the app quotes, so the price shown wouldn't be the price charged.
 * The portal keeps cancellation and payment-method management, where it has no such problem.
 */

/** The honest line every CTA shows while checkout is closed (same voice as UpgradePerk). */
export const CHECKOUT_CLOSED_NOTE = 'Paid plans aren’t open quite yet. Check back soon.';

export interface PlanHeader {
  tier: 'free' | 'pro' | 'vip';
  name: string;
  /** Lead price string (yearly for paid plans — the highlighted term). */
  price: string;
  /** Suffix after the price, e.g. '/yr'. */
  per?: string;
  /** The billing subline under the price. */
  sub: string;
  badge?: 'Most popular' | 'Best value';
  /** Stripe price lookup_keys (docs/PAYMENTS.md catalog). The CTA buys yearly (the lead price). */
  yearlyKey?: string;
  monthlyKey?: string;
  /** Label for the secondary month-to-month CTA link. */
  monthlyLabel?: string;
  /**
   * List price in MINOR units (cents) per term. The strings above are marketing copy; these are
   * the numbers, so a promotional price is DERIVED rather than typed a second time and left to
   * drift from the Stripe coupon. Absent on Free, which has nothing to discount.
   */
  yearlyMinor?: number;
  monthlyMinor?: number;
}

/** Column headers, ascending order — the table reads as an upgrade path left to right. */
/**
 * WHAT A YEAR COSTS AT THE MONTHLY RATE, in minor units, and what the yearly plan saves against it.
 *
 * This is the honest comparison for an annual price, and it is the one that survives: it is true
 * for as long as the two prices are, with no coupon to expire and no date to police. The 20% promo
 * that used to sit here struck through the yearly price to show a discount on itself, which flatters
 * the number and makes the plan page disagree with the plan.
 *
 * DERIVED, never typed. 12 x $5.99 is $71.88, not $72, and a rounded marketing figure struck through
 * next to an exact one is the kind of small lie a careful reader notices.
 */
export function annualListMinor(h: Pick<PlanHeader, 'monthlyMinor'>): number | null {
  return h.monthlyMinor ? h.monthlyMinor * 12 : null;
}

/**
 * The struck-through anchor, rounded to a whole dollar: $71.88 shows as "$72" (owner, 2026-09-21).
 * An anchor is a comparison, not a charge, so it reads better without cents and nobody is ever
 * billed it. Every figure that decides money keeps its cents.
 */
export function annualAnchor(h: Pick<PlanHeader, 'monthlyMinor'>): string | null {
  const list = annualListMinor(h);
  return list === null ? null : `$${Math.round(list / 100)}`;
}

/**
 * Percent saved by paying yearly instead of monthly.
 *
 * FLOORED, AND MEASURED AGAINST THE TRUE LIST, both deliberately. The true list is $71.88, which
 * saves 30.4%; the rounded-up $72 anchor on screen saves 30.6%, and rounding that to the nearest
 * whole number would claim 31% while the two numbers printed beside it support 30%. Flooring the
 * real figure means the badge is never larger than the arithmetic a reader can do on the page.
 */
export function annualSavingPercent(h: Pick<PlanHeader, 'monthlyMinor' | 'yearlyMinor'>): number | null {
  const list = annualListMinor(h);
  if (!list || !h.yearlyMinor || h.yearlyMinor >= list) return null;
  return Math.floor(((list - h.yearlyMinor) / list) * 100);
}

export const PLAN_HEADERS: PlanHeader[] = [
  { tier: 'free', name: 'Free', price: '$0', sub: 'with a free account' },
  {
    tier: 'pro',
    name: 'PRO',
    price: '$49.99',
    per: '/yr',
    sub: 'about $4.17 a month, billed yearly · or $5.99 month to month',
    badge: 'Best value',
    yearlyKey: 'michi_pro_yearly',
    monthlyKey: 'michi_pro_monthly',
    monthlyLabel: 'or $5.99 month to month',
    yearlyMinor: 4999,
    monthlyMinor: 599,
  },
  // VIP WAS RETIRED FROM SALE in the 2026-09 tier rework (tcgscan-app docs/TIER-REWORK.md): two
  // plans, Free and PRO. Soundtracks and the all-at-once composer are PRO now. A tier_vip row that
  // still exists reads as PRO everywhere, this page included.
];

/**
 * What the comparison sheet's CTA should be for one plan column, given the viewer's CURRENT tier.
 *
 * Rules (owner call 2026-07-19):
 *  - Never offer a DOWNGRADE. A VIP looking at Free/PRO gets no button at all, not "Downgrade to
 *    Free" — leaving the plan is a billing action, and it belongs in Manage billing, not in a
 *    row that otherwise reads as a purchase.
 *  - The plan you are already on has no active button. Buying your own plan again would start a
 *    SECOND Stripe subscription.
 *  - Upgrading FROM a paid plan is a `switch`, not a `buy`: it has to modify the existing
 *    subscription, since a second Checkout Session would bill for both plans at once.
 *
 * Pure so the rules are testable and can't drift from the rendering.
 */
export type PlanCta =
  /** Render nothing — a downgrade, which this page deliberately does not offer. */
  | { kind: 'none' }
  /** The viewer's current plan. */
  | { kind: 'current' }
  /** Free column for a signed-out viewer: an account, not a purchase. */
  | { kind: 'signIn' }
  /** A brand-new subscription — safe to send through Checkout. */
  | { kind: 'buy'; label: string }
  /** An upgrade from an existing PAID subscription — must modify it in place. */
  | { kind: 'switch'; label: string };

const TIER_RANK: Record<Tier, number> = { guest: 0, free: 1, pro: 2, vip: 3 };

/**
 * What a column's button offers this viewer.
 *
 * A TRIAL IS NOT A SUBSCRIPTION, and `current` cannot say so on its own: an active PRO trial
 * resolves to the tier it grants, so the PRO column read "Your current plan" and offered a trial
 * member no way to become a paying one at all (owner, 2026-09-10). It also cannot be a 'switch',
 * because switching modifies a subscription that does not exist. With `onTrial` every paid column
 * is an ordinary purchase, and the one matching the trial says so plainly.
 */
export function planCta(column: PlanHeader, current: Tier, onTrial = false): PlanCta {
  const columnRank = TIER_RANK[column.tier];
  const currentRank = TIER_RANK[current];
  if (onTrial && column.tier !== 'free' && columnRank >= currentRank) {
    return {
      kind: 'buy',
      label: columnRank === currentRank ? `Subscribe to ${column.name}` : `Choose ${column.name}`,
    };
  }
  if (columnRank === currentRank) return { kind: 'current' };
  if (columnRank < currentRank) return { kind: 'none' };
  // Free sits above a guest, but joining is a sign-up, not a sale.
  if (column.tier === 'free') return { kind: 'signIn' };
  // Upgrading from a plan that is already billing means switching that subscription, not buying
  // alongside it. 'guest' and 'free' have nothing to switch, so they're ordinary purchases.
  const label = `Upgrade to ${column.name}`;
  return currentRank >= TIER_RANK.pro
    ? { kind: 'switch', label }
    : { kind: 'buy', label: current === 'guest' ? `Choose ${column.name}` : label };
}

/** Lookup key for the one-time full-binder PDF (payment mode; needs a binderId). */
export const BINDER_PDF_LOOKUP_KEY = 'michi_binder_pdf';

/**
 * WHAT ONE BINDER'S PRINT-READY PDF COSTS, written once (owner, 2026-09-21: $1.99, was $3.99).
 * Every button, confirmation, plan row and guide reads this, so the app cannot quote two prices.
 * The CHARGE is Stripe's: the `michi_binder_pdf` lookup key must point at a price of the same
 * amount (scripts/stripe-binder-pdf-price.mjs moves it, and checks it).
 */
export const BINDER_PDF_PRICE = '$1.99';
export const BINDER_PDF_PRICE_MINOR = 199;

/** CROSS-APP: TCGScan Pro's yearly lookup key — sold from michi in the bundle cross-sell (the
 *  grant lands in the shared entitlements ledger both apps read; see docs/SYNERGY.md). */
export const TCGSCAN_PRO_LOOKUP_KEY = 'tcgscan_pro_yearly';

/** The sibling app's landing page — EVERY user-facing TCGScan mention links here. */
export const TCGSCAN_URL = 'https://tcgscan.ai/welcome';
/** The bundle deep link: TCGScan's plans page, ?bundle=1 so it can greet the michi member.
 *  The 60% coupon itself is applied server-side at checkout (sibling ownership verified). */
export const TCGSCAN_PLANS_URL = 'https://tcgscan.ai/plans?bundle=1';

export interface CompareCell {
  text: string;
  /** Small second line under the value. */
  sub?: string;
  /** Bold the value (the standout numbers / Unlimited / Included). */
  strong?: boolean;
  /** Small pill set beside the value, e.g. the per-print saving on yearly billing. */
  stamp?: string;
}

export interface CompareRow {
  capability: string;
  /** Footnote mark rendered after the capability label — matches a FOOTNOTES entry. */
  mark?: string;
  /** Accent-tinted row: an "included at every tier" highlight. */
  highlight?: boolean;
  free: CompareCell;
  /**
   * What the Free cell says to an account that existed before the 2026-09 rework and kept its caps
   * (tiers.LEGACY_FREE_LIMITS). Absent = the same as `free`. A long-standing user must never be
   * shown a lower number than the one they are actually held to.
   */
  freeLegacy?: CompareCell;
  pro: CompareCell;
}

/**
 * What every plan has, so the comparison table can stop saying it three times.
 *
 * A row reading "Full catalog · Full catalog · Full catalog" costs a reader a row of attention to
 * learn nothing; it was in the table to reassure, not to differentiate, and it reassures just as
 * well as one line underneath. Only ever move a row here when all THREE cells are identical —
 * a differing `sub` (the composer rows) is real information and
 * belongs in the grid.
 */
export const INCLUDED_EVERYWHERE = [
  'The full card catalog',
  'Slice Studio',
  'Your pages synced to your account (iOS and Android coming soon)',
];

/**
 * The capability comparison, Free and PRO (guest is unadvertised; VIP was retired 2026-09).
 *
 * TERSE ON PURPOSE (owner, 2026-09-21). A cell is a verdict, not an explanation: "No" and a tick
 * read in a glance, and a sentence underneath costs the reader the glance. Anything that needs a
 * paragraph either belongs in the fine print or is not a differentiator worth a row.
 *
 * A ROW EARNS ITS PLACE BY DIFFERING. Owned-card tracking, print sheets and sharing are identical
 * on both plans, so they said the same thing twice and now say it once, under the table.
 */
export const COMPARISON: CompareRow[] = [
  {
    capability: 'Binders',
    // THE THREE ROWS THE PLAN IS SOLD ON. Free has a number here and PRO does not, which is the
    // whole pitch, so they read as a band rather than as three rows among eight.
    highlight: true,
    free: { text: '2' },
    freeLegacy: { text: '3' },
    pro: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Pages per binder',
    // THE THREE ROWS THE PLAN IS SOLD ON. Free has a number here and PRO does not, which is the
    // whole pitch, so they read as a band rather than as three rows among eight.
    highlight: true,
    free: { text: '9' },
    freeLegacy: { text: '16' },
    pro: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Slice Studio artworks',
    // THE THREE ROWS THE PLAN IS SOLD ON. Free has a number here and PRO does not, which is the
    // whole pitch, so they read as a band rather than as three rows among eight.
    highlight: true,
    free: { text: '25' },
    freeLegacy: { text: '100' },
    pro: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Art Similarity Fill and Search',
    free: { text: 'No' },
    pro: { text: '✓', strong: true },
  },
  {
    capability: 'Advanced Color Fill and Search',
    free: { text: 'No' },
    pro: { text: '✓', strong: true },
  },
  {
    capability: 'Value Sort and Search',
    free: { text: 'No' },
    pro: { text: '✓', strong: true },
  },
  {
    // Metered server-side at search_config.free_theme_depth, which is 3 today. If that number
    // moves, this cell is wrong and nothing will tell you.
    capability: 'Theme Search',
    free: { text: 'Top 3 results' },
    pro: { text: 'Unlimited results', strong: true },
  },
  {
    capability: 'Binder Customizations',
    free: { text: 'Sleeves and page colors' },
    pro: { text: 'Covers, stitchings, soundtracks, stickers and more', strong: true },
  },
];

/**
 * The one line under the table for what no plan gates.
 *
 * These were three rows saying the same thing in both columns, which is a row of attention spent
 * to learn nothing. Prints are the subtle one: no PLAN gates them, and the print-ready PDF is
 * still bought per binder, which the fine print carries.
 */
export const EVERY_TIER_NOTE =
  'Owned card tracking, print-ready fill sheets, and sharing and liking binders are unlocked and available at any tier';

export const ONE_TIME_PDF = {
  name: 'Full-binder fill-sheet PDF',
  price: BINDER_PDF_PRICE,
  blurb:
    'One binder, one time: a print-ready PDF of every page as cut-ready fill sheets, true to ' +
    'card size. Covers the binder as it is when you download, and that version is yours to ' +
    'download again forever; printing later edits needs a new unlock. Preview your own binder ' +
    'first, free: every sheet as it will be laid out, watermarked.',
};

/**
 * The fine print. No row carries a mark any more, so these stand on their own and there are only
 * two, because the table stopped needing footnotes when the cells stopped explaining themselves.
 *
 * The print note is load-bearing: removing the print row took the only place the plans page showed
 * what a print-ready PDF costs, and "available at any tier" must not be read as "free".
 */
export const FOOTNOTES: { mark: string; text: string; link?: { label: string; url: string } }[] = [
  {
    mark: '',
    text:
      `Preview any of your binders as print sheets for free, watermarked. The print-ready PDF is ${BINDER_PDF_PRICE} ` +
      'a binder, one time, on every plan, and the version you bought is yours to download again.',
  },
  {
    mark: '',
    ...(SHOW_CROSS_APP
      ? {
          text: 'Owned card tracking: scan the cards you own with our partner app TCGScan and your collection syncs into michi-maker.',
          link: { label: 'Meet TCGScan →', url: TCGSCAN_URL },
        }
      : { text: 'Owned card tracking: import a CSV of the cards you own and fill binders from it, green for owned, gray for still hunting.' }),
  },
];

/**
 * ANNUAL PRINT POOL copy — the yearly-only option to release the whole term's included prints
 * at once instead of one month at a time (see src/data/printWindow.ts). Lives here with the rest
 * of the plan wording so the print sheet and the plan page say the same thing.
 *
 * Two things the copy must carry, because both are irreversible or easily misread:
 *   - the prints are ALREADY PAID FOR (this is not an upsell, it's a release schedule), and
 *   - unlocking is permanent for the term, and resets at renewal.
 */
export const ANNUAL_POOL = {
  /** Offered once the user has spent at least one included print this term. */
  title: (total: number) => `Unlock all ${total} of your prints for the year?`,
  body: (total: number, perMonth: number) =>
    `You already paid for ${total} full-binder prints this year. Turning this on releases them ` +
    `all now instead of ${perMonth} a month, so you can print whenever you want. This is ` +
    `permanent for your current year and goes back to ${perMonth} a month when your plan renews.`,
  cta: (total: number) => `Unlock all ${total}`,
  cancel: 'Not now',
  /** Shown to a yearly subscriber who hasn't spent a print in this term yet. */
  needsFirstPrint: (total: number) =>
    `Use one of your included prints first, then you can release all ${total} of this year’s ` +
    `prints at once.`,
  /** Steady state once released. */
  unlocked: (total: number) =>
    `You released all ${total} of this year’s prints. They go back to arriving monthly when your ` +
    `plan renews.`,
  /** Nudge for month-to-month subscribers, who have no pool to release. */
  monthlyUpsell: 'Switch to yearly billing and you can use a whole year of prints whenever you want.',
};

/**
 * The 60% cross-app discount (hold a plan in one app, get 60% off the other) is RETIRED as of the
 * 2026-09 tier rework. The web bundle (both apps, one membership) replaces it, and stripe-checkout
 * no longer applies the coupon, so no surface may promise it.
 */
export const CROSS_DISCOUNT_RETIRED = true;

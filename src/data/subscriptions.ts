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
export const CHECKOUT_OPEN = process.env.EXPO_PUBLIC_CHECKOUT_OPEN === '1';

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
}

/** Column headers, ascending order — the table reads as an upgrade path left to right. */
export const PLAN_HEADERS: PlanHeader[] = [
  { tier: 'free', name: 'Free', price: '$0', sub: 'with a free account' },
  {
    tier: 'pro',
    name: 'PRO',
    price: '$39.99',
    per: '/yr',
    sub: 'about $3.33 a month, billed yearly · or $3.99 month to month',
    badge: 'Most popular',
    yearlyKey: 'michi_pro_yearly',
    monthlyKey: 'michi_pro_monthly',
    monthlyLabel: 'or $3.99 month to month',
  },
  {
    tier: 'vip',
    name: 'VIP',
    price: '$99.99',
    per: '/yr',
    sub: 'about $8.33 a month, billed yearly · or $9.99 month to month',
    badge: 'Best value',
    yearlyKey: 'michi_vip_yearly',
    monthlyKey: 'michi_vip_monthly',
    monthlyLabel: 'or $9.99 month to month',
  },
];

/** Lookup key for the one-time full-binder PDF (payment mode; needs a binderId). */
export const BINDER_PDF_LOOKUP_KEY = 'michi_binder_pdf';

/** CROSS-APP: TCGScan Pro's yearly lookup key — sold from michi in the bundle cross-sell (the
 *  grant lands in the shared entitlements ledger both apps read; see docs/SYNERGY.md). */
export const TCGSCAN_PRO_LOOKUP_KEY = 'tcgscan_pro_yearly';

/** The sibling app's landing page — EVERY user-facing TCGScan mention links here. */
export const TCGSCAN_URL = 'https://tcgscan.ai/welcome';

export interface CompareCell {
  text: string;
  /** Small second line under the value. */
  sub?: string;
  /** Bold the value (the standout numbers / Unlimited / Included). */
  strong?: boolean;
}

export interface CompareRow {
  capability: string;
  /** Footnote mark rendered after the capability label — matches a FOOTNOTES entry. */
  mark?: string;
  /** Accent-tinted row: an "included at every tier" highlight. */
  highlight?: boolean;
  free: CompareCell;
  pro: CompareCell;
  vip: CompareCell;
}

/**
 * What an included print effectively COSTS on yearly billing, next to the $3.99 one-off binder
 * PDF. Derived from the plan prices above — recompute if any of the three changes:
 *
 *   PRO yearly  $39.99 / 12 prints = $3.33 each → 16% less than $3.99
 *   VIP yearly  $99.99 / 60 prints = $1.67 each → 58% less than $3.99
 *
 * This attributes the WHOLE subscription price to prints, which is deliberately the conservative
 * framing: even valuing binders/pages/artworks at zero, prints alone come out cheaper. It is NOT
 * a coupon on top of the subscription, so every string built from it must read as "what your
 * included prints work out to", never "N% off when you buy prints".
 *
 * Month-to-month is pointedly absent: PRO monthly is $3.99 a print (12 × $3.99 = $47.88 for 12),
 * exactly the one-off price, so there is no saving to advertise there.
 */
export const YEARLY_PRINT_VALUE = {
  pro: { each: '$3.33', off: '16%' },
  vip: { each: '$1.67', off: '58%' },
};

/** The capability comparison, Free/PRO/VIP only (guest is unadvertised). */
export const COMPARISON: CompareRow[] = [
  {
    capability: 'Binders',
    free: { text: '3' },
    pro: { text: '12' },
    vip: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Pages per binder',
    free: { text: '16' },
    pro: { text: '40' },
    vip: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Cards you can showcase',
    free: { text: 'Over 750!' },
    pro: { text: 'Over 7,500!', strong: true },
    vip: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Card catalog',
    free: { text: 'Full catalog' },
    pro: { text: 'Full catalog' },
    vip: { text: 'Full catalog' },
  },
  {
    capability: 'Similarity matching + composer methods',
    highlight: true,
    free: { text: 'Included', strong: true },
    pro: { text: 'Included', strong: true, sub: 'upgraded binder composers coming soon' },
    vip: { text: 'Included', strong: true, sub: 'upgraded binder composers coming soon' },
  },
  {
    capability: 'Slice Studio',
    free: { text: '✓' },
    pro: { text: '✓' },
    vip: { text: '✓' },
  },
  {
    capability: 'Slice Studio artworks in your account',
    free: { text: '100' },
    pro: { text: '1,000' },
    vip: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Build from cards you really own',
    mark: '‡',
    highlight: true,
    free: { text: '✓' },
    pro: { text: '✓', sub: 'bundle discounts on TCGScan memberships' },
    vip: { text: '✓', sub: 'bundle discounts on TCGScan memberships' },
  },
  {
    capability: 'Print-ready fill sheets',
    mark: '§',
    free: { text: 'Example-sheet preview' },
    pro: {
      text: 'Full binders',
      strong: true,
      sub: `1 print included each month · yearly: all 12 whenever you want, about ${YEARLY_PRINT_VALUE.pro.off} less per print`,
    },
    vip: {
      text: 'Full binders',
      strong: true,
      sub: `5 prints included each month · yearly: all 60 whenever you want, about ${YEARLY_PRINT_VALUE.vip.off} less per print · first in line for print extras*`,
    },
  },
  {
    capability: 'Sharing',
    free: { text: 'Share and like' },
    pro: { text: 'Share and like' },
    vip: { text: 'Share and like', sub: 'featured eligibility boost†' },
  },
];

// Declared above FOOTNOTES because the § footnote quotes its price — a `const` referenced
// before its declaration would throw at module load, not just read oddly.
export const ONE_TIME_PDF = {
  name: 'Full-binder fill-sheet PDF',
  price: '$3.99',
  blurb:
    'One binder, one time: a print-ready PDF of every page as cut-ready fill sheets, true to ' +
    'card size. Covers the binder as it is when you download — that version is yours to ' +
    're-download forever; printing later edits needs a new unlock or a plan. The free preview ' +
    'is a premade example sheet so you can test your printer first.',
};

export const FOOTNOTES: { mark: string; text: string; link?: { label: string; url: string } }[] = [
  {
    mark: '*',
    text: 'First in line for print extras: VIP members get new print features first as they ship, like new sheet formats and print-on-demand, plus member pricing on print-on-demand orders.',
  },
  {
    mark: '†',
    text: 'Featured eligibility boost: public VIP binders get priority consideration when we pick binders to feature on the home page and in community showcases.',
  },
  {
    mark: '‡',
    text: 'Included at every tier. Scan and track the cards you own with our partner app TCGScan - your collection syncs straight into michi-maker, with best-in-class inventory tracking, set analytics, and historical price history. PRO and VIP members get bundle discounts on TCGScan memberships.',
    link: { label: 'Meet TCGScan →', url: TCGSCAN_URL },
  },
  {
    mark: '§',
    text:
      'Yearly plans can use the whole year of prints whenever you want. Included prints arrive a ' +
      'month at a time to start; once you have used your first one, you can release the rest of ' +
      'the year in a single tap, and it stays released until your plan renews. Per print that ' +
      `works out to about ${YEARLY_PRINT_VALUE.pro.each} on PRO yearly and ` +
      `${YEARLY_PRINT_VALUE.vip.each} on VIP yearly, next to ${ONE_TIME_PDF.price} for a one-off ` +
      'single-binder PDF. Month-to-month plans get their prints a month at a time.',
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

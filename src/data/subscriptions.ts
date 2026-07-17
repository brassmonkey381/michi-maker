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
    free: { text: '20 double-sided' },
    pro: { text: '20 double-sided' },
    vip: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Cards you can showcase',
    free: { text: 'Up to 1,920' },
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
    capability: 'Artworks kept in your account',
    free: { text: '10' },
    pro: { text: '100' },
    vip: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Build from cards you really own',
    mark: '‡',
    highlight: true,
    free: { text: 'Included', strong: true, sub: 'make binders from your collection and track binder progress' },
    pro: { text: 'Included', strong: true, sub: 'make binders from your collection and track binder progress' },
    vip: { text: 'Included', strong: true, sub: 'make binders from your collection and track binder progress' },
  },
  {
    capability: 'Print-ready fill sheets',
    free: { text: 'Example-sheet preview' },
    pro: { text: 'Full binders', strong: true, sub: '1 print included each month' },
    vip: {
      text: 'Full binders',
      strong: true,
      sub: '5 prints included each month · first in line for print extras*',
    },
  },
  {
    capability: 'Sharing',
    free: { text: 'View public binders' },
    pro: { text: 'Share and like' },
    vip: { text: 'Share and like', sub: 'featured eligibility boost†' },
  },
];

export const FOOTNOTES: { mark: string; text: string }[] = [
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
    text: 'Included at every tier. For best-in-class inventory tracking across your portfolios, set analytics, and historical price history, see our partner app TCGScan - your collection syncs straight into michi-maker.',
  },
];

export const ONE_TIME_PDF = {
  name: 'Full-binder fill-sheet PDF',
  price: '$3.99',
  blurb:
    'One binder, one time: a print-ready PDF of every page as cut-ready fill sheets, true to ' +
    'card size. Covers the binder as it is when you download — that version is yours to ' +
    're-download forever; printing later edits needs a new unlock or a plan. The free preview ' +
    'is a premade example sheet so you can test your printer first.',
};

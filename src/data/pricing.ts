/**
 * Pricing-page display data — the ONE place marketing numbers live in the app. The payment
 * provider's dashboard is the source of truth for what is actually charged at checkout; these
 * strings exist to describe the plans on /pricing and must be kept in sync with
 * docs/roadmap/MONETIZATION-TIERS.md (owner-set 2026-07-16).
 *
 * Guest is deliberately absent: it is a taste of the product, not an advertised plan.
 */

/** Flip when the payment provider is wired; the plan CTAs then launch checkout. */
export const CHECKOUT_OPEN = false;

/** The honest line every CTA shows while checkout is closed (same voice as UpgradePerk). */
export const CHECKOUT_CLOSED_NOTE = 'Paid plans aren’t open quite yet. Check back soon.';

export interface PlanSpec {
  tier: 'free' | 'pro' | 'vip';
  name: string;
  /** Monthly price string, null for Free. */
  monthly: string | null;
  /** Yearly price string, null for Free. */
  yearly: string | null;
  badge?: 'Most popular' | 'Best value';
  blurb: string;
  features: string[];
}

export const PLANS: PlanSpec[] = [
  {
    tier: 'free',
    name: 'Free',
    monthly: null,
    yearly: null,
    blurb: 'Everything you need to start composing real binder pages.',
    features: [
      '3 binders, 20 double-sided pages each',
      'Room for up to 1,920 cards',
      'Full catalog browse and search',
      'Composer auto-fill, 5 pages a month',
      'Slice Studio, with 10 art uploads kept',
      'My Collection sync from tcgscan',
      'Free example fill sheet to try printing',
    ],
  },
  {
    tier: 'pro',
    name: 'PRO',
    monthly: '$3.99',
    yearly: '$39.99',
    badge: 'Most popular',
    blurb: 'For the collector with more than one shelf going at once.',
    features: [
      '12 binders, room for over 7,500 cards',
      'Unlimited Composer auto-fill',
      '100 art uploads kept',
      'Unlimited CSV imports',
      'Full-binder fill-sheet PDFs, 1 print a month included',
      'Share your binders and collect likes',
    ],
  },
  {
    tier: 'vip',
    name: 'VIP',
    monthly: '$9.99',
    yearly: '$99.99',
    badge: 'Best value',
    blurb: 'No ceilings. The whole studio, wide open.',
    features: [
      'Unlimited binders and pages',
      'Unlimited Composer, uploads, and imports',
      'Full-binder PDFs, 5 prints a month included',
      'First in line for print extras',
      'Featured eligibility boost for public binders',
    ],
  },
];

export const ONE_TIME_PDF = {
  name: 'Full-binder fill-sheet PDF',
  price: '$3.99',
  blurb:
    'One binder, one time: a print-ready PDF of every page as cut-ready fill sheets, true to ' +
    'card size. The free preview is a premade example sheet so you can test your printer first.',
};

export interface CompareRow {
  capability: string;
  free: string;
  pro: string;
  vip: string;
}

/** The capability comparison, Free/PRO/VIP only (guest is unadvertised). */
export const COMPARISON: CompareRow[] = [
  { capability: 'Binders', free: '3', pro: '12', vip: 'Unlimited' },
  { capability: 'Pages per binder', free: '20 double-sided', pro: '20 double-sided', vip: 'Unlimited' },
  { capability: 'Card capacity (4x4 pages)', free: 'Up to 1,920', pro: 'Over 7,500', vip: 'Unlimited' },
  { capability: 'Catalog browse and search', free: 'Full', pro: 'Full', vip: 'Full' },
  { capability: 'Composer auto-fill', free: '5 pages/mo', pro: 'Unlimited', vip: 'Unlimited' },
  { capability: 'Slice Studio', free: '✓', pro: '✓', vip: '✓' },
  { capability: 'Art uploads kept', free: '10', pro: '100', vip: 'Unlimited' },
  { capability: 'My Collection sync', free: '✓', pro: '✓', vip: '✓' },
  { capability: 'CSV import', free: '1 portfolio', pro: 'Unlimited', vip: 'Unlimited' },
  { capability: 'Fill-sheet PDF', free: 'Example sheet', pro: '1 print/mo included', vip: '5 prints/mo included' },
  { capability: 'Public sharing and likes', free: 'View only', pro: 'Share and like', vip: 'Share, like, featured boost' },
];

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

export const CHECKOUT_OPEN = process.env.EXPO_PUBLIC_CHECKOUT_OPEN === '1';

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
    yearlyMinor: 3999,
    monthlyMinor: 399,
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
    yearlyMinor: 9999,
    monthlyMinor: 999,
  },
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

export function planCta(column: PlanHeader, current: Tier): PlanCta {
  const columnRank = TIER_RANK[column.tier];
  const currentRank = TIER_RANK[current];
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
  pro: CompareCell;
  vip: CompareCell;
}

/**
 * What an included print effectively COSTS on yearly billing, next to the $3.99 one-off binder
 * PDF. Derived from the plan prices above — recompute if any of the three changes:
 *
 *   PRO yearly  $39.99 / 12 prints = $3.33 each → 16% less than $3.99
 *   VIP yearly  $99.99 / 36 prints = $2.78 each → 30% less than $3.99
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
  vip: { each: '$2.78', off: '30%' },
};

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
  'Your pages synced across web, iOS and Android',
];

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
    capability: 'Binder covers',
    free: { text: 'No' },
    pro: { text: '✓', strong: true, sub: 'dress it, decorate all four surfaces' },
    vip: { text: '✓', strong: true, sub: 'dress it, decorate all four surfaces' },
  },
  {
    capability: 'Binder soundtrack',
    free: { text: 'No' },
    pro: { text: 'No' },
    vip: { text: '✓', strong: true, sub: 'your own track, per binder or per page, plays on open and turn' },
  },
  {
    capability: 'Cards you can showcase',
    free: { text: 'Over 750!' },
    pro: { text: 'Over 7,500!', strong: true },
    vip: { text: 'Unlimited', strong: true },
  },
  {
    // TWO ROWS, NOT ONE. These shipped as a single "included at every tier" promise (owner
    // decision 2026-07-16) reading "Similarity matching + composer methods: Included", and it
    // over-promised twice over: tri-colour was already PRO in code, and find similar itself went
    // PRO on 2026-09-01 (tiers.ts findSimilar), taking the "≈ More like this" fill method with
    // it. Neither half is all-or-nothing at free any more, so each states its own split rather
    // than one cell averaging them into a word that is wrong for both.
    capability: 'Similarity matching',
    mark: '(1)',
    // Not 'No': the colour sheet's match-by-energy-type is similarity and it stays free, so a
    // flat no would under-promise as badly as 'Included' over-promised.
    free: { text: 'Partial', sub: 'by energy colour only' },
    pro: { text: '✓', strong: true, sub: 'Find similar' },
    vip: { text: '✓', strong: true, sub: 'Find similar' },
  },
  {
    // Seven of the nine methods in pageComposer.ts are free; the two that are not are exactly
    // the two capabilities sold above (similarity → '≈ More like this', tri-colour → 'Color
    // match'). Keep the sub in step with `paid:` there if a method changes sides.
    capability: 'Composer methods',
    mark: '(2)',
    highlight: true,
    free: { text: '7 of 9', sub: 'all but "More Like This" and "Tri-Color Match"' },
    pro: { text: 'All 9', strong: true },
    vip: { text: 'All 9, at once', strong: true, sub: 'Pages around this card' },
  },
  {
    capability: 'Advanced Search',
    mark: '(3)',
    free: { text: 'Basic', sub: 'grammar, filters, one colour' },
    pro: { text: '✓', strong: true, sub: 'value sort, price, Tri-Color, similarity' },
    vip: { text: 'PRO + Theme Search', strong: true },
  },
  {
    capability: 'Slice Studio artworks in your account',
    free: { text: '100' },
    pro: { text: '1,000' },
    vip: { text: 'Unlimited', strong: true },
  },
  {
    capability: 'Build from cards you really own',
    mark: '(4)',
    highlight: true,
    free: { text: '✓' },
    pro: { text: '✓', sub: 'TCGScan bundle discount' },
    vip: { text: '✓', sub: 'TCGScan bundle discount' },
  },
  {
    capability: 'Print-ready fill sheets',
    mark: '(5)',
    free: { text: 'Example-sheet preview' },
    // One plain sentence plus a saving stamp. Everything else — the yearly pool, the per-print
    // maths, prorated upgrades — lives in footnote (5) rather than crowding the cell.
    pro: {
      text: 'Full binders',
      strong: true,
      stamp: `${YEARLY_PRINT_VALUE.pro.off} SAVINGS`,
      sub: '1 binder PDF a month',
    },
    vip: {
      text: 'Full binders',
      strong: true,
      stamp: `${YEARLY_PRINT_VALUE.vip.off} SAVINGS`,
      sub: '3 binder PDFs a month',
    },
  },
  {
    // The capability names itself, so the three cells only have to answer yes.
    capability: 'Share and like',
    free: { text: '✓' },
    pro: { text: '✓' },
    vip: { text: '✓' },
  },
];

// Declared above FOOTNOTES because footnote (5) quotes its price — a `const` referenced
// before its declaration would throw at module load, not just read oddly.
export const ONE_TIME_PDF = {
  name: 'Full-binder fill-sheet PDF',
  price: '$3.99',
  blurb:
    'One binder, one time: a print-ready PDF of every page as cut-ready fill sheets, true to ' +
    'card size. Covers the binder as it is when you download, that version is yours to ' +
    're-download forever; printing later edits needs a new unlock or a plan. The free preview ' +
    'is a premade example sheet so you can test your printer first.',
};

export const FOOTNOTES: { mark: string; text: string; link?: { label: string; url: string } }[] = [
  {
    mark: '(1)',
    text:
      'Find similar is the visual-similarity search: pick a card, or a whole selection, and get ' +
      'the ones that look like it across the catalog. PRO and VIP. Free and guest keep matching ' +
      'by colour: the energy-type colour sheet, and single-colour search in the browser.',
  },
  {
    mark: '(2)',
    text:
      'The composer fills a page around one seed card. Free: Same Pokémon, Evolution line, ' +
      'Friends & partners, Trainer page, Same artist, Color by type, Full-page spread. PRO adds ' +
      'More like this and Color match (tri-color). VIP runs every method at once with Pages ' +
      'around this card and adds the pages you keep.',
  },
  {
    mark: '(3)',
    text:
      'Advanced Search, PRO and VIP: sort by value, price filters (>$100), Tri-Color Search and ' +
      'refine results by similarity. Theme Search is VIP: theme:, art: and scene: search what the ' +
      'picture shows (theme:underwater), from captions written about every Illustration Rare. ' +
      'Free and guest keep the full grammar, every filter chip, favourites, single-colour search, ' +
      'and the Forest scenes demonstration of Theme Search.',
  },
  {
    mark: '(4)',
    text: 'Every tier. Scan the cards you own with our partner app TCGScan and your collection syncs into michi-maker. PRO and VIP get bundle discounts on TCGScan memberships.',
    link: { label: 'Meet TCGScan →', url: TCGSCAN_URL },
  },
  {
    mark: '(5)',
    text:
      `Yearly plans can release the whole year of prints at once, about ${YEARLY_PRINT_VALUE.pro.each} ` +
      `a print on PRO and ${YEARLY_PRINT_VALUE.vip.each} on VIP, against ${ONE_TIME_PDF.price} for a ` +
      'one-off binder PDF; monthly plans get theirs a month at a time. Upgrades are prorated, prints ' +
      'included.',
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

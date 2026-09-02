/**
 * Tier + entitlement vocabulary — the single source of truth for "what can this user do".
 *
 * Pure data/logic (no React, no Supabase) so it's trivially testable and shared between the
 * `useTier` hook (client) and any future server check. The client reads the user's
 * `entitlements` rows (product + expires_at) and this module turns them into an effective tier
 * and a limit matrix.
 *
 * Grants are server-side only (manual SQL today, a payment webhook later — see docs/PAYMENTS.md
 * and supabase/migrations/20260715120000_entitlements.sql + 20260715130000_entitlement_terms.sql).
 * The client never writes here; it only reads and resolves.
 */

/** Effective access level. vip > pro > free (signed-in) > guest (anonymous / signed-out). */
export type Tier = 'guest' | 'free' | 'pro' | 'vip';

/**
 * Product keys stored in `entitlements.product`. A small documented vocabulary — the DB column
 * is plain text (no CHECK), so adding a product is a code change here, not a migration.
 */
export const PRODUCTS = {
  /** PRO subscription (entitlements.expires_at set per billing period). */
  tierPro: 'tier_pro',
  /** VIP subscription (entitlements.expires_at set per billing period). */
  tierVip: 'tier_vip',
  /**
   * CROSS-APP: TCGScan Pro. Sold by the sibling app (tcgscan / tcgscan.ai) but written to
   * this SAME shared `entitlements` ledger, so michi can read it to unlock scan-powered features
   * here (e.g. "Build a binder from your collection"). See docs/SYNERGY.md. michi never sells or
   * resolves a michi *tier* from it — it's a cross-app membership checked via `hasTcgscanPro` /
   * `tcgscanLevel`.
   */
  tcgscanPro: 'tcgscan_pro',
  /**
   * CROSS-APP: TCGScan VIP — the sibling app's top tier (its own product row; a VIP holds this,
   * NOT tcgscan_pro). michi reads it so it knows the sibling's exact level, and any tcgscan paid
   * tier unlocks michi's scan-powered features. See docs/SYNERGY.md.
   */
  tcgscanVip: 'tcgscan_vip',
} as const;

/** One entitlement row as the client reads it (owner-scoped by RLS). */
export interface EntitlementRow {
  product: string;
  /** ISO timestamp; null = lifetime (one-time unlock). */
  expires_at: string | null;
  /**
   * Stripe recurring interval ('month' | 'year'), or null for a trial / manual / comp grant that
   * never came from a subscription. Mirrors the cross-app bundle TERM-MATCHING in bundle.ts: a
   * YEARLY bundle discount requires a YEARLY sibling entitlement, so the plans page needs the
   * sibling's interval to avoid advertising a yearly 60% the checkout won't honour. Optional so
   * existing callers and fixtures stay valid.
   */
  interval?: string | null;
  /**
   * How the grant arose - 'trial' | 'stripe' | 'manual' | ... . A TRIAL earns no bundle discount
   * (owner call 2026-08-10), so this is what separates "has PRO" from "is paying for PRO".
   * Optional so existing callers and fixtures stay valid.
   */
  source?: string | null;
}

/**
 * MASTER SWITCH for the free-tier CAPS (binder/page counts, uploads…).
 *
 * ENFORCED BY DEFAULT (2026-07-23) — opt OUT with EXPO_PUBLIC_LIMITS_ENFORCED=0, matching
 * tcgscan-app's switch exactly. It used to be opt-IN (`=== '1'`), which meant a missing env var
 * silently made every cap `Infinity` with no error and no failing test; `vercel.json` now bakes
 * the flag in as well, so prod no longer depends on a dashboard variable staying set.
 *
 * This flag does NOT touch the print gate — printing your own binders is included with a PRO/VIP
 * subscription or bought per-binder; this switch never changes that.
 *
 * The client switch is a UX affordance, not the enforcement boundary: the caps that protect
 * revenue are enforced server-side in the shared project (see the insert-time cap triggers and
 * `michi_binder_cap()` in supabase/migrations).
 */
export const LIMITS_ENFORCED = process.env.EXPO_PUBLIC_LIMITS_ENFORCED !== '0';

/** Per-tier capability limits. `Infinity` = unlimited. */
export interface TierLimits {
  /** Max user binders. */
  binders: number;
  /** Max pages per binder (app pages — same unit the editor's + Page button adds). */
  pagesPerBinder: number;
  /**
   * ✨ Composer / auto-fill pages per calendar month. Owner decision 2026-07-16: similarity
   * matching + composer methods are INCLUDED at every signed-in tier (no monthly quota) —
   * PRO/VIP differentiate via UPGRADED composers when those ship, not via metering. Kept as a
   * number in case a quota ever returns; 0 = no composer (guests, who lack catalog access).
   */
  composerPagesPerMonth: number;
  /** Uploaded art images KEPT in the account at a time (a retention cap, not a rate). */
  artUploads: number;
  /** Full fill-sheet / placeholder PDF export of any binder. */
  fullPrint: boolean;
  /**
   * "Advanced Search" (PRO/VIP) — the paid half of the card browser, as one capability so the
   * plans page can advertise a single row instead of four:
   *   · sort by value, and price filters (>$100 / <$500 / value>N)
   *   · tri-colour search (the 3-stop weighted palette; free/guest get the energy-colour picker)
   *   · refine by similarity ("more/less like this") — the whole similarity family is PRO now,
   *     one-shot Find Similar included; see `findSimilar` below
   * Boolean, so like `fullPrint` it is NOT mirrored in the `tier_caps` table (that guard covers
   * numeric caps only — see scripts/check-tier-caps.mjs).
   */
  advancedSearch: boolean;
  /**
   * FIND SIMILAR — the visual-similarity search: "≈ Find similar" on a card, "Find similar to all"
   * over a selection, and the more/less-like-this refinement of an ongoing similarity session.
   *
   * PRO and above (owner call 2026-09-01). It was free, and it is the most expensive thing a tap
   * can ask for here: every search is an embedding lookup against the whole catalogue on the
   * tcgscan-data server, and it is also the feature that most directly builds a binder for you.
   *
   * The gate is on RUNNING one, not on seeing the button. The action stays where it was and
   * answers the tap with the wall and the way out, because an action that silently vanishes at
   * free teaches nothing about what a plan buys.
   *
   * NOT in scope: the colour sheet's "similar by colour" (its own free/PRO split, see
   * advancedSearch) and the composer's `moreLikeThis` page method (composer methods are included
   * at every signed-in tier — see multiPageCompose).
   *
   * Boolean, so like `fullPrint` and `advancedSearch` it is NOT mirrored in the `tier_caps` table
   * (that guard covers numeric caps only — see scripts/check-tier-caps.mjs).
   */
  findSimilar: boolean;
  /**
   * "Pages around this card" (VIP) — the composer runs EVERY method a seed supports at once,
   * previews each as a finished page, and appends the ones you keep as new pages.
   *
   * This is the "UPGRADED COMPOSER" that `composerPagesPerMonth` above says PRO/VIP differentiate
   * by. Individual methods stay included at every signed-in tier; what VIP buys is running them
   * all in one pass and choosing between the results, which is the difference between filling a
   * page and being shown eight ways to build one.
   *
   * Boolean, so like `fullPrint` and `advancedSearch` it is NOT mirrored in the `tier_caps` table
   * (that guard covers numeric caps only — see scripts/check-tier-caps.mjs).
   */
  multiPageCompose: boolean;
  /**
   * Full-binder prints INCLUDED with the subscription each month (extra prints are the
   * one-time per-binder purchase). Metering not built yet — until it is, `fullPrint` alone
   * gates the Download button and included prints are effectively unlimited.
   */
  includedPrintsPerMonth: number;
}

/**
 * OWNER-SET numbers (2026-07-16 — see docs/roadmap/MONETIZATION-TIERS.md). The app never hardcodes
 * *price* (that lives in the payment provider dashboard) — only these caps. Kept behind
 * LIMITS_ENFORCED so they don't bite until pricing is live.
 *
 * This is a CLIENT MIRROR for instant/offline UX. The enforced source of truth is the `tier_caps`
 * table in the shared backend (supabase/migrations/20260724050000_tier_caps_single_source.sql) —
 * `npm run check:caps` fails if this mirror drifts from it. To change a cap: UPDATE tier_caps
 * (live, no redeploy) and update the matching number here.
 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  // Guest is NOT an advertised plan — a taste before the sign-in prompt (SignInPerk, not
  // UpgradePerk): 1 binder, 6 pages (3 double-sided sheets), 10 artworks (owner set 2026-07-17).
  guest: {
    binders: 1,
    pagesPerBinder: 6,
    composerPagesPerMonth: 0,
    artUploads: 10,
    fullPrint: false,
    advancedSearch: false,
    findSimilar: false,
    multiPageCompose: false,
    includedPrintsPerMonth: 0,
  },
  // 3 binders × 16 pages × 16 cards (4×4) = 768 ("over 750 cards").
  free: {
    binders: 3,
    pagesPerBinder: 16,
    composerPagesPerMonth: Infinity,
    artUploads: 100,
    fullPrint: false,
    advancedSearch: false,
    findSimilar: false,
    multiPageCompose: false,
    includedPrintsPerMonth: 0,
  },
  // 12 binders × 40 pages × 16 cards = 7,680 ("over 7,500 cards"). $3.99/mo or $39.99/yr.
  pro: {
    binders: 12,
    pagesPerBinder: 40,
    composerPagesPerMonth: Infinity,
    artUploads: 1000,
    fullPrint: true,
    advancedSearch: true,
    findSimilar: true,
    multiPageCompose: false,
    includedPrintsPerMonth: 1,
  },
  // $9.99/mo or $99.99/yr. Included prints cut 5 -> 3 (owner call 2026-07-19): a yearly VIP pool
  // of 60 was more print than the tier could carry. 3/mo = 36 on a yearly term.
  vip: {
    binders: Infinity,
    pagesPerBinder: Infinity,
    composerPagesPerMonth: Infinity,
    artUploads: Infinity,
    fullPrint: true,
    advancedSearch: true,
    findSimilar: true,
    multiPageCompose: true,
    includedPrintsPerMonth: 3,
  },
};

/**
 * Included prints per month by tier, for code that has a PRODUCT key rather than a Tier — chiefly
 * the prorated upgrade maths. Kept beside TIER_LIMITS so the two can't drift.
 *
 * Derived from TIER_LIMITS (which `npm run check:caps` pins to the tier_caps table). NOTE: the
 * payments-webhook and the proration maths use the SEPARATE copy in data/proration.ts (kept
 * dependency-free for the Deno edge runtime); `check:caps` pins THAT copy to the same table too,
 * so all three — this, proration's, and the DB — agree.
 */
export const PRINTS_PER_MONTH: Record<string, number> = {
  [PRODUCTS.tierPro]: TIER_LIMITS.pro.includedPrintsPerMonth,
  [PRODUCTS.tierVip]: TIER_LIMITS.vip.includedPrintsPerMonth,
};

/** Permissive limits (every cap unlimited) — used whenever LIMITS_ENFORCED is off. */
const UNLIMITED: TierLimits = {
  binders: Infinity,
  pagesPerBinder: Infinity,
  composerPagesPerMonth: Infinity,
  artUploads: Infinity,
  fullPrint: false, // print eligibility is decided by tier/entitlement, not by this switch
  advancedSearch: false, // likewise: a paid capability, not a cap the dev switch should hand out
  findSimilar: false, // likewise — PRO's similarity search, not something LIMITS_ENFORCED=0 grants
  multiPageCompose: false, // likewise — VIP's upgraded composer, not something LIMITS_ENFORCED=0 grants
  includedPrintsPerMonth: Infinity,
};

/** Is a grant currently in effect? Lifetime rows (null expiry) always are. */
export function isActive(row: EntitlementRow, nowMs: number): boolean {
  if (!row.expires_at) return true;
  const end = Date.parse(row.expires_at);
  return Number.isNaN(end) ? true : end > nowMs;
}

/** Does the user hold an ACTIVE grant for `product`? (Direct product check, tier-independent.) */
export function hasProduct(rows: EntitlementRow[], product: string, nowMs: number): boolean {
  return rows.some((r) => r.product === product && isActive(r, nowMs));
}

/** The sibling tcgscan account's paid level, or null. 'vip' > 'pro'. Each is its own product row
 *  (a VIP holds tcgscan_vip, not tcgscan_pro); future tiers extend this without a migration. */
export function tcgscanLevel(rows: EntitlementRow[], nowMs: number): 'pro' | 'vip' | null {
  if (hasProduct(rows, PRODUCTS.tcgscanVip, nowMs)) return 'vip';
  if (hasProduct(rows, PRODUCTS.tcgscanPro, nowMs)) return 'pro';
  return null;
}

/**
 * CROSS-APP: does the user hold ANY paid TCGScan tier (PRO or VIP), bought in the sibling app and
 * written to this shared ledger? Gates scan-powered features here (they need any tcgscan paid
 * membership, not PRO specifically). For the exact level use `tcgscanLevel`. See docs/SYNERGY.md.
 */
export function hasTcgscanPro(rows: EntitlementRow[], nowMs: number): boolean {
  return tcgscanLevel(rows, nowMs) !== null;
}

/**
 * Did this grant come from someone actually paying?
 *
 * `!== 'trial'` rather than `=== 'stripe'`, matching the server (src/data/bundle.ts): a row with a
 * missing or unrecognised source keeps its discount rather than silently losing one it may have
 * paid for, and a manual/comp grant stays eligible because we gave it deliberately.
 */
export function isPaidGrant(row: EntitlementRow): boolean {
  return row.source !== 'trial';
}

/**
 * CROSS-APP: holds a PAID (non-trial) TCGScan tier - the exact condition the server requires before
 * granting the bundle coupon. A trial earns nothing (owner call 2026-08-10, docs/SYNERGY.md), so
 * the plans page must read THIS, not hasTcgscanPro, or it advertises a 60% checkout will refuse.
 */
export function tcgscanIsPaid(rows: EntitlementRow[], nowMs: number): boolean {
  return rows.some(
    (r) =>
      (r.product === PRODUCTS.tcgscanPro || r.product === PRODUCTS.tcgscanVip) &&
      isActive(r, nowMs) &&
      isPaidGrant(r),
  );
}

/** Holds a PAID (non-trial) michi tier. Gates copy that claims "you're a paying member". */
export function michiIsPaid(rows: EntitlementRow[], nowMs: number): boolean {
  return rows.some(
    (r) =>
      (r.product === PRODUCTS.tierPro || r.product === PRODUCTS.tierVip) &&
      isActive(r, nowMs) &&
      isPaidGrant(r),
  );
}

/**
 * CROSS-APP: holds an ACTIVE TCGScan tier billed YEARLY. This is the exact condition the server's
 * bundleQualifies (src/data/bundle.ts) requires before it grants the 60% bundle on a YEARLY michi
 * purchase — a monthly, trial, or manual (interval null) sibling qualifies only the monthly bundle.
 * The plans page reads it so a yearly 60% price is never shown to someone checkout would charge the
 * 20%/list price. Mirrors bundleQualifies: ANY active sibling tier row with interval === 'year'.
 */
export function tcgscanIsYearly(rows: EntitlementRow[], nowMs: number): boolean {
  return rows.some(
    (r) =>
      (r.product === PRODUCTS.tcgscanPro || r.product === PRODUCTS.tcgscanVip) &&
      isActive(r, nowMs) &&
      r.interval === 'year',
  );
}

/**
 * Resolve the effective tier from a signed-in user's entitlement rows. Only real (non-guest)
 * accounts can hold paid tiers — guests always resolve to 'guest'. VIP beats PRO beats free.
 */
export function resolveTier(
  input: { isSignedIn: boolean; rows: EntitlementRow[] },
  nowMs: number,
): Tier {
  if (!input.isSignedIn) return 'guest';
  const active = input.rows.filter((r) => isActive(r, nowMs));
  if (active.some((r) => r.product === PRODUCTS.tierVip)) return 'vip';
  if (active.some((r) => r.product === PRODUCTS.tierPro)) return 'pro';
  return 'free';
}

/**
 * Does the user get full print of their OWN binders? Included with a PRO/VIP subscription only.
 * One-time prints are now per-binder purchases (`pdf_binder:<id>`), checked at the binder (see
 * PrintPlaceholdersSheet), not here. Free users get a short example PDF, never their own binders.
 */
export function hasFullPrint(tier: Tier): boolean {
  return tier === 'pro' || tier === 'vip';
}

/**
 * Does this tier get "Advanced Search"? (sort by value + price filters + tri-colour + refine by
 * similarity — see TierLimits.advancedSearch.)
 *
 * Reads the tier directly rather than `limitsForTier`, exactly like `hasFullPrint`: this is a paid
 * capability, so the LIMITS_ENFORCED dev switch must not hand it out (or take it away).
 */
export function hasAdvancedSearch(tier: Tier): boolean {
  return TIER_LIMITS[tier].advancedSearch;
}

/**
 * Does this tier get the visual-similarity search? (PRO and above — see TierLimits.findSimilar.)
 *
 * Reads the tier directly rather than `limitsForTier`, exactly like `hasFullPrint`: this is a paid
 * capability, so the LIMITS_ENFORCED dev switch must not hand it out (or take it away).
 */
export function hasFindSimilar(tier: Tier): boolean {
  return TIER_LIMITS[tier].findSimilar;
}

/** The active limits for a tier — permissive (all unlimited) while LIMITS_ENFORCED is off. */
export function limitsForTier(tier: Tier): TierLimits {
  return LIMITS_ENFORCED ? TIER_LIMITS[tier] : UNLIMITED;
}

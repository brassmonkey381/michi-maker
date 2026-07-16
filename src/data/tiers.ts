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
  /** One-time LIFETIME full-print unlock. GRANDFATHERED — existing holders keep it forever. */
  pdfPrint: 'pdf_print',
  /** PRO subscription (entitlements.expires_at set per billing period). */
  tierPro: 'tier_pro',
  /** VIP subscription (entitlements.expires_at set per billing period). */
  tierVip: 'tier_vip',
  /**
   * CROSS-APP: TCGScan Pro. Sold by the sibling app (tcgscan / idontgitit.com) but written to
   * this SAME shared `entitlements` ledger, so michi can read it to unlock scan-powered features
   * here (e.g. "Build a binder from your collection"). See docs/SYNERGY.md. michi never sells or
   * resolves a *tier* from it — it's a feature key checked directly via `hasTcgscanPro`.
   */
  tcgscanPro: 'tcgscan_pro',
} as const;

/** One entitlement row as the client reads it (owner-scoped by RLS). */
export interface EntitlementRow {
  product: string;
  /** ISO timestamp; null = lifetime (one-time unlock). */
  expires_at: string | null;
}

/**
 * MASTER SWITCH for the free-tier CAPS (binder/page counts, composer quota, uploads…).
 *
 * `false` = permissive: every limit reads as unlimited, so nothing new restricts existing
 * users. Flip to `true` only once pricing/checkout is live and the owner has signed off on the
 * numbers below. This flag does NOT touch the print unlock — that gate is already live and only
 * ever *adds* access (PRO/VIP + grandfathered pdf_print), it never takes any away.
 */
export const LIMITS_ENFORCED = false;

/** Per-tier capability limits. `Infinity` = unlimited. */
export interface TierLimits {
  /** Max user binders. */
  binders: number;
  /**
   * Max pages per binder, counted in APP pages (one page = one side; see binderPhysics.ts).
   * Marketing talks in double-sided sheets, so "20 double-sided pages" = 40 here.
   */
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
   * Full-binder prints INCLUDED with the subscription each month (extra prints are the
   * one-time per-binder purchase). Metering not built yet — until it is, `fullPrint` alone
   * gates the Download button and included prints are effectively unlimited.
   */
  includedPrintsPerMonth: number;
}

/**
 * OWNER-SET numbers (2026-07-16 — see docs/roadmap/MONETIZATION-TIERS.md). Tune here in one
 * place; the app never hardcodes *price* (that lives in the payment provider dashboard) — only
 * these caps. Kept behind LIMITS_ENFORCED so they don't bite until pricing is live.
 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  // Guest is NOT an advertised plan — a taste before the sign-in prompt (SignInPerk, not
  // UpgradePerk): 1 binder, 6 pages (3 double-sided sheets).
  guest: {
    binders: 1,
    pagesPerBinder: 6,
    composerPagesPerMonth: 0,
    artUploads: 0,
    fullPrint: false,
    includedPrintsPerMonth: 0,
  },
  // 3 binders × 20 double-sided sheets × 32 cards (4×4 both sides) = up to 1,920 cards.
  free: {
    binders: 3,
    pagesPerBinder: 40,
    composerPagesPerMonth: Infinity,
    artUploads: 10,
    fullPrint: false,
    includedPrintsPerMonth: 0,
  },
  // 12 binders × 640 cards = 7,680 ("over 7,500 cards"). $3.99/mo or $39.99/yr.
  pro: {
    binders: 12,
    pagesPerBinder: 40,
    composerPagesPerMonth: Infinity,
    artUploads: 100,
    fullPrint: true,
    includedPrintsPerMonth: 1,
  },
  // $9.99/mo or $99.99/yr.
  vip: {
    binders: Infinity,
    pagesPerBinder: Infinity,
    composerPagesPerMonth: Infinity,
    artUploads: Infinity,
    fullPrint: true,
    includedPrintsPerMonth: 5,
  },
};

/** Permissive limits (every cap unlimited) — used whenever LIMITS_ENFORCED is off. */
const UNLIMITED: TierLimits = {
  binders: Infinity,
  pagesPerBinder: Infinity,
  composerPagesPerMonth: Infinity,
  artUploads: Infinity,
  fullPrint: false, // print eligibility is decided by tier/entitlement, not by this switch
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

/**
 * CROSS-APP: does the user hold an active TCGScan Pro grant (bought in the sibling app, written
 * to this shared ledger)? Gates scan-powered features here. See docs/SYNERGY.md.
 */
export function hasTcgscanPro(rows: EntitlementRow[], nowMs: number): boolean {
  return hasProduct(rows, PRODUCTS.tcgscanPro, nowMs);
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
 * Does the user get full print? PRO/VIP include it, and any active `pdf_print` unlock does too
 * (the grandfather clause — one-time buyers keep print forever even before tiers existed).
 */
export function hasFullPrint(tier: Tier, rows: EntitlementRow[], nowMs: number): boolean {
  if (tier === 'guest') return false; // guests are never entitled, whatever rows say
  if (tier === 'pro' || tier === 'vip') return true;
  return rows.some((r) => r.product === PRODUCTS.pdfPrint && isActive(r, nowMs));
}

/** The active limits for a tier — permissive (all unlimited) while LIMITS_ENFORCED is off. */
export function limitsForTier(tier: Tier): TierLimits {
  return LIMITS_ENFORCED ? TIER_LIMITS[tier] : UNLIMITED;
}

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
  /** Max pages per binder. */
  pagesPerBinder: number;
  /** ✨ Composer / auto-fill pages per calendar month (metering not built yet — see roadmap). */
  composerPagesPerMonth: number;
  /** Uploaded art images retained. */
  artUploads: number;
  /** Full fill-sheet / placeholder PDF export of any binder. */
  fullPrint: boolean;
}

/**
 * STRAWMAN numbers from docs/roadmap/MONETIZATION-TIERS.md. Tune here in one place; the app
 * never hardcodes *price* (that lives in the payment provider dashboard) — only these caps.
 * Kept behind LIMITS_ENFORCED so they don't bite until pricing is live.
 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  guest: {
    binders: 3,
    pagesPerBinder: 10,
    composerPagesPerMonth: 0,
    artUploads: 0,
    fullPrint: false,
  },
  free: {
    binders: 10,
    pagesPerBinder: 20,
    composerPagesPerMonth: 5,
    artUploads: 20,
    fullPrint: false,
  },
  pro: {
    binders: 50,
    pagesPerBinder: 50,
    composerPagesPerMonth: Infinity,
    artUploads: 500,
    fullPrint: true,
  },
  vip: {
    binders: Infinity,
    pagesPerBinder: Infinity,
    composerPagesPerMonth: Infinity,
    artUploads: Infinity,
    fullPrint: true,
  },
};

/** Permissive limits (every cap unlimited) — used whenever LIMITS_ENFORCED is off. */
const UNLIMITED: TierLimits = {
  binders: Infinity,
  pagesPerBinder: Infinity,
  composerPagesPerMonth: Infinity,
  artUploads: Infinity,
  fullPrint: false, // print eligibility is decided by tier/entitlement, not by this switch
};

/** Is a grant currently in effect? Lifetime rows (null expiry) always are. */
export function isActive(row: EntitlementRow, nowMs: number): boolean {
  if (!row.expires_at) return true;
  const end = Date.parse(row.expires_at);
  return Number.isNaN(end) ? true : end > nowMs;
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

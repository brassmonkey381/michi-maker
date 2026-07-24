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
  // UpgradePerk): 1 binder, 6 pages (3 double-sided sheets), 10 artworks (owner set 2026-07-17).
  guest: {
    binders: 1,
    pagesPerBinder: 6,
    composerPagesPerMonth: 0,
    artUploads: 10,
    fullPrint: false,
    includedPrintsPerMonth: 0,
  },
  // 3 binders × 16 pages × 16 cards (4×4) = 768 ("over 750 cards").
  free: {
    binders: 3,
    pagesPerBinder: 16,
    composerPagesPerMonth: Infinity,
    artUploads: 100,
    fullPrint: false,
    includedPrintsPerMonth: 0,
  },
  // 12 binders × 40 pages × 16 cards = 7,680 ("over 7,500 cards"). $3.99/mo or $39.99/yr.
  pro: {
    binders: 12,
    pagesPerBinder: 40,
    composerPagesPerMonth: Infinity,
    artUploads: 1000,
    fullPrint: true,
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
    includedPrintsPerMonth: 3,
  },
};

/**
 * Included prints per month by tier, for code that has a PRODUCT key rather than a Tier — chiefly
 * the prorated upgrade maths. Kept beside TIER_LIMITS so the two can't drift.
 *
 * MIRRORED in supabase/functions/payments-webhook/index.ts, which computes a term's allocation at
 * upgrade time and cannot import from here (Deno edge runtime). Change both together.
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

/** The active limits for a tier — permissive (all unlimited) while LIMITS_ENFORCED is off. */
export function limitsForTier(tier: Tier): TierLimits {
  return LIMITS_ENFORCED ? TIER_LIMITS[tier] : UNLIMITED;
}

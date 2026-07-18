/**
 * "Premium" rarity = ABOVE Double Rare (the full-art / secret / special chase tiers) — the cards
 * worth featuring. Used to keep the Home "Recent & Upcoming" card carousel tight: the base tiers
 * (Common / Uncommon / Rare / Holo Rare), plain rule-box Double Rares, and non-values drop out.
 *
 * The catalog stores rarity as a Title-Case English string ("Double Rare", "Illustration Rare",
 * "Ultra Rare", "Special Illustration Rare", "Hyper Rare", "Secret Rare", …). We define the floor
 * by EXCLUSION so any new fancy rarity the catalog gains is premium by default — only the known
 * below-the-floor tiers are filtered out.
 */

/** Rarities BELOW the featured floor (matched case-insensitively). Promos are INCLUDED (many are
 *  full-art / chase cards); Double Rares are EXCLUDED (rule-box ex/V bulk), per owner 2026-07-17. */
const BASE_RARITIES = new Set([
  '',
  'common',
  'uncommon',
  'rare',
  'holo rare',
  'rare holo',
  'double rare',
  'none',
  'unconfirmed',
]);

/** True for the full-art / secret / special tiers above Double Rare. */
export function isPremiumRarity(rarity: string | undefined | null): boolean {
  return !BASE_RARITIES.has((rarity ?? '').trim().toLowerCase());
}

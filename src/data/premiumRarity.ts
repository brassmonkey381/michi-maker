/**
 * "Premium" rarity = Double Rare and higher (all the full-art / secret / special chase tiers) —
 * the cards worth featuring. Used to keep the Home "Recent & Upcoming" card carousel tight: the
 * base tiers (Common / Uncommon / Rare / Holo Rare), Promos, and non-values drop out.
 *
 * The catalog stores rarity as a Title-Case English string ("Double Rare", "Illustration Rare",
 * "Ultra Rare", "Special Illustration Rare", "Hyper Rare", "Secret Rare", …). We define the floor
 * by EXCLUSION so any new fancy rarity the catalog gains is premium by default — only the known
 * base tiers are filtered out.
 */

/** Rarities BELOW the "Double Rare and higher" floor (matched case-insensitively). Promos are
 *  INCLUDED (many are full-art / chase cards), per owner call 2026-07-17. */
const BASE_RARITIES = new Set([
  '',
  'common',
  'uncommon',
  'rare',
  'holo rare',
  'rare holo',
  'none',
  'unconfirmed',
]);

/** True for Double Rare and every full-art / secret / special tier above it. */
export function isPremiumRarity(rarity: string | undefined | null): boolean {
  return !BASE_RARITIES.has((rarity ?? '').trim().toLowerCase());
}

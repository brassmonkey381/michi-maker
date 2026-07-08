/**
 * Pokémon TCG rarity → concise code mapping.
 *
 * The catalog stores rarity as an English display string (e.g. "Holo Rare", "Ultra Rare"). For
 * compact UI (binder card labels) we map each to the **Japanese rarity code**, which is far
 * shorter and is the de-facto shorthand collectors use (C, U, R, RR, SR, SAR, UR, …).
 *
 * This module is intentionally self-contained and data-source-agnostic (it takes a plain rarity
 * string, imports nothing) so it can be lifted upstream into the shared `tcgscan-browse` package
 * unchanged if we want the code available to every consumer.
 *
 * ── Mapping table ────────────────────────────────────────────────────────────────────────────
 * Columns: catalog rarity string → English tier → English symbol → Japanese code. Grouped as in
 * the reference tables. `catalog` is the exact (case-insensitive) string as it appears in the
 * catalog's `rarity` field; blank `catalog` marks a reference row we haven't observed in the data
 * yet (kept for documentation / upstream completeness, harmless as an extra alias).
 *
 * Main-set rarities (the numbered set list in standard packs):
 *   Common                       ●            → C
 *   Uncommon                     ◆            → U
 *   Rare / Holo Rare             ★            → R      (modern Rare is guaranteed holo)
 *   Double Rare                  ★★           → RR     (ex / V / GX rule-box)
 *   Triple Rare                  ★★★          → RRR    (VMAX / VSTAR)      [not seen in catalog]
 *   ACE SPEC Rare / Rare Ace     ACE SPEC     → ACE    (one-per-deck Trainer/Energy)
 *
 * Secret / alternate-art tiers (card number exceeds the set total, e.g. 210/198):
 *   Illustration Rare            ★ (gold)     → AR     (full-bleed art, non-rule-box)
 *   Ultra Rare                   ★★ (white)   → SR     (full-art ex / Trainer, solid bg)
 *   Special Illustration Rare    ★★ (gold)    → SAR    (story full-art + texture)
 *   Hyper Rare                   ★★★ (gold)   → UR     (gold-etched foil)
 *
 * Specialized / historical sub-rarities (promos, subsets, retired eras):
 *   Shiny Rare / Shiny Holo Rare ★ (silver)   → S      (baby shiny, star-burst bg)
 *   Shiny Ultra Rare             ★★ (silver)  → SSR    (full-art textured shiny rule-box)
 *   Rainbow Rare                 rainbow ★    → HR     (retired, Sword & Shield era)
 *   Amazing Rare                 "A" block    → A      (retired, Vivid Voltage era)
 *   Radiant Rare                 —            → K      (かがやく / Radiant Pokémon)
 *   Prism Rare                   ◇            → PR     (Prism Star)
 *   Promo                        ★ + PROMO    → PROMO  (events, blisters, tins)
 *
 * Intentionally NOT mapped (fall through to the raw string in {@link rarityCode}, because the
 * English label is ambiguous across eras or isn't a Japanese-coded rarity): "Secret Rare",
 * "Classic Collection", "Rare BREAK", "Mega Hyper Rare", "Mega Attack Rare", "Black White Rare",
 * "Futuristic Rare". Non-values ("None", "Unconfirmed", "") resolve to '' and drop out.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Which reference table a rarity belongs to (used to section the in-app explainer). */
export type RarityGroup = 'main' | 'secret' | 'special';

/** One reference-table row: the full English↔Japanese correspondence for a rarity. */
export interface RarityEntry {
  /** Catalog `rarity` string this row matches, lowercased. '' ⇒ documentation-only alias. */
  catalog: string;
  /** English rarity tier name. */
  tier: string;
  /** English print symbol (best-effort text description). */
  symbol: string;
  /** Concise Japanese rarity code — what we display. */
  jp: string;
  /** Reference-table grouping: main set / secret & alt-art / specialized & historical. */
  group: RarityGroup;
}

/** The full mapping table (source of truth; the lookup map below is derived from it). */
export const RARITY_TABLE: readonly RarityEntry[] = [
  // main set
  { catalog: 'common', tier: 'Common', symbol: '●', jp: 'C', group: 'main' },
  { catalog: 'uncommon', tier: 'Uncommon', symbol: '◆', jp: 'U', group: 'main' },
  { catalog: 'rare', tier: 'Rare', symbol: '★', jp: 'R', group: 'main' },
  { catalog: 'holo rare', tier: 'Rare (Holo)', symbol: '★', jp: 'R', group: 'main' },
  { catalog: 'double rare', tier: 'Double Rare', symbol: '★★', jp: 'RR', group: 'main' },
  { catalog: 'triple rare', tier: 'Triple Rare', symbol: '★★★', jp: 'RRR', group: 'main' },
  { catalog: 'ace spec rare', tier: 'ACE SPEC', symbol: 'ACE SPEC', jp: 'ACE', group: 'main' },
  { catalog: 'rare ace', tier: 'ACE SPEC', symbol: 'ACE SPEC', jp: 'ACE', group: 'main' },
  // secret / alternate art
  { catalog: 'illustration rare', tier: 'Illustration Rare', symbol: '★ (gold)', jp: 'AR', group: 'secret' },
  { catalog: 'ultra rare', tier: 'Ultra Rare', symbol: '★★ (white)', jp: 'SR', group: 'secret' },
  { catalog: 'special illustration rare', tier: 'Special Illustration Rare', symbol: '★★ (gold)', jp: 'SAR', group: 'secret' },
  { catalog: 'hyper rare', tier: 'Hyper Rare', symbol: '★★★ (gold)', jp: 'UR', group: 'secret' },
  // specialized / historical
  { catalog: 'shiny rare', tier: 'Shiny Rare', symbol: '★ (silver)', jp: 'S', group: 'special' },
  { catalog: 'shiny holo rare', tier: 'Shiny Rare', symbol: '★ (silver)', jp: 'S', group: 'special' },
  { catalog: 'shiny ultra rare', tier: 'Shiny Ultra Rare', symbol: '★★ (silver)', jp: 'SSR', group: 'special' },
  { catalog: 'rainbow rare', tier: 'Rainbow Rare', symbol: 'rainbow ★', jp: 'HR', group: 'special' },
  { catalog: 'amazing rare', tier: 'Amazing Rare', symbol: '"A" block', jp: 'A', group: 'special' },
  { catalog: 'radiant rare', tier: 'Radiant Rare', symbol: '—', jp: 'K', group: 'special' },
  { catalog: 'prism rare', tier: 'Prism Rare', symbol: '◇', jp: 'PR', group: 'special' },
  { catalog: 'promo', tier: 'Promo', symbol: '★ + PROMO', jp: 'PROMO', group: 'special' },
];

/** Lookup derived from {@link RARITY_TABLE}: lowercased catalog string → Japanese code. */
export const RARITY_CODES: Readonly<Record<string, string>> = Object.freeze(
  RARITY_TABLE.reduce<Record<string, string>>((acc, e) => {
    if (e.catalog) acc[e.catalog] = e.jp;
    return acc;
  }, {}),
);

/** Rarity strings that are placeholders/junk rather than a real rarity — resolve to ''. */
const EMPTY_RARITIES = new Set(['', 'none', 'unconfirmed']);

/**
 * Map a catalog `rarity` string to its concise Japanese code. Case-insensitive. Unmapped but
 * real rarities fall back to the trimmed input (so nothing is silently hidden); placeholder
 * values ("None"/"Unconfirmed"/"") return '' so callers can drop them.
 */
export function rarityCode(rarity: string): string {
  const key = rarity.trim().toLowerCase();
  if (EMPTY_RARITIES.has(key)) return '';
  return RARITY_CODES[key] ?? rarity.trim();
}

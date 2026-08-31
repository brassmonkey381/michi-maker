/**
 * Series names, shortened the way collectors actually write them.
 *
 * The catalogue stores a series as its full title — "Sword & Shield", "HeartGold & SoulSilver" —
 * which is far wider than a chip on a card. The short forms below are not derived, they are
 * looked up, because there is no rule that produces both of the two commonest ones: "Sword &
 * Shield" is SWSH (two letters a word) and "Scarlet & Violet" is SV (one letter a word), from
 * identical "X & Y" shapes. Any algorithm gets one of them wrong. Seventeen series exist; writing
 * them out is smaller than the rule would have been, and it is right.
 *
 * A name not in the table falls back to initials, so a series added upstream shows something
 * plausible instead of nothing.
 */

/** The community's short form for each series the catalogue publishes. */
const SERIES_CODES: Record<string, string> = {
  'Sword & Shield': 'SWSH',
  'Scarlet & Violet': 'SV',
  'Sun & Moon': 'SM',
  'Black & White': 'BW',
  'Diamond & Pearl': 'DP',
  'HeartGold & SoulSilver': 'HGSS',
  'Mega Evolution': 'ME',
  'Promos & Miscellaneous': 'PROMO',
  Platinum: 'PL',
  'E-Card': 'E',
  XY: 'XY',
  EX: 'EX',
  Neo: 'NEO',
  Base: 'BASE',
  Gym: 'GYM',
  POP: 'POP',
  Other: 'OTHER',
};

/**
 * Initials for a series nobody has written a short form for: the first letter of each real word,
 * skipping the ampersand. Capped at four so a long new name cannot blow the chip open.
 */
function initials(name: string): string {
  const words = name
    .split(/[\s&/-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  if (words.length === 0) return '';
  return words
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

/** "Sword & Shield" → "SWSH". '' for an empty name, so a caller can skip drawing the chip. */
export function seriesCode(name: string | undefined | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  return SERIES_CODES[trimmed] ?? initials(trimmed);
}

/**
 * The set's own name, without the series prefix the catalogue bakes into it: sets are stored as
 * "SWSH04: Vivid Voltage", and beside a series chip already reading SWSH that prefix says the same
 * thing twice. Sets with no prefix ("Champion's Path") come back untouched.
 *
 * THE NAME, not a code, and not an abbreviation of the name. The codes the catalogue publishes are
 * mnemonics for some sets (PAF, BS, FO) and bare sequence numbers for others (SWSH04, SV02), and
 * "04" identifies nothing to a person holding the card. Nor is there a rule that turns a name into
 * the short form players use — Vivid Voltage is VIV, Chilling Reign is CRE, Brilliant Stars is
 * BRS — so inventing one would mean hand-writing and maintaining an entry for all two hundred
 * sets and every set still to come, to end up with something less recognisable than the name.
 *
 * Only a prefix that looks like a SET CODE is removed — letters and digits, no spaces — so a name
 * whose colon is part of the title ("Shining Fates: Shiny Vault") keeps both halves.
 */
export function setDisplayName(name: string | undefined | null): string {
  const trimmed = (name ?? '').trim();
  const match = /^[A-Za-z0-9]+:\s*(.+)$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

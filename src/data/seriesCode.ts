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
 * The set's code with the series prefix taken off, for the chip that sits immediately right of the
 * series chip: "SWSH04" next to a chip already reading SWSH is saying it twice, and the pair reads
 * perfectly well as SWSH · 04. Codes that carry no series prefix ("BS", "PAF") are left alone.
 *
 * This is the short form the bottom row needs. The set's NAME — "Vivid Voltage" — is the friendly
 * form, but no abbreviation of it is both short enough for this row and still recognisable, and
 * the row has an illustrator's name to make space for.
 *
 * Separators go too, so "SWSH11: TG" becomes "11TG" rather than a code with a colon adrift in it.
 */
export function setShortCode(code: string | undefined | null, series: string): string {
  const trimmed = (code ?? '').trim();
  if (!trimmed) return '';
  const compact = (v: string) => v.replace(/[\s:]+/g, '');
  const upper = trimmed.toUpperCase();
  const prefix = series.toUpperCase();
  if (prefix && upper.startsWith(prefix)) {
    const rest = compact(trimmed.slice(prefix.length));
    // A code that IS the series code (some series have a single eponymous set) keeps its own name
    // rather than shortening to nothing.
    if (rest) return rest.toUpperCase();
  }
  return compact(trimmed).toUpperCase();
}

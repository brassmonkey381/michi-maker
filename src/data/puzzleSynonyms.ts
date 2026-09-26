/**
 * Words the daily puzzle treats as the same answer.
 *
 * THE PROBLEM (owner, 2026-09-26). "I am concerned that someone getting it wrong for guessing
 * 'forest, lake' when the answer is 'tree, water' will be a bad experience." It is worse than a
 * bad experience: the player DID read the picture correctly and used an ordinary English word for
 * what they saw. Marking that wrong teaches them the game is arbitrary, and they stop playing.
 *
 * Measured on the puzzles scheduled at the time, six of seven refused a word carried by most of
 * the cards on their own page (scripts/puzzles/audit-guessability.mjs): `trees` on nine cards out
 * of nine of a "forest" page, `ice` on seven of a "snow" page, `sky` on six of a "clouds" page.
 *
 * ONE LIST, TWO JOBS, AND THAT IS THE POINT. The same families are used to
 *   1. ACCEPT a guess: naming any word in the answer's family counts, and
 *   2. REFUSE a pairing: fill-queue never builds a puzzle whose two answers share a family.
 * They have to be the same list, because a family that can satisfy either of two answer words
 * would let one guess solve half the puzzle twice. Rule 2 makes rule 1 safe, and
 * `puzzleSynonyms.test.ts` asserts the invariant rather than trusting it.
 *
 * SO THESE ARE TIGHTER THAN "RELATED". `cup` sits on seven of the nine cards of the food page and
 * is NOT here, because a cup is not food; someone who types it has named an object in the picture
 * rather than the thing the cards have in common. Accepting it would make the game mush. A puzzle
 * whose page genuinely supports a word this list does not cover is a bad puzzle, and the audit
 * flags it so it can be replaced instead.
 *
 * Everything here is lower case and singular-or-plural insensitive downstream: the matcher strips
 * a trailing "s" before looking a word up, so only one form of each needs listing.
 */

/** family name -> every word that counts as that family. The family name is itself a member. */
export const SYNONYM_FAMILIES: Record<string, readonly string[]> = {
  forest: ['forest', 'tree', 'trees', 'woods', 'woodland', 'jungle'],
  water: ['water', 'lake', 'pond', 'river', 'stream', 'sea', 'ocean', 'waves', 'underwater'],
  snow: ['snow', 'ice', 'winter', 'frost', 'icy'],
  sky: ['sky', 'cloud', 'clouds', 'clouded'],
  flowers: ['flower', 'flowers', 'petal', 'petals', 'blossom', 'blossoms', 'bloom'],
  city: ['city', 'town', 'street', 'urban', 'village'],
  house: ['house', 'home', 'cottage', 'hut', 'cabin'],
  grass: ['grass', 'field', 'meadow', 'lawn', 'plains', 'pasture'],
  mountain: ['mountain', 'mountains', 'cliff', 'peak', 'summit'],
  night: ['night', 'stars', 'star', 'moon', 'nighttime'],
  fire: ['fire', 'flame', 'flames', 'lava', 'embers', 'ember'],
  storm: ['storm', 'lightning', 'thunder', 'rain', 'rainy'],
  cave: ['cave', 'cavern', 'tunnel', 'underground'],
  ruins: ['ruin', 'ruins', 'temple', 'rubble'],
  desert: ['desert', 'sand', 'dunes', 'dune'],
  leaves: ['leaf', 'leaves', 'foliage'],
  rocks: ['rock', 'rocks', 'stone', 'stones', 'boulder'],
  garden: ['garden', 'greenhouse', 'orchard'],
};

/** Strip to the form the families are keyed on: lower case, letters only, no trailing plural. */
export function normalizeWord(word: string): string {
  const bare = (word ?? '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  return bare;
}

const lookup = new Map<string, string>();
for (const [family, words] of Object.entries(SYNONYM_FAMILIES)) {
  for (const w of words) lookup.set(w, family);
}

/**
 * The family a word belongs to, or null when it is in none. Tries the word as typed and then
 * without a trailing "s", so only one form of each word has to be listed above.
 */
export function synonymFamily(word: string): string | null {
  const w = normalizeWord(word);
  if (!w) return null;
  return lookup.get(w) ?? (w.endsWith('s') ? lookup.get(w.slice(0, -1)) ?? null : null);
}

/**
 * Do these two words name the same thing for the purposes of the game? Mirrors what
 * `public.puzzle_words_match` does with the seeded `puzzle_synonyms` table, so the rule can be
 * tested here without a database. It deliberately does NOT cover the typo and plural handling that
 * lives in SQL; this is only the synonym half.
 */
export function sameFamily(a: string, b: string): boolean {
  const fa = synonymFamily(a);
  return fa !== null && fa === synonymFamily(b);
}

/** Every family that has more than one word, for seeding and for the pairing rule. */
export function familyList(): { family: string; words: readonly string[] }[] {
  return Object.entries(SYNONYM_FAMILIES).map(([family, words]) => ({ family, words }));
}

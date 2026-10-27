/**
 * THE MOOD OF A PAGE, as words a stock photo site answers well.
 *
 * Stock sites know nothing about Pokémon: asked for "eevee" they return a plush, a cosplay or
 * nothing on topic (owner, 2026-10-27). Asked for "ocean waves" they return a thousand good
 * pictures. So a page's art panels are searched by what the page FEELS like, read off the energy
 * types of its cards: a page of Water cards gets the sea, a Fire page gets embers, a Psychic page
 * gets a nebula. Two queries per type so neighbouring pages of one type do not all show the same
 * sea; the caller alternates by panel. A page with no leading type gets a neutral mood.
 *
 * PURE ON PURPOSE: no imports, so `npm test` covers it.
 */

/** Energy types as the catalog names them, each with two scenes stock sites answer well. */
const MOODS: Record<string, [string, string]> = {
  grass: ['sunlit forest leaves', 'meadow wildflowers'],
  fire: ['glowing embers fire', 'campfire flames night'],
  water: ['ocean waves', 'underwater sunlight rays'],
  lightning: ['lightning storm sky', 'electric sparks dark'],
  psychic: ['purple nebula galaxy', 'aurora night sky'],
  fighting: ['rocky canyon cliffs', 'desert rock texture'],
  darkness: ['moonlit night forest', 'dark fog mist'],
  metal: ['brushed steel texture', 'chrome metal surface'],
  fairy: ['pink cherry blossoms', 'pastel clouds sky'],
  dragon: ['volcanic mountains clouds', 'dramatic storm clouds'],
  colorless: ['white feathers soft', 'misty clouds morning'],
};

/** A page with no leading type, or no Pokémon at all. */
const NEUTRAL: [string, string] = ['colorful bokeh lights', 'abstract light texture'];

export interface PageMood {
  /** The energy type the page leans on, lower case, or null for a mixed page. */
  type: string | null;
  /** Two scenes for that type; `moodQuery` picks one by panel. */
  scenes: [string, string];
}

/**
 * The mood of a page from its cards' types. The leading type wins when it is on at least two
 * cards and two fifths of the typed cards; otherwise the page is mixed and neutral. Card classes
 * ("Pokémon", "Trainer", "Energy") and art classes are not types and are ignored.
 */
export function pageMood(cardTypes: readonly (readonly string[])[]): PageMood {
  const counts = new Map<string, number>();
  let typed = 0;
  for (const types of cardTypes) {
    const own = new Set(types.map((t) => t.toLowerCase()).filter((t) => t in MOODS));
    if (!own.size) continue;
    typed += 1;
    for (const t of own) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (top && top[1] >= 2 && top[1] * 5 >= typed * 2) return { type: top[0], scenes: MOODS[top[0]] };
  return { type: null, scenes: NEUTRAL };
}

/** The scene for the nth panel of a page: the two scenes alternate so a spread is not twins. */
export function moodQuery(mood: PageMood, panelIndex: number): string {
  return mood.scenes[panelIndex % 2];
}

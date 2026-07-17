/**
 * Themed-art search over the bundled Art of Pokémon library (src/data/artofpkm.json, built by
 * scripts/build-art-library.mjs) — official promotional Pokémon artwork, hotlink-friendly and
 * ungated. Replaces the old Pexels/Pixabay photo search, whose results were too realistic for
 * the app's hand-drawn aesthetic.
 *
 * Queries match tagged Pokémon, characters, and titles; scenery-ish words ("fire", "ocean",
 * "night") expand to iconic species via THEME_SPECIES. Species with no library art fall back to
 * the PokeAPI official render (transparent PNG — the reliable host from the content pipeline).
 * Results are mapped to the same `ArtworkAsset` shape as before, tagged with their source.
 */

import type { ArtAspect, ArtworkAsset } from '@/data/artworkLibrary';
import library from '@/data/artofpkm.json';

interface LibraryEntry {
  i: number; // artofpkm artwork id
  t: string; // title
  b: string; // signed Active Storage blob id (non-expiring)
  f: string; // original filename
  p: [string, number][]; // tagged [species, dex]
  c: string[]; // tagged characters (trainers etc.)
  a?: string; // illustrator (present after the library is rebuilt with artist capture)
  s?: string; // original source URL (the specific post the art came from), post-rebuild
}

const ENTRIES = (library as unknown as { entries: LibraryEntry[] }).entries ?? [];

/** Some pages title themselves just "The Art of Pokémon" — that's site chrome, not a title. */
const cleanTitle = (t: string) => (/^the art of pok/i.test(t.trim()) ? '' : t);

export const artSearchProvider = 'artofpkm.com';

export const isArtSearchConfigured = ENTRIES.length > 0;

/** The full-size original behind an entry (302 → cdn.artofpkm.com). */
const originalUrl = (e: LibraryEntry) =>
  `https://www.artofpkm.com/rails/active_storage/blobs/redirect/${e.b}/${encodeURIComponent(e.f)}`;

/** artwork detail page (for provenance/citation). */
const pageUrl = (e: LibraryEntry) => `https://www.artofpkm.com/artwork/${e.i}`;

/** Friendly platform name from an original-source URL ("Instagram", "pixiv", …). */
function sourceHost(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h.endsWith('instagram.com')) return 'Instagram';
    if (h.endsWith('pixiv.net')) return 'pixiv';
    if (h.endsWith('twitter.com') || h.endsWith('x.com')) return 'X (Twitter)';
    return h;
  } catch {
    return 'source';
  }
}

/** Scenery / colour words → iconic species, so "fire" or "ocean" still finds fitting art. */
const THEME_SPECIES: Record<string, string[]> = {
  fire: ['charizard', 'arcanine', 'flareon', 'moltres', 'ho-oh', 'cyndaquil'],
  flame: ['charizard', 'arcanine', 'flareon', 'moltres'],
  ember: ['charizard', 'cyndaquil', 'flareon'],
  water: ['lapras', 'gyarados', 'vaporeon', 'squirtle', 'kyogre', 'primarina'],
  ocean: ['lapras', 'gyarados', 'kyogre', 'lugia', 'wailord'],
  sea: ['lapras', 'kyogre', 'lugia', 'wailord'],
  rain: ['castform', 'politoed', 'kyogre'],
  grass: ['venusaur', 'leafeon', 'sceptile', 'celebi', 'shaymin', 'bulbasaur'],
  forest: ['celebi', 'leafeon', 'shaymin', 'venusaur', 'decidueye'],
  leaf: ['leafeon', 'sceptile', 'shaymin'],
  lightning: ['pikachu', 'raichu', 'jolteon', 'zapdos', 'zeraora'],
  electric: ['pikachu', 'raichu', 'jolteon', 'zapdos', 'zeraora'],
  storm: ['zapdos', 'thundurus', 'kyogre'],
  psychic: ['mewtwo', 'mew', 'espeon', 'gardevoir', 'alakazam'],
  galaxy: ['mewtwo', 'mew', 'deoxys', 'lunala'],
  space: ['deoxys', 'lunala', 'solgaleo', 'rayquaza'],
  night: ['darkrai', 'umbreon', 'lunala', 'gengar'],
  dark: ['darkrai', 'umbreon', 'absol', 'gengar'],
  ghost: ['gengar', 'mimikyu', 'dragapult', 'banette'],
  metal: ['metagross', 'lucario', 'magearna', 'melmetal'],
  steel: ['metagross', 'lucario', 'melmetal'],
  fighting: ['lucario', 'machamp', 'hitmonlee'],
  fairy: ['sylveon', 'clefairy', 'mimikyu', 'gardevoir'],
  pink: ['clefairy', 'jigglypuff', 'sylveon', 'mew', 'slowpoke'],
  dragon: ['rayquaza', 'dragonite', 'garchomp', 'dragapult', 'salamence'],
  sky: ['rayquaza', 'togekiss', 'altaria', 'lugia', 'pidgeot'],
  cloud: ['altaria', 'togekiss', 'swablu'],
  colorless: ['eevee', 'pikachu', 'togekiss', 'snorlax'],
  ice: ['glaceon', 'articuno', 'lapras', 'alolan vulpix'],
  snow: ['glaceon', 'articuno', 'alolan vulpix'],
  rock: ['tyranitar', 'onix', 'larvitar'],
  ground: ['garchomp', 'excadrill', 'sandshrew'],
};

/** Every species the library knows, with its dex number — powers the PokeAPI render fallback. */
const SPECIES_DEX = new Map<string, number>();
for (const e of ENTRIES) for (const [name, dex] of e.p) if (!SPECIES_DEX.has(name)) SPECIES_DEX.set(name, dex);

/** PokeAPI official artwork render — transparent PNG, very reliable host. */
const pokeApiArt = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;

function toAsset(e: LibraryEntry, aspect: ArtAspect): ArtworkAsset {
  const subjects = [...e.p.map(([n]) => n), ...e.c];
  return {
    id: `artofpkm-${e.i}`,
    url: originalUrl(e),
    title: cleanTitle(e.t) || subjects.slice(0, 3).join(', ') || 'Pokémon artwork',
    themes: subjects,
    aspect,
    sourceDomain: 'artofpkm.com',
    license: `Official Pokémon artwork, via ${pageUrl(e)}`,
    licenseClear: false,
    // Provenance stamped on the slot at placement. Prefer the deeper ORIGINAL source (the
    // Instagram/shop post the art came from) once the rebuilt library carries it; otherwise the
    // artofpkm artwork page, which itself credits the artist and links the original.
    attribution: {
      sourceName: e.s ? sourceHost(e.s) : 'The Art of Pokémon',
      sourceUrl: e.s || pageUrl(e),
      ...(e.a ? { artist: e.a } : {}),
    },
  };
}

/**
 * Search the library. Matching: query tokens against tagged species (strong), characters and
 * title (weaker); scenery words expand through THEME_SPECIES. Most-recent first within a score.
 * A known species with little/no library art gets a PokeAPI render appended so a species query
 * never comes back empty.
 */
export async function searchArt(query: string, aspect: ArtAspect): Promise<ArtworkAsset[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const expanded = new Set(tokens);
  for (const t of tokens) for (const s of THEME_SPECIES[t] ?? []) expanded.add(s);

  const scored: { e: LibraryEntry; score: number }[] = [];
  for (const e of ENTRIES) {
    let score = 0;
    for (const term of expanded) {
      if (e.p.some(([name]) => name === term)) score += 3;
      else if (e.p.some(([name]) => name.includes(term))) score += 2;
      if (e.c.some((c) => c.toLowerCase().includes(term))) score += 2;
      if (cleanTitle(e.t).toLowerCase().includes(term)) score += 1;
    }
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || b.e.i - a.e.i);
  const results = scored.slice(0, 24).map(({ e }) => toAsset(e, aspect));

  // Species render fallback: a direct species query should never come back empty-handed.
  for (const term of expanded) {
    const dex = SPECIES_DEX.get(term);
    if (dex && results.length < 6) {
      results.push({
        id: `pokeapi-${dex}`,
        url: pokeApiArt(dex),
        title: `${term} (official render)`,
        themes: [term],
        aspect,
        sourceDomain: 'raw.githubusercontent.com',
        license: 'Official Pokémon render (PokeAPI mirror)',
        licenseClear: false,
      });
      break;
    }
  }
  return results;
}

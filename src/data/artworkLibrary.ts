/**
 * Playground artwork library — themed art the editor can suggest as pocket filler.
 *
 * The art is official **Pokémon renders** (the Sugimori-style artwork from the PokéAPI sprite
 * CDN on GitHub — stable, CORS/hotlink-friendly, transparent PNG). They match the app's vibe and
 * slice cleanly into pockets. Because the renders are Nintendo / Game Freak / TPCi IP they are
 * NOT license-clear (`licenseClear: false`) — fine for a personal fan project, but flagged so the
 * set can be audited before anything ships. Art a user pastes in via the editor is likewise not
 * license-clear by default — see `domainOf()` / the editor's "paste URL" flow, which tags it.
 */

export type ArtAspect = 'landscape' | 'portrait' | 'square';

export interface ArtworkAsset {
  id: string;
  url: string;
  title: string;
  /** Theme keywords used to match a binder's palette/title. */
  themes: string[];
  /** The art's natural aspect (so it can be suggested for slots it fills cleanly). */
  aspect: ArtAspect;
  sourceDomain: string;
  license: string;
  /** false ⇒ provenance/licence unverified; review/remove before publishing. */
  licenseClear: boolean;
}

const POKEAPI = 'raw.githubusercontent.com';
/** Official-artwork render for a National-Dex number (transparent PNG, square). */
const dex = (n: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`;

const render = (id: string, n: number, title: string, themes: string[]): ArtworkAsset => ({
  id,
  url: dex(n),
  title,
  themes,
  aspect: 'square',
  sourceDomain: POKEAPI,
  license: 'Pokémon © Nintendo / Game Freak / TPCi',
  licenseClear: false,
});

export const ARTWORK_LIBRARY: ArtworkAsset[] = [
  render('art-charizard', 6, 'Charizard', ['fire', 'warm', 'red', 'orange', 'dragon']),
  render('art-gyarados', 130, 'Gyarados', ['water', 'ocean', 'blue', 'sea', 'dragon']),
  render('art-venusaur', 3, 'Venusaur', ['grass', 'forest', 'green', 'nature']),
  render('art-pikachu', 25, 'Pikachu', ['electric', 'yellow', 'gold', 'bright']),
  render('art-jolteon', 135, 'Jolteon', ['electric', 'yellow', 'storm', 'bright']),
  render('art-mewtwo', 150, 'Mewtwo', ['psychic', 'purple', 'legend', 'cosmic']),
  render('art-mew', 151, 'Mew', ['psychic', 'pink', 'fairy', 'soft']),
  render('art-rayquaza', 384, 'Rayquaza', ['dragon', 'green', 'sky', 'storm', 'legend']),
  render('art-hooh', 250, 'Ho-Oh', ['fire', 'gold', 'legend', 'sunset', 'rainbow']),
  render('art-umbreon', 197, 'Umbreon', ['dark', 'night', 'black', 'moon']),
  render('art-glaceon', 471, 'Glaceon', ['ice', 'water', 'blue', 'frost', 'cool']),
  render('art-sylveon', 700, 'Sylveon', ['fairy', 'pink', 'soft', 'pastel']),
];

/** The aspect bucket a slot footprint falls into (cover-fit "fits" any, but this sorts best matches first). */
export function slotAspect(rows: number, cols: number): ArtAspect {
  return cols > rows ? 'landscape' : rows > cols ? 'portrait' : 'square';
}

/** Host of a URL, for tagging the provenance of pasted (unverified) art. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

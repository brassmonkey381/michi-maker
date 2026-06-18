/**
 * Playground artwork library — themed, hand-drawn art the editor can suggest as pocket filler,
 * and that the example binders slice into their pages.
 *
 * The set is **Japanese ukiyo-e woodblock prints** (Hokusai & Hiroshige) — flat, bold, illustrated
 * scenery that reads as hand-drawn cartoon art and is the aesthetic ancestor of anime/Pokémon art.
 * Each is **public domain** (the artists died well over a century ago) and served from Wikimedia
 * Commons via `Special:FilePath` (a hash-free, stable redirect — verified to resolve to image/jpeg).
 * Pick by `themes` + `aspect`: landscape prints fill wide banners/2×2 blocks, portrait prints fill
 * tall columns. Art a user pastes in via the editor is tagged `licenseClear:false` for review.
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

const WM = 'commons.wikimedia.org';
/** A Commons file by name, as a stable hash-free hotlink (1024px wide). */
const fp = (file: string) => `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=1024`;

const print = (
  id: string,
  file: string,
  title: string,
  themes: string[],
  aspect: ArtAspect,
): ArtworkAsset => ({
  id,
  url: fp(file),
  title,
  themes,
  aspect,
  sourceDomain: WM,
  license: 'Public domain',
  licenseClear: true,
});

export const ARTWORK_LIBRARY: ArtworkAsset[] = [
  // Landscape (wide) — for banners and 2×2 blocks.
  print('art-great-wave', 'The_Great_Wave_off_Kanagawa.jpg', 'The Great Wave off Kanagawa — Hokusai',
    ['ocean', 'water', 'wave', 'blue', 'sea', 'storm'], 'landscape'),
  print('art-red-fuji', 'Red_Fuji_southern_wind_clear_morning.jpg', 'Fine Wind, Clear Morning (Red Fuji) — Hokusai',
    ['fire', 'red', 'warm', 'sunrise', 'sunset', 'mountain', 'gold'], 'landscape'),
  print('art-lightning', 'Lightnings_below_the_summit.jpg', 'Thunderstorm Beneath the Summit — Hokusai',
    ['storm', 'dark', 'dragon', 'electric', 'night', 'black', 'psychic'], 'landscape'),
  print('art-watermill', 'Watermill_at_Onden.jpg', 'Watermill at Onden — Hokusai',
    ['grass', 'forest', 'green', 'water', 'nature'], 'landscape'),
  // Portrait (tall) — for columns and accents. (Hiroshige, "One Hundred Famous Views of Edo".)
  print('art-edo-rain', '100_views_edo_058.jpg', 'Sudden Shower over Shin-Ōhashi (rain) — Hiroshige',
    ['rain', 'water', 'blue', 'mist', 'storm'], 'portrait'),
  print('art-edo-sea', '100_views_edo_039.jpg', 'A coast of Edo (sea) — Hiroshige',
    ['ocean', 'water', 'sea', 'blue', 'spring'], 'portrait'),
  print('art-edo-moon', '100_views_edo_038.jpg', 'Moon over the river — Hiroshige',
    ['night', 'moon', 'water', 'blue', 'gold', 'legend'], 'portrait'),
  print('art-edo-snow', '100_views_edo_111.jpg', 'Snow at Edo (winter) — Hiroshige',
    ['snow', 'white', 'ice', 'cool', 'winter'], 'portrait'),
  print('art-edo-green', '100_views_edo_065.jpg', 'A garden of Edo (summer green) — Hiroshige',
    ['grass', 'green', 'forest', 'garden', 'summer'], 'portrait'),
  print('art-edo-sky', '100_views_edo_048.jpg', 'A sky over Edo — Hiroshige',
    ['sky', 'sunset', 'warm', 'gold', 'summer'], 'portrait'),
  print('art-edo-willow', '100_views_edo_069.jpg', 'Willows in the rain — Hiroshige',
    ['grass', 'green', 'willow', 'rain', 'water'], 'portrait'),
  print('art-edo-forest', '100_views_edo_026.jpg', 'A grove of Edo — Hiroshige',
    ['grass', 'forest', 'green', 'nature', 'garden'], 'portrait'),
  print('art-edo-fireworks', '100_views_edo_098.jpg', 'Fireworks at Ryōgoku — Hiroshige',
    ['fire', 'fireworks', 'night', 'warm', 'red', 'festival', 'gold'], 'portrait'),
];

const urlById = (id: string) => ARTWORK_LIBRARY.find((a) => a.id === id)?.url ?? '';

/** Friendly handles for the themed art, for use when authoring example binders. */
export const ART = {
  greatWave: urlById('art-great-wave'),
  redFuji: urlById('art-red-fuji'),
  lightning: urlById('art-lightning'),
  watermill: urlById('art-watermill'),
  edoRain: urlById('art-edo-rain'),
  edoSea: urlById('art-edo-sea'),
  edoMoon: urlById('art-edo-moon'),
  edoSnow: urlById('art-edo-snow'),
  edoGreen: urlById('art-edo-green'),
  edoSky: urlById('art-edo-sky'),
  edoWillow: urlById('art-edo-willow'),
  edoForest: urlById('art-edo-forest'),
  edoFireworks: urlById('art-edo-fireworks'),
} as const;

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

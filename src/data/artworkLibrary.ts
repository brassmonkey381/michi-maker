/**
 * Playground artwork library — themed art the editor can suggest as pocket filler.
 *
 * IMPORTANT — provenance hygiene: every asset carries its `sourceDomain`, `license`, and a
 * `licenseClear` flag so the set can be audited and cleaned up before anything ships. The
 * seeds below are all license-clear public-domain / CC0 works from Wikimedia Commons (they
 * hotlink reliably). Art a user pastes in via the editor is NOT license-clear by default —
 * see `domainOf()` / the editor's "paste URL" flow, which tags it for review.
 *
 * We deliberately do NOT scrape Pinterest: those images are third-party (and usually fan-art,
 * i.e. also Nintendo IP), hotlinks break, and it violates Pinterest's ToS. To use a Pinterest
 * find locally, paste its URL in the editor — it'll be marked licenseClear:false for cleanup.
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

export const ARTWORK_LIBRARY: ArtworkAsset[] = [
  {
    id: 'art-fire-flames',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Fighting_the_Flames%2C_Fire_Fire.jpg/1280px-Fighting_the_Flames%2C_Fire_Fire.jpg',
    title: 'Fighting the Flames',
    themes: ['fire', 'warm', 'red', 'orange'],
    aspect: 'landscape',
    sourceDomain: WM,
    license: 'Public domain',
    licenseClear: true,
  },
  {
    id: 'art-fire-engine',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Fighting_the_Flames%2C_Whitefriars_Fire_Engine_and_its_Famous_Dog_Baron.jpg',
    title: 'Whitefriars Fire Engine',
    themes: ['fire', 'warm', 'red'],
    aspect: 'portrait',
    sourceDomain: WM,
    license: 'Public domain',
    licenseClear: true,
  },
  {
    id: 'art-forest-pines',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Shishkin%2C_Ivan_-_Morning_in_a_Pine_Forest.jpg/1280px-Shishkin%2C_Ivan_-_Morning_in_a_Pine_Forest.jpg',
    title: 'Morning in a Pine Forest — Shishkin',
    themes: ['forest', 'grass', 'green', 'nature'],
    aspect: 'landscape',
    sourceDomain: WM,
    license: 'Public domain',
    licenseClear: true,
  },
  {
    id: 'art-sunset-met',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Sunset_Sky_MET_ap74.30.jpg/1280px-Sunset_Sky_MET_ap74.30.jpg',
    title: 'Sunset Sky',
    themes: ['sunset', 'warm', 'sky', 'orange', 'gold'],
    aspect: 'landscape',
    sourceDomain: WM,
    license: 'CC0',
    licenseClear: true,
  },
  {
    id: 'art-sunset-gap',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Sunset_Sky_-_Google_Art_Project.jpg/1280px-Sunset_Sky_-_Google_Art_Project.jpg',
    title: 'Sunset Sky (Google Art Project)',
    themes: ['sunset', 'warm', 'sky', 'pink'],
    aspect: 'landscape',
    sourceDomain: WM,
    license: 'Public domain',
    licenseClear: true,
  },
  {
    id: 'art-storm-spirits',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/The_Storm_Spirits.jpg/1280px-The_Storm_Spirits.jpg',
    title: 'The Storm Spirits',
    themes: ['storm', 'electric', 'sky', 'dark', 'psychic'],
    aspect: 'landscape',
    sourceDomain: WM,
    license: 'Public domain',
    licenseClear: true,
  },
  {
    id: 'art-ocean-backhuysen',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Backhuysen%2C_Ludolf%2C_I_-_Christ_in_the_Storm_on_the_Sea_of_Galilee_-_Google_Art_Project.jpg/1280px-Backhuysen%2C_Ludolf%2C_I_-_Christ_in_the_Storm_on_the_Sea_of_Galilee_-_Google_Art_Project.jpg',
    title: 'Storm on the Sea of Galilee — Backhuysen',
    themes: ['ocean', 'water', 'blue', 'sea', 'storm'],
    aspect: 'landscape',
    sourceDomain: WM,
    license: 'Public domain',
    licenseClear: true,
  },
  {
    id: 'art-ocean-rembrandt',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Rembrandt_Christ_in_the_Storm_on_the_Lake_of_Galilee.jpg/1280px-Rembrandt_Christ_in_the_Storm_on_the_Lake_of_Galilee.jpg',
    title: 'Storm on the Lake of Galilee — Rembrandt',
    themes: ['ocean', 'water', 'blue', 'sea'],
    aspect: 'portrait',
    sourceDomain: WM,
    license: 'Public domain',
    licenseClear: true,
  },
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

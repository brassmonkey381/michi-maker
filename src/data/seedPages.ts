/**
 * SEEDED ARRIVALS (owner, 2026-10-30, via analytics-studio: "what if the flow for these users was
 * to instead start with 3 theme'd cards, and then have them click 'complete' to choose how they
 * want to fill the rest of the page?").
 *
 * THE MEASURED FAILURE. Of 435 Reddit-ad sessions in a day, 387 saw the first-pocket ring and never
 * opened the card browser; 271 of those left within 3 seconds of the ring. The first screen was nine
 * empty pockets and an instruction, and the ad had promised a page worth staring at. So a tagged
 * arrival (lib/landing SKIP_LANDING_SOURCES, the same gate as landing.skip) now lands on a page that
 * already holds three real cards from one theme, and the walkthrough points at Complete.
 *
 * WHICH THEME. Keyed on the creative `code` the ad put on the URL (rd_* in the campaign params,
 * lib/analytics landingCampaignParams), so the page continues the picture the ad showed. Unknown or
 * missing codes get DEFAULT_SEED. A new ad needs a line here, not a new mechanism; the data server
 * holds the cards, the ids below are just which three (picked 2026-10-30 from score_cards_by_theme
 * over the scene tags each ad's spread is about).
 *
 * PURE: `node --test` reaches all of it. The pages are built with pagesForCards, the same atomic
 * payload createBinder takes from every other builder, so the binder exists with its cards and no
 * card.add fires for them as adds (the store sends one card.add { kind: 'seed' } instead).
 */
import { pagesForCards, uuidv4, type DemoPage, type DemoSlot } from './binderTypes.ts';

/**
 * THE PICTURE UNDER THE CARDS (owner, 2026-10-30): one of the offered preset pictures
 * (src/data/presets.json, our own bucket, Pexels and Pixabay licences) sits in pocket 4, row two
 * column one, as a one-pocket artwork. The walkthrough's first step asks for it to be dragged
 * across the row, so the arrival's first act is the editor's best trick and not a tap on a tool.
 * Credit is stamped on the slot the way stock art is; no `origin`, because these are the app's
 * own offered pictures, not something the visitor brought from outside.
 */
export interface SeedPicture {
  /** The preset's id in presets.json, for the notes. */
  preset: string;
  url: string;
  artist: string;
  sourceName: 'Pexels' | 'Pixabay';
  sourceUrl: string;
}

export interface SeedSet {
  /** The theme's analytics name: binder.add { theme } and the registry notes. */
  theme: string;
  /** Three card ids, reading order, pockets 1 to 3 of a 3x3 page. */
  cardIds: readonly [string, string, string];
  /** The picture in pocket 4, to be dragged across row two. */
  picture: SeedPicture;
}

const BUCKET = 'https://piikwvntldytjejxmcla.supabase.co/storage/v1/object/public/binder-art/29a6e25c-c5a0-4c2a-9a5b-62c98e288605';

const PICTURES = {
  fire: { preset: 'fire', url: `${BUCKET}/preset-fire-bccad3a03da5.jpg`, artist: 'Marek Piwnicki', sourceName: 'Pexels', sourceUrl: 'https://www.pexels.com/photo/close-up-shot-of-a-burning-fire-8738463/' },
  forest: { preset: 'forest', url: `${BUCKET}/preset-forest-98719f16edb4.jpg`, artist: 'jplenio', sourceName: 'Pixabay', sourceUrl: 'https://pixabay.com/photos/forest-pathway-lush-greenery-8684668/' },
  light: { preset: 'light', url: `${BUCKET}/preset-light-7c64d9430a47.jpg`, artist: 'tommyvideo', sourceName: 'Pixabay', sourceUrl: 'https://pixabay.com/illustrations/blue-ray-lights-abstract-background-1772970/' },
} as const satisfies Record<string, SeedPicture>;

export const SEED_SETS = {
  /** Magby, Numel, Groudon: lava and volcano scenes, the Lidi volcano spread the first ads show. */
  volcano: { theme: 'volcano', cardIds: ['523867', '676035', '523880'], picture: PICTURES.fire },
  /** Dedenne, Shiftry, Leafeon V: autumn leaves, the garden painting behind the Rainbow image ad. */
  autumn: { theme: 'autumn', cardIds: ['684413', '542884', '246688'], picture: PICTURES.forest },
  /** Surfing Pikachu, Flying Pikachu V, Pikachu with Grey Felt Hat: the coverflow ads show many binders, so the most recognisable face. */
  pikachu: { theme: 'pikachu', cardIds: ['124124', '250304', '518861'], picture: PICTURES.light },
} as const satisfies Record<string, SeedSet>;

export type SeedTheme = keyof typeof SEED_SETS;

/** The creative code on the ad's URL, to the theme its page starts with. */
export const SEED_BY_CODE: Readonly<Record<string, SeedTheme>> = {
  rd_lidi_image: 'volcano',
  rd_lidi_video: 'volcano',
  rd_rainbow_image: 'autumn',
  rd_coverflow_4x5: 'pikachu',
  rd_coverflow_16x9: 'pikachu',
  rd_coverflow_loop: 'pikachu',
  rd_sub_coverflow_loop: 'pikachu',
};

export const DEFAULT_SEED: SeedTheme = 'volcano';

/** The seed set for an arrival, by its creative code; the default for none or an unknown one. */
export function seedSetFor(code: string | null | undefined): SeedSet {
  const key = code ? SEED_BY_CODE[code.trim().toLowerCase()] : undefined;
  return SEED_SETS[key ?? DEFAULT_SEED];
}

/** Where the picture starts: row two, column one, one pocket wide. */
export const SEED_ART_CELL = { row: 1, col: 0 } as const;

/** One 3x3 page: the three seeds in pockets 1 to 3, the theme's picture in pocket 4. */
export function seedPages(set: SeedSet): DemoPage[] {
  const pages = pagesForCards([...set.cardIds]);
  const art: DemoSlot = {
    id: uuidv4(),
    row: SEED_ART_CELL.row,
    col: SEED_ART_CELL.col,
    rowSpan: 1,
    colSpan: 1,
    type: 'artwork',
    imageUrl: set.picture.url,
    attribution: { artist: set.picture.artist, sourceName: set.picture.sourceName, sourceUrl: set.picture.sourceUrl },
  };
  pages[0].slots.push(art);
  return pages;
}

const SEED_PICTURE_URLS = new Set<string>(Object.values(PICTURES).map((p) => p.url));

/** The seeded picture on a page, wherever it has been dragged to, or undefined once removed. */
export function seedArtSlot(page: Pick<DemoPage, 'slots'>): DemoSlot | undefined {
  return page.slots.find((s) => s.type === 'artwork' && !!s.imageUrl && SEED_PICTURE_URLS.has(s.imageUrl));
}

/**
 * Is the walkthrough's drag done? Two pockets wide or more (owner: "let them drag to either
 * column 2 or column 3 to pass"), or the picture is gone, which is a choice too.
 */
export function seedArtDone(page: Pick<DemoPage, 'slots'>): boolean {
  const art = seedArtSlot(page);
  return !art || art.colSpan >= 2;
}

/** How many pockets a seed set fills, for the card.add { kind: 'seed' } count. */
export function seedCount(pages: readonly DemoPage[]): number {
  return pages.reduce((n, p) => n + p.slots.filter((s) => !!s.cardId).length, 0);
}

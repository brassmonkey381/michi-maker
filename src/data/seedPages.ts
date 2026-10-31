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
 * THE PICTURE UNDER THE CARDS (owner, 2026-10-30): a picture sits in pocket 4, row two column
 * one, as a one-pocket artwork. The walkthrough's first step asks for it to be dragged across the
 * row, so the arrival's first act is the editor's best trick and not a tap on a tool.
 *
 * The owner picked the volcano and autumn ones by number from Pexels contact sheets; they are
 * hosted in our own bucket by scripts/seeds/rehost-seed-pictures.mjs (a Pexels address is theirs
 * to change). The grails one is the meadow from the owner's "Top 8 TCGs" binder, the page the
 * coverflow ads show, already in the bucket. Credit is stamped on the slot the way stock art is,
 * and the DeviantArt piece keeps its `origin` so the sharing gate treats it as that binder does.
 */
export interface SeedPicture {
  /** Where it came from, for the notes. */
  preset: string;
  url: string;
  artist: string;
  sourceName: string;
  sourceUrl: string;
  origin?: 'external';
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

const OWNER_ART = 'https://piikwvntldytjejxmcla.supabase.co/storage/v1/object/public/binder-art/689143c4-5d32-4905-991e-c894f9cf2620';

const PICTURES = {
  /** Pexels "volcano" #16 (owner, 2026-10-30): a lava fountain. */
  volcano: { preset: 'pexels 38842765', url: `${BUCKET}/seed-volcano-2a353bafb64f.jpg`, artist: 'James Lee', sourceName: 'Pexels', sourceUrl: 'https://www.pexels.com/photo/erupting-lava-flow-at-hawaii-volcanoes-national-park-38842765/' },
  /** Pexels "autumn" #3 (owner, 2026-10-30): foliage on a wall. */
  autumn: { preset: 'pexels 40283694', url: `${BUCKET}/seed-autumn-b009c31747c2.jpg`, artist: 'Ebahir', sourceName: 'Pexels', sourceUrl: 'https://www.pexels.com/photo/vibrant-autumn-foliage-on-a-rustic-wall-40283694/' },
  /** The meadow across row two of "Top 8 TCGs" page one, the art the coverflow ads show. */
  meadow: { preset: 'Top 8 TCGs page 1', url: `${OWNER_ART}/fanart-deviantart-pokemon-0-d7a02d4f521f.jpg`, artist: 'RaidenDraconius', sourceName: 'DeviantArt', sourceUrl: 'https://www.deviantart.com/raidendraconius/art/Eevee-on-a-prairie-869505521', origin: 'external' },
} as const satisfies Record<string, SeedPicture>;

export const SEED_SETS = {
  /** Magby, Numel, Groudon: lava and volcano scenes, the Lidi volcano spread the first ads show. */
  volcano: { theme: 'volcano', cardIds: ['523867', '676035', '523880'], picture: PICTURES.volcano },
  /** Dedenne, Shiftry, Leafeon V: autumn leaves, the garden painting behind the Rainbow image ad. */
  autumn: { theme: 'autumn', cardIds: ['684413', '542884', '246688'], picture: PICTURES.autumn },
  /**
   * Mewtwo ☆, Mew ☆ δ, Shining Tyranitar: three of the grails on "Top 8 TCGs" page one, the page
   * the coverflow ads show (owner, 2026-10-30, who chose them over the Pikachu trio: the ad
   * promised expensive cards, so the page starts with three). The fill is whatever Complete
   * finds; no price-aware fill, by the owner's decision.
   */
  grails: { theme: 'grails', cardIds: ['87427', '87408', '89171'], picture: PICTURES.meadow },
} as const satisfies Record<string, SeedSet>;

export type SeedTheme = keyof typeof SEED_SETS;

/** The creative code on the ad's URL, to the theme its page starts with. */
export const SEED_BY_CODE: Readonly<Record<string, SeedTheme>> = {
  rd_lidi_image: 'volcano',
  rd_lidi_video: 'volcano',
  rd_rainbow_image: 'autumn',
  rd_coverflow_4x5: 'grails',
  rd_coverflow_16x9: 'grails',
  rd_coverflow_loop: 'grails',
  rd_sub_coverflow_loop: 'grails',
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
    attribution: {
      artist: set.picture.artist,
      sourceName: set.picture.sourceName,
      sourceUrl: set.picture.sourceUrl,
      ...(set.picture.origin ? { origin: set.picture.origin } : {}),
    },
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

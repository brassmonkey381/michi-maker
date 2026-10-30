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
import { pagesForCards, type DemoPage } from './binderTypes.ts';

export interface SeedSet {
  /** The theme's analytics name: binder.add { theme } and the registry notes. */
  theme: string;
  /** Three card ids, reading order, pockets 1 to 3 of a 3x3 page. */
  cardIds: readonly [string, string, string];
}

export const SEED_SETS = {
  /** Magby, Numel, Groudon: lava and volcano scenes, the Lidi volcano spread the first ads show. */
  volcano: { theme: 'volcano', cardIds: ['523867', '676035', '523880'] },
  /** Dedenne, Shiftry, Leafeon V: autumn leaves, the garden painting behind the Rainbow image ad. */
  autumn: { theme: 'autumn', cardIds: ['684413', '542884', '246688'] },
  /** Surfing Pikachu, Flying Pikachu V, Pikachu with Grey Felt Hat: the coverflow ads show many binders, so the most recognisable face. */
  pikachu: { theme: 'pikachu', cardIds: ['124124', '250304', '518861'] },
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

/** One 3x3 page with the three seeds in pockets 1 to 3. */
export function seedPages(set: SeedSet): DemoPage[] {
  return pagesForCards([...set.cardIds]);
}

/** How many pockets a seed set fills, for the card.add { kind: 'seed' } count. */
export function seedCount(pages: readonly DemoPage[]): number {
  return pages.reduce((n, p) => n + p.slots.filter((s) => !!s.cardId).length, 0);
}

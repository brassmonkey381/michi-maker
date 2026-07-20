/**
 * The curated sample binder behind the "See a free example (PDF)" button in the print sheet.
 *
 * Purpose-built to show what a real fill-sheet export looks like, end to end: SIX binder pages —
 * four of card placeholders (plus a couple of tonal inserts) and two of sliced artwork — so the
 * example exercises BOTH output files the exporter now produces (a plain-paper placeholders PDF
 * and a matte-cardstock art PDF). Card slots reference real Base Set catalog ids so the labels
 * resolve to actual names/sets/numbers through the runtime catalog; the art pages slice official
 * Pokémon renders from the PokéAPI sprite CDN (CORS-friendly, see `pokemonArt`).
 *
 * This is deliberately its OWN fixture rather than `store.exampleBinders[0]` (which is a
 * script-generated, card-only binder): the teaser should be stable and show every feature.
 */
import { card, insert, page, pokemonArt, sliceRegion, type DemoBinder, type DemoSlot } from '@/data/content/_helpers';

/** Real Base Set catalog ids (resolve through the runtime catalog), one 3×3 grid per page. */
const CARD_PAGES: string[][] = [
  ['42346', '42360', '42371', '42382', '657516', '42393', '42404', '42415', '42433'],
  ['42347', '42351', '42352', '42353', '42354', '42355', '42356', '42357', '42358'],
  ['42359', '42361', '42362', '42363', '42364', '42365', '42366', '42367', '42368'],
  // Last page mixes in two tonal inserts to show they also print on the plain-paper file.
  ['42369', '42370', '42372', '42373', 'insert', '42375', '42376', 'insert', '42378'],
];

/** Map a flat 9-id grid to a page of 1×1 slots (the sentinel 'insert' becomes a tonal filler). */
function cardPage(grid: string[], title: string): DemoSlot[] {
  return grid.map((id, n) => {
    const row = Math.floor(n / 3);
    const col = n % 3;
    return id === 'insert' ? insert(row, col, '#e7dcc8') : card(row, col, id);
  });
}

export const EXAMPLE_FILL_SHEET_BINDER: DemoBinder = {
  id: 'example-fill-sheet',
  title: 'michi sampler binder',
  layoutStyle: 'freeform',
  isExample: true,
  pages: [
    page(cardPage(CARD_PAGES[0], 'Base Set — page 1'), { title: 'Base Set — page 1' }),
    page(cardPage(CARD_PAGES[1], 'Base Set — page 2'), { title: 'Base Set — page 2' }),
    page(cardPage(CARD_PAGES[2], 'Base Set — page 3'), { title: 'Base Set — page 3' }),
    page(cardPage(CARD_PAGES[3], 'Base Set — page 4'), { title: 'Base Set — page 4 (with inserts)' }),
    // Art page 1: one render sliced across all nine pockets — reads as a single continuous picture.
    page(sliceRegion(0, 0, 3, 3, pokemonArt(6)), { title: 'Art — Charizard spread' }),
    // Art page 2: two separate pictures on one page (a 2×3 hero over a 1×3 banner).
    page([...sliceRegion(0, 0, 2, 3, pokemonArt(149)), ...sliceRegion(2, 0, 1, 3, pokemonArt(151))], {
      title: 'Art — Dragonite + Mew',
    }),
  ],
};

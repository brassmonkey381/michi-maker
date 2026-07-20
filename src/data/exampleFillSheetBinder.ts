/**
 * The curated sample binder behind the "See a free example (PDF)" button in the print sheet.
 *
 * Purpose-built to prove the exporter handles a REAL, MIXED binder — not a tidy "N card pages
 * then N art pages" — so the free teaser shows every tricky case:
 *   - pages that MIX card placeholders, folded art panels, sliced art, and inserts together;
 *   - **folded 1×2 art panels surrounded by cards**, placed on each page's valid inside-edge
 *     fold pair (see binderPhysics: left 3-col page → cols 0–1, right → cols 1–2, 4-col → 0–1
 *     or 2–3), so the printed fold pieces are physically insertable;
 *   - a page whose one picture is sliced continuously across all nine pockets.
 * Because placeholders and art print as SEPARATE files, the card neighbours of a fold land in
 * the plain-paper file while the fold itself lands in the cardstock file — yet every piece is
 * still labeled with its true page/row/column, which is exactly what this example demonstrates.
 *
 * Card slots reference real Base Set catalog ids so labels resolve through the runtime catalog;
 * art slices official Pokémon renders from the PokéAPI sprite CDN (CORS-friendly, see
 * `pokemonArt`). This is its OWN fixture (not `store.exampleBinders[0]`, a card-only binder) so
 * the teaser is stable and exercises the whole exporter.
 */
import {
  artPanel,
  card,
  insert,
  page,
  pokemonArt,
  sliceRegion,
  type DemoBinder,
  type DemoSlot,
} from '@/data/content/_helpers';

/** A folded 1×2 art panel (colSpan 2 → one physical fold piece, art continuous across the fold). */
const fold = (row: number, col: number, dex: number): DemoSlot =>
  artPanel(row, col, pokemonArt(dex), { colSpan: 2 });

// PokéDex numbers for the art (iconic Base Set faces): Charizard 6, Blastoise 9, Gengar 94,
// Snorlax 143, Dragonite 149, Mew 151.
export const EXAMPLE_FILL_SHEET_BINDER: DemoBinder = {
  id: 'example-fill-sheet',
  title: 'michi sampler binder',
  layoutStyle: 'freeform',
  isExample: true,
  pages: [
    // Page 1 (right) — a plain full page of cards: the baseline the rest departs from.
    page(
      [
        card(0, 0, '42346'), card(0, 1, '42360'), card(0, 2, '42371'),
        card(1, 0, '42382'), card(1, 1, '657516'), card(1, 2, '42393'),
        card(2, 0, '42404'), card(2, 1, '42415'), card(2, 2, '42433'),
      ],
      { title: 'A full page of cards' },
    ),
    // Page 2 (left, 3-col) — a FOLDED art panel on the left fold pair (cols 0–1), ringed by cards
    // above, below, and to its right.
    page(
      [
        card(0, 0, '42347'), card(0, 1, '42351'), card(0, 2, '42352'),
        fold(1, 0, 149), card(1, 2, '42353'),
        card(2, 0, '42354'), card(2, 1, '42355'), card(2, 2, '42356'),
      ],
      { title: 'A folded art panel among cards' },
    ),
    // Page 3 (right, 3-col) — a fold on the RIGHT fold pair (cols 1–2), plus two tonal inserts,
    // proving inserts ride along on the plain-paper file too.
    page(
      [
        card(0, 0, '42357'), card(0, 1, '42358'), insert(0, 2, '#e7dcc8'),
        card(1, 0, '42359'), fold(1, 1, 94),
        card(2, 0, '42361'), card(2, 1, '42362'), insert(2, 2, '#d9c7a3'),
      ],
      { title: 'A fold, cards, and inserts' },
    ),
    // Page 4 (left, 4-col) — a wide page with a fold on the (0–1) pair and empty pockets left as
    // negative space, so labels are exercised on a non-3×3 grid.
    page(
      [
        card(0, 0, '42363'), card(0, 1, '42364'), card(0, 2, '42365'), card(0, 3, '42366'),
        fold(1, 0, 143), card(1, 2, '42367'), card(1, 3, '42368'),
      ],
      { title: 'A fold on a wide page', rows: 3, cols: 4 },
    ),
    // Page 5 (right) — one picture sliced continuously across all nine pockets (nine single
    // pieces, gap-compensated so it reads as one image).
    page(sliceRegion(0, 0, 3, 3, pokemonArt(6)), { title: 'One picture across nine pockets' }),
    // Page 6 (left, 3-col) — a fold (cols 0–1) beside a two-pocket sliced strip and cards: folds,
    // single slices, and placeholders all on one page.
    page(
      [
        card(0, 0, '42369'), card(0, 1, '42370'), card(0, 2, '42372'),
        fold(1, 0, 9), card(1, 2, '42373'),
        ...sliceRegion(2, 0, 1, 2, pokemonArt(151)), card(2, 2, '42374'),
      ],
      { title: 'A fold beside single slices' },
    ),
  ],
};

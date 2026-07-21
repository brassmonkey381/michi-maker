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
 * the art is our own PROCEDURAL theme backgrounds (see `themeBackgrounds.ts`) — no external art,
 * no licensing, clean to ship in a downloadable example. This is its OWN fixture (not
 * `store.exampleBinders[0]`, a card-only binder) so the teaser is stable and exercises the whole
 * exporter.
 */
import {
  card,
  insert,
  page,
  sliceRegion,
  themeBg,
  type DemoBinder,
  type DemoSlot,
} from '@/data/content/_helpers';
import { themeBackgroundDataUri } from '@/data/themeBackgrounds';

/** A folded 1×2 themed-background panel (colSpan 2 → one physical fold piece, continuous art). */
const fold = (row: number, col: number, theme: string): DemoSlot =>
  themeBg(row, col, theme, { colSpan: 2 });
export const EXAMPLE_FILL_SHEET_BINDER: DemoBinder = {
  id: 'example-fill-sheet',
  title: 'michi sampler binder',
  description:
    'A sample binder for the print feature — folded 1×2 art panels tucked among card placeholders, a picture sliced across a page, and tonal inserts. View only: this reference can’t be edited or copied.',
  layoutStyle: 'freeform',
  isExample: true,
  // View-only: resolvable at /binder/example-fill-sheet but never editable or duplicable.
  locked: true,
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
        fold(1, 0, 'tide'), card(1, 2, '42353'),
        card(2, 0, '42354'), card(2, 1, '42355'), card(2, 2, '42356'),
      ],
      { title: 'A folded art panel among cards' },
    ),
    // Page 3 (right, 3-col) — a fold on the RIGHT fold pair (cols 1–2), plus two tonal inserts,
    // proving inserts ride along on the plain-paper file too.
    page(
      [
        card(0, 0, '42357'), card(0, 1, '42358'), insert(0, 2, '#e7dcc8'),
        card(1, 0, '42359'), fold(1, 1, 'verdant'),
        card(2, 0, '42361'), card(2, 1, '42362'), insert(2, 2, '#d9c7a3'),
      ],
      { title: 'A fold, cards, and inserts' },
    ),
    // Page 4 (left, 4-col) — a wide page with a fold on the (0–1) pair and empty pockets left as
    // negative space, so labels are exercised on a non-3×3 grid.
    page(
      [
        card(0, 0, '42363'), card(0, 1, '42364'), card(0, 2, '42365'), card(0, 3, '42366'),
        fold(1, 0, 'ember'), card(1, 2, '42367'), card(1, 3, '42368'),
      ],
      { title: 'A fold on a wide page', rows: 3, cols: 4 },
    ),
    // Page 5 (right) — one picture sliced continuously across all nine pockets (nine single
    // pieces, gap-compensated so it reads as one image).
    page(
      sliceRegion(0, 0, 3, 3, themeBackgroundDataUri('spark', { w: 750, h: 1050, count: 30 })),
      { title: 'One picture across nine pockets' },
    ),
    // Page 6 (left, 3-col) — a fold (cols 0–1) beside a two-pocket sliced strip and cards: folds,
    // single slices, and placeholders all on one page.
    page(
      [
        card(0, 0, '42369'), card(0, 1, '42370'), card(0, 2, '42372'),
        fold(1, 0, 'stone'), card(1, 2, '42373'),
        ...sliceRegion(2, 0, 1, 2, themeBackgroundDataUri('frost', { w: 500, h: 350, count: 8 })),
        card(2, 2, '42374'),
      ],
      { title: 'A fold beside single slices' },
    ),
  ],
};

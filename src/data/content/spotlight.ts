/**
 * Content module: Hero spreads & single-Pokémon binders.
 *
 * Lean hardest into spans — full-page (3×3 / 2×2) `artwork` spreads with a few card accents,
 * and single-Pokémon books across 6–8 pages. Helpers in ./_helpers. The aggregator
 * (./index.ts) imports `cards` and `binders`; do not edit any other file.
 *
 * Span discipline (verified per page below):
 *   - A 2×2 artwork at (0,0) fills (0,0)(0,1)(1,0)(1,1); accents go only in the free pockets.
 *   - A true full-page spread is a SINGLE artwork spanning the whole grid, nothing else.
 *   - No slot ever overlaps another, and no slot exceeds the page rows×cols.
 */

import { artwork, card, page, type ContentModule } from '@/data/content/_helpers';

// Gallery mats — dark, art-flattering tones used as page canvases.
const GALLERY_DARK = '#14131A';
const EMBER_DARK = '#1B1410';
const NIGHT_DARK = '#0F1014';

// Every card referenced below already lives in the bundled catalogue (src/data/sampleData.ts),
// so this module declares no new cards.
export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Charizard — "Through the Ages": one species, many eras, a 2×2 hero a page.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'example-charizard-ages',
    title: 'Charizard · through the ages',
    description: 'One Pokémon across the eras — a big 2×2 hero each page, with line-mate accents.',
    layoutStyle: 'single_pokemon',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // 1999 — Base Set. 2×2 hero top-left, the modern starter line as accents.
      page(
        [
          artwork(0, 0, 'base1-4', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'sv03.5-004'),
          card(1, 2, 'sv03.5-005'),
          card(2, 2, 'base1-12'),
          // row 2 left mostly empty — breathing room under the hero.
        ],
        { title: '1999 · Base Set', backgroundColor: EMBER_DARK },
      ),
      // The evolution line — Charmander to Charizard ex (151), hero bottom-right.
      page(
        [
          card(0, 0, 'sv03.5-004'),
          card(1, 0, 'sv03.5-005'),
          artwork(1, 1, 'sv03.5-006', { rowSpan: 2, colSpan: 2 }),
          // (0,1) and (0,2) intentionally empty — negative space over the line.
        ],
        { title: '151 · the line', backgroundColor: EMBER_DARK },
      ),
      // Special-illustration alt art — 2×2 hero with two accents.
      page(
        [
          card(0, 0, 'sv03.5-168'),
          artwork(0, 1, 'sv03.5-199', { rowSpan: 2, colSpan: 2 }),
          card(2, 1, 'base1-4'),
          // (1,0), (2,0), (2,2) empty — frames the alt art.
        ],
        { title: '151 · special illustration', backgroundColor: GALLERY_DARK },
      ),
      // Modern ex — full-bleed 2×2 hero, generous negative space.
      page(
        [
          artwork(0, 1, 'sv03.5-006', { rowSpan: 2, colSpan: 2 }),
          card(2, 0, 'sv03.5-168'),
          // only one accent — almost all canvas.
        ],
        { title: '151 · Charizard ex', backgroundColor: EMBER_DARK },
      ),
      // Fire kin — a 2×2 hero bottom-left, three accents framing it.
      page(
        [
          card(0, 0, 'base1-12'),
          card(0, 2, 'base1-4'),
          artwork(1, 0, 'sv03.5-199', { rowSpan: 2, colSpan: 2 }),
          card(1, 2, 'sv03.5-006'),
          // (0,1) and (2,2) empty.
        ],
        { title: 'fire kin', backgroundColor: GALLERY_DARK },
      ),
      // The alt-art chase — a single 2×2 hero, nothing else. Pure focal point.
      page(
        [artwork(0, 0, 'sv03.5-199', { rowSpan: 2, colSpan: 2 })],
        { title: 'the chase', backgroundColor: NIGHT_DARK },
      ),
      // Finale — the whole 3×3 page is one full-bleed Charizard ex artwork.
      page(
        [artwork(0, 0, 'sv03.5-199', { rowSpan: 3, colSpan: 3 })],
        { title: 'curtain call', backgroundColor: NIGHT_DARK },
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Full-art gallery — each page one big full-bleed spread (or 2×2 + accents).
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'example-full-art-gallery',
    title: 'The full-art gallery',
    description: 'A wing of big full-bleed spreads — one masterpiece per page, framed by the mat.',
    layoutStyle: 'full_page_spread',
    isExample: true,
    coverCardId: 'swsh7-215',
    pages: [
      // Umbreon VMAX — full 3×3 spread, nothing else.
      page(
        [artwork(0, 0, 'swsh7-215', { rowSpan: 3, colSpan: 3 })],
        { title: 'Umbreon VMAX', backgroundColor: GALLERY_DARK },
      ),
      // Charizard ex alt — 2×2 hero with two accents in the leftover right column.
      page(
        [
          artwork(0, 0, 'sv03.5-199', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'sv03.5-006'),
          card(1, 2, 'sv03.5-168'),
          // bottom row empty.
        ],
        { title: 'Charizard ex', backgroundColor: EMBER_DARK },
      ),
      // Lugia — full 3×3 spread.
      page(
        [artwork(0, 0, 'cel25-22', { rowSpan: 3, colSpan: 3 })],
        { title: 'Lugia', backgroundColor: '#1A2230' },
      ),
      // Mew — 2×2 hero, one accent, lots of breathing room.
      page(
        [
          artwork(0, 1, 'cel25-11', { rowSpan: 2, colSpan: 2 }),
          card(2, 0, 'sv03.5-150'),
          // (0,0),(1,0),(2,1),(2,2) empty.
        ],
        { title: 'Mew', backgroundColor: '#1F1623' },
      ),
      // Blastoise — full 3×3 spread.
      page(
        [artwork(0, 0, 'base1-2', { rowSpan: 3, colSpan: 3 })],
        { title: 'Blastoise', backgroundColor: '#10202B' },
      ),
      // Mewtwo — 2×2 hero bottom-left, three accents up top and right.
      page(
        [
          card(0, 1, 'base1-10'),
          card(0, 2, 'cel25-11'),
          artwork(1, 0, 'sv03.5-150', { rowSpan: 2, colSpan: 2 }),
          card(1, 2, 'sv03.5-200'),
          // (0,0),(2,2) empty.
        ],
        { title: 'Mewtwo', backgroundColor: '#1A1722' },
      ),
      // The close — full 3×3 Lugia spread on near-black.
      page(
        [artwork(0, 0, 'cel25-22', { rowSpan: 3, colSpan: 3 })],
        { title: 'closing wall', backgroundColor: NIGHT_DARK },
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Anchor showcase — every page a different span shape: 1×2, 2×1, 2×2, 3×2…
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'example-anchor-spans',
    title: 'Anchors · span study',
    description: 'A study in span shapes — panoramic pairs, tall columns, 2×2 heroes, big halves.',
    layoutStyle: 'anchor',
    isExample: true,
    coverCardId: 'cel25-22',
    pages: [
      // 1×2 panoramic — a wide hero across the top-left two cells, sparse accents.
      page(
        [
          artwork(0, 0, 'cel25-22', { rowSpan: 1, colSpan: 2 }),
          card(0, 2, 'cel25-2'),
          card(1, 0, 'cel25-1'),
          card(2, 2, 'cel25-10'),
        ],
        { title: '1×2 · panoramic', backgroundColor: '#1A2230' },
      ),
      // 2×1 tall column — a vertical hero on the left, accents stacked right.
      page(
        [
          artwork(0, 0, 'sv03.5-199', { rowSpan: 2, colSpan: 1 }),
          card(0, 2, 'sv03.5-006'),
          card(1, 2, 'sv03.5-168'),
          card(2, 1, 'base1-4'),
          // (0,1),(1,1),(2,0),(2,2) empty.
        ],
        { title: '2×1 · column', backgroundColor: EMBER_DARK },
      ),
      // 2×2 hero — classic anchor, three accents along the open edges.
      page(
        [
          artwork(0, 0, 'swsh7-215', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'swsh7-179'),
          card(1, 2, 'swsh7-184'),
          card(2, 1, 'swsh7-125'),
          // (2,0),(2,2) empty.
        ],
        { title: '2×2 · hero', backgroundColor: GALLERY_DARK },
      ),
      // 3×2 big half — a half-page artwork (3 rows × 2 cols), single column of accents.
      page(
        [
          artwork(0, 0, 'cel25-11', { rowSpan: 3, colSpan: 2 }),
          card(0, 2, 'sv03.5-150'),
          card(2, 2, 'cel25-5'),
          // (1,2) empty between the two right-column accents.
        ],
        { title: '3×2 · big half', backgroundColor: '#1F1623' },
      ),
      // 1×3 banner — a 4-row page with a full-width banner across the top row.
      page(
        [
          artwork(0, 0, 'cel25-22', { rowSpan: 1, colSpan: 3 }),
          card(1, 0, 'cel25-1'),
          card(2, 1, 'cel25-2'),
          card(3, 2, 'cel25-10'),
          // staggered diagonal accents under the banner.
        ],
        { title: '1×3 · banner', rows: 4, backgroundColor: '#10202B' },
      ),
      // Diptych — twin 2×2 heroes on a 2×4 page, two legendaries side by side.
      page(
        [
          artwork(0, 0, 'cel25-22', { rowSpan: 2, colSpan: 2 }),
          artwork(0, 2, 'swsh7-215', { rowSpan: 2, colSpan: 2 }),
        ],
        { title: 'diptych', rows: 2, cols: 4, backgroundColor: NIGHT_DARK },
      ),
    ],
  },
];

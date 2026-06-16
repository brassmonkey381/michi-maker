/**
 * Content module: Hero spreads & single-Pokémon binders — at REAL card sizes.
 *
 * A standard card fills exactly ONE pocket, so the "big" moments here are physically
 * honest: oversized **jumbo** cards (≈2×2, auto-badged "JUMBO") and **V-UNION** sets
 * (four real 1×1 pieces tiling a 2×2 block, auto-badged "V-UNION"). Everything else is
 * a 1×1 standard `card`; tonal `insert`s may span for composition. Helpers live in
 * ./_helpers; the aggregator (./index.ts) imports `cards` and `binders`.
 *
 * Size discipline (verified per page below):
 *   - `jumbo(r,c,…)` and `vunion(r,c,…)` each occupy a 2×2 — those four cells are kept
 *     free and sit fully inside the page rows×cols.
 *   - Standard `card`s are always 1×1 (never spanned); only `insert`s span.
 *   - No slot ever overlaps another; pockets left out of `slots` are negative space.
 */

import {
  card,
  insert,
  jumbo,
  page,
  vunion,
  JUMBO,
  VUNION,
  type ContentModule,
} from '@/data/content/_helpers';

// Gallery mats — dark, art-flattering tones used as page canvases.
const GALLERY_DARK = '#14131A';
const EMBER_DARK = '#1B1410';
const NIGHT_DARK = '#0F1014';

// Every card referenced below already lives in the bundled catalogue (src/data/sampleData.ts),
// so this module declares no new cards.
export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Charizard — "Through the Ages": one species, many eras. Real jumbo heroes,
  //    1×1 standard Charizards across the eras, generous negative space.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'example-charizard-ages',
    title: 'Charizard · through the ages',
    description: 'One Pokémon across the eras — a real jumbo hero each page, with 1×1 era accents.',
    layoutStyle: 'single_pokemon',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // 1999 — Base Set. Jumbo Charizard hero top-left; the modern line as 1×1 accents.
      page(
        [
          jumbo(0, 0, JUMBO.charizard),
          card(0, 2, 'base1-4'),
          card(1, 2, 'sv03.5-004'),
          // (2,*) left empty — breathing room under the hero.
        ],
        { title: '1999 · Base Set', backgroundColor: EMBER_DARK },
      ),
      // The 151 evolution line — Charmander → Charmeleon → Charizard ex, all 1×1.
      page(
        [
          card(0, 0, 'sv03.5-004'),
          card(1, 1, 'sv03.5-005'),
          card(2, 2, 'sv03.5-006'),
          // pure diagonal — the rest is negative space.
        ],
        { title: '151 · the line', backgroundColor: EMBER_DARK },
      ),
      // Special illustration — jumbo hero bottom-right, two 1×1 alts framing it.
      page(
        [
          card(0, 0, 'sv03.5-168'),
          card(1, 0, 'sv03.5-199'),
          jumbo(1, 1, JUMBO.charizard),
          // (0,1),(0,2) empty — negative space above the hero.
        ],
        { title: '151 · special illustration', backgroundColor: GALLERY_DARK },
      ),
      // Modern ex — jumbo hero top-right, a single 1×1 accent. Almost all canvas.
      page(
        [
          jumbo(0, 1, JUMBO.charizard),
          card(2, 0, 'sv03.5-006'),
          // (1,0),(2,1),(2,2) empty.
        ],
        { title: '151 · Charizard ex', backgroundColor: EMBER_DARK },
      ),
      // Fire kin — jumbo hero bottom-left, three 1×1 Charizards framing it.
      page(
        [
          card(0, 0, 'base1-4'),
          card(0, 2, 'sv03.5-168'),
          jumbo(1, 0, JUMBO.charizard),
          card(1, 2, 'sv03.5-199'),
          // (0,1),(2,2) empty.
        ],
        { title: 'fire kin', backgroundColor: GALLERY_DARK },
      ),
      // The chase — a single jumbo hero, nothing else. Pure focal point.
      page([jumbo(0, 0, JUMBO.charizard)], { title: 'the chase', backgroundColor: NIGHT_DARK }),
      // Curtain call — jumbo hero centred on a 4×4 mat, a quiet 1×1 in each far corner.
      page(
        [
          card(0, 0, 'base1-4'),
          card(0, 3, 'sv03.5-006'),
          jumbo(1, 1, JUMBO.charizard),
          card(3, 0, 'sv03.5-168'),
          card(3, 3, 'sv03.5-199'),
          // wide margins all around the centred hero.
        ],
        { title: 'curtain call', rows: 4, cols: 4, backgroundColor: NIGHT_DARK },
      ),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Full-art gallery — the flagship jumbo + V-UNION showcase. Each page is
  //    anchored by a REAL big card (a jumbo or a V-UNION 2×2), framed by 1×1s.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'example-full-art-gallery',
    title: 'The full-art gallery',
    description: 'A wing of real big cards — jumbos and V-UNIONs, each framed by 1×1s and the mat.',
    layoutStyle: 'full_page_spread',
    isExample: true,
    coverCardId: 'swsh7-215',
    pages: [
      // Umbreon — jumbo hero top-left, three 1×1 Evolving-Skies accents down the right.
      page(
        [
          jumbo(0, 0, JUMBO.umbreon),
          card(0, 2, 'swsh7-215'),
          card(1, 2, 'swsh7-184'),
          card(2, 2, 'swsh7-179'),
          // (2,0),(2,1) empty.
        ],
        { title: 'Umbreon VMAX', backgroundColor: GALLERY_DARK },
      ),
      // Mewtwo V-UNION — the four real pieces tile a 2×2 (top-left); 1×1 accents right.
      page(
        [
          ...vunion(0, 0, VUNION.mewtwo),
          card(0, 2, 'sv03.5-150'),
          card(1, 2, 'sv03.5-200'),
          // (2,*) empty under the union.
        ],
        { title: 'Mewtwo V-UNION', backgroundColor: '#1A1722' },
      ),
      // Lugia — jumbo hero top-right, a single 1×1 accent. Lots of breathing room.
      page(
        [
          jumbo(0, 1, JUMBO.lugia),
          card(2, 0, 'cel25-22'),
          // (1,0),(2,1),(2,2) empty.
        ],
        { title: 'Lugia', backgroundColor: '#1A2230' },
      ),
      // Greninja V-UNION — 2×2 union bottom-left on a 4×3 mat, 1×1 accents up top.
      page(
        [
          card(0, 0, 'swsh7-125'),
          card(0, 2, 'swsh7-167'),
          ...vunion(2, 0, VUNION.greninja),
          card(2, 2, 'swsh7-172'),
          // row 1 and (3,2) empty.
        ],
        { title: 'Greninja V-UNION', rows: 4, cols: 3, backgroundColor: '#10202B' },
      ),
      // Blastoise — jumbo hero top-left, two 1×1 Base-Set accents down the right.
      page(
        [
          jumbo(0, 0, JUMBO.blastoise),
          card(0, 2, 'base1-2'),
          card(1, 2, 'base1-3'),
          // bottom row empty.
        ],
        { title: 'Blastoise', backgroundColor: '#10202B' },
      ),
      // Pikachu V-UNION — 2×2 union centred on a 4×4 mat, a 1×1 in each far corner.
      page(
        [
          card(0, 0, 'cel25-5'),
          card(0, 3, 'cel25-1'),
          ...vunion(1, 1, VUNION.pikachu),
          card(3, 0, 'cel25-2'),
          card(3, 3, 'cel25-10'),
        ],
        { title: 'Pikachu V-UNION', rows: 4, cols: 4, backgroundColor: '#1F1623' },
      ),
      // The close — a single jumbo Mewtwo on near-black. Pure curtain.
      page([jumbo(0, 0, JUMBO.mewtwo)], { title: 'closing wall', backgroundColor: NIGHT_DARK }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Anchor showcase — a "real sizes" study: jumbo (2×2), V-UNION (2×2 of four
  //    pieces), 1×1 standard anchors, and tonal `insert` spans for composition.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'example-anchor-spans',
    title: 'Anchors · real sizes',
    description: 'A study in real footprints — jumbo heroes, a V-UNION block, 1×1 anchors, tonal spans.',
    layoutStyle: 'anchor',
    isExample: true,
    coverCardId: 'cel25-22',
    pages: [
      // Jumbo anchor — a real 2×2 jumbo top-left, a 1×1 anchor and a tonal accent right.
      page(
        [
          jumbo(0, 0, JUMBO.lugia),
          card(0, 2, 'cel25-22'),
          insert(1, 2, '#22303F'),
          card(2, 2, 'cel25-2'),
        ],
        { title: 'jumbo · anchor', backgroundColor: '#1A2230' },
      ),
      // V-UNION study — the four Zacian pieces tile a 2×2 (top-left); a tonal column right.
      page(
        [
          ...vunion(0, 0, VUNION.zacian),
          insert(0, 2, '#1C2A24', { rowSpan: 2, colSpan: 1 }),
          card(2, 1, 'swsh7-177'),
          // (2,0),(2,2) empty.
        ],
        { title: 'V-UNION · 2×2', backgroundColor: GALLERY_DARK },
      ),
      // 1×1 anchor — a lone standard hero, framed by a tonal half-page span and two 1×1s.
      page(
        [
          insert(0, 0, '#241319', { rowSpan: 3, colSpan: 1 }),
          card(1, 1, 'sv03.5-199'),
          card(0, 2, 'sv03.5-006'),
          card(2, 2, 'sv03.5-168'),
          // negative space around the single 1×1 hero.
        ],
        { title: '1×1 · standard anchor', backgroundColor: EMBER_DARK },
      ),
      // Tonal banner — a wide insert across the top row, 1×1 accents stair-stepping down.
      page(
        [
          insert(0, 0, '#10202B', { rowSpan: 1, colSpan: 3 }),
          card(1, 0, 'cel25-1'),
          card(2, 1, 'cel25-2'),
          card(3, 2, 'cel25-10'),
        ],
        { title: 'tonal · banner', rows: 4, backgroundColor: '#10202B' },
      ),
      // Jumbo + 1×1s — a real jumbo top-right on a 3×4 mat, a column of 1×1 accents left.
      page(
        [
          card(0, 0, 'swsh7-179'),
          card(1, 0, 'swsh7-184'),
          card(2, 0, 'swsh7-125'),
          jumbo(0, 2, JUMBO.umbreon),
          card(2, 2, 'swsh7-169'),
          // (2,1),(2,3) empty.
        ],
        { title: 'jumbo + 1×1', rows: 3, cols: 4, backgroundColor: GALLERY_DARK },
      ),
      // Diptych — twin jumbos on a 2×4 page, two real big cards side by side.
      page(
        [jumbo(0, 0, JUMBO.lugia), jumbo(0, 2, JUMBO.umbreon)],
        { title: 'diptych', rows: 2, cols: 4, backgroundColor: NIGHT_DARK },
      ),
    ],
  },
];

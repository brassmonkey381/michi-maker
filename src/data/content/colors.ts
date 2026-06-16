/**
 * Content module: Color-theme study binders.
 *
 * Three palette-driven michi studies. Each leans on tonal `insert` slots (negative-space
 * fillers in the page's palette) plus intentional empty pockets to tie a page together, with
 * a single 2×2 `artwork` hero anchoring the binder. The palette should read unmistakably on
 * every page: cards sharing a hue + matching `insert` tones + a tuned mat `backgroundColor`.
 *
 * All card ids referenced here already exist in the base catalogue (see src/data/sampleData.ts);
 * a couple of palette-matched extras are declared below via `defineCard`.
 */

import {
  artwork,
  card,
  defineCard,
  insert,
  page,
  type ContentModule,
} from '@/data/content/_helpers';

// A palette-matched extra not in the base catalogue. (Existing ids are reused freely.)
export const cards: ContentModule['cards'] = [
  defineCard({
    id: 'cel25-13',
    name: 'M Rayquaza EX',
    pokemon: 'Rayquaza',
    setName: 'Celebrations',
    illustrator: 'PLANETA',
    imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/13/high.webp',
    dominantColor: '#3FA86B',
  }),
];

// --- palette tokens --------------------------------------------------------

// Fire & sunset
const EMBER = '#E8743B';
const FLAME = '#F0913B';
const CRIMSON = '#C0392B';
const ASH_MAT = '#1B1410';
const BLUSH_MAT = '#FBE7DD';

// Forest greens
const LEAF = '#5BA86B';
const FERN = '#6BB36B';
const LIME = '#8BC34A';
const PINE_MAT = '#10180F';
const SAGE_MAT = '#EAF1E6';

// Gold & legend
const GOLD = '#E8C24A';
const AMBER = '#D4A93B';
const IVORY = '#F3E7C0';
const NIGHT_MAT = '#14110A';
const PARCH_MAT = '#FBF4D6';

export const binders: ContentModule['binders'] = [
  // ────────────────────────────────────────────────────────────────────────
  // 1. Fire & sunset
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'example-fire-sunset',
    title: 'Fire & sunset',
    description:
      'Embers, flame and crimson — a warm study that burns from a single Charizard hero out to dusk.',
    layoutStyle: 'color_theme',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // P1 — 3×3, the hero. A 2×2 Charizard anchors the top-left, embers trail beside it.
      page(
        [
          artwork(0, 0, 'base1-4', { rowSpan: 2, colSpan: 2 }),
          insert(0, 2, EMBER),
          card(1, 2, 'base1-12'),
          insert(2, 0, CRIMSON),
          card(2, 1, 'base1-14'),
          // (2,2) intentionally empty — let the ember breathe
        ],
        { title: 'Ignition', rows: 3, cols: 3, backgroundColor: ASH_MAT },
      ),
      // P2 — 3×4, the Charmander line on a warm mat, framed by flame inserts.
      page(
        [
          insert(0, 0, FLAME),
          card(0, 1, 'sv03.5-004'),
          card(0, 2, 'sv03.5-005'),
          insert(0, 3, FLAME),
          card(1, 1, 'sv03.5-168'),
          card(1, 2, 'sv03.5-006'),
          // (1,0) & (1,3) empty
          insert(2, 0, EMBER),
          card(2, 1, 'sv03.5-199'),
          // (2,2) empty
          insert(2, 3, EMBER),
        ],
        { title: 'The Charmander line', rows: 3, cols: 4, backgroundColor: BLUSH_MAT },
      ),
      // P3 — 4×3, a vertical crimson stripe down the middle column.
      page(
        [
          card(0, 0, 'base1-14'),
          insert(0, 1, CRIMSON),
          card(0, 2, 'cel25-17'),
          // row 1 left/right empty
          insert(1, 1, EMBER),
          insert(2, 1, FLAME),
          card(3, 0, 'cel25-19'),
          insert(3, 1, CRIMSON),
          card(3, 2, 'swsh7-169'),
        ],
        { title: 'Crimson spine', rows: 4, cols: 3, backgroundColor: ASH_MAT },
      ),
      // P4 — 3×3, Ho-Oh hero spanning the centre 2×2, dawn light around it.
      page(
        [
          card(0, 0, 'base1-4'),
          insert(0, 1, FLAME),
          card(0, 2, 'sv03.5-006'),
          insert(1, 0, EMBER),
          // (1,1)..(2,2) is the hero block
          artwork(1, 1, 'cel25-1', { rowSpan: 2, colSpan: 2 }),
          card(2, 0, 'swsh7-169'),
        ],
        { title: 'Rainbow wing', rows: 3, cols: 3, backgroundColor: ASH_MAT },
      ),
      // P5 — 4×4, full sunset spread — a gradient of tones with chosen empties.
      page(
        [
          card(0, 0, 'base1-12'),
          insert(0, 1, FLAME),
          insert(0, 2, EMBER),
          card(0, 3, 'base1-14'),
          insert(1, 0, FLAME),
          card(1, 1, 'sv03.5-005'),
          card(1, 2, 'sv03.5-006'),
          insert(1, 3, EMBER),
          insert(2, 0, EMBER),
          card(2, 1, 'cel25-17'),
          card(2, 2, 'cel25-19'),
          insert(2, 3, CRIMSON),
          card(3, 0, 'swsh7-169'),
          insert(3, 1, CRIMSON),
          insert(3, 2, CRIMSON),
          card(3, 3, 'cel25-1'),
        ],
        { title: 'Last light', rows: 4, cols: 4, backgroundColor: ASH_MAT },
      ),
      // P6 — 3×4, a calm coda: one card centred, crimson framing it.
      page(
        [
          insert(0, 1, CRIMSON),
          insert(0, 2, CRIMSON),
          insert(1, 0, EMBER),
          card(1, 1, 'sv03.5-199'),
          // (1,2) empty — focal breathing room
          insert(1, 3, EMBER),
          insert(2, 1, FLAME),
          insert(2, 2, FLAME),
        ],
        { title: 'Embers', rows: 3, cols: 4, backgroundColor: ASH_MAT },
      ),
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 2. Forest greens
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'example-forest-greens',
    title: 'Forest greens',
    description:
      'Leaf, fern and lime — the Bulbasaur line and grass legends woven through a canopy of green inserts.',
    layoutStyle: 'color_theme',
    isExample: true,
    coverCardId: 'base1-15',
    pages: [
      // P1 — 3×3, Venusaur hero 2×2 in the canopy.
      page(
        [
          insert(0, 0, LIME),
          card(0, 1, 'sv03.5-166'),
          // (0,2) empty
          card(1, 0, 'sv03.5-001'),
          artwork(1, 1, 'base1-15', { rowSpan: 2, colSpan: 2 }),
          insert(2, 0, LEAF),
        ],
        { title: 'Canopy', rows: 3, cols: 3, backgroundColor: PINE_MAT },
      ),
      // P2 — 3×4, the Bulbasaur evolution line on sage, lime accents at the corners.
      page(
        [
          insert(0, 0, LIME),
          card(0, 1, 'sv03.5-001'),
          card(0, 2, 'sv03.5-002'),
          insert(0, 3, LIME),
          // (1,0) empty
          card(1, 1, 'sv03.5-003'),
          card(1, 2, 'sv03.5-198'),
          // (1,3) empty
          insert(2, 0, FERN),
          card(2, 1, 'sv03.5-166'),
          // (2,2) empty
          insert(2, 3, FERN),
        ],
        { title: 'The Bulbasaur line', rows: 3, cols: 4, backgroundColor: SAGE_MAT },
      ),
      // P3 — 4×3, a green ladder climbing the centre.
      page(
        [
          card(0, 0, 'base1-15'),
          insert(0, 1, LEAF),
          card(0, 2, 'swsh7-167'),
          insert(1, 1, FERN),
          card(2, 0, 'sv03.5-198'),
          insert(2, 1, LIME),
          card(2, 2, 'sv03.5-003'),
          insert(3, 1, LEAF),
        ],
        { title: 'Undergrowth', rows: 4, cols: 3, backgroundColor: PINE_MAT },
      ),
      // P4 — 3×3, Rayquaza hero spanning the top 2×2 (emerald legend).
      page(
        [
          artwork(0, 0, 'cel25-13', { rowSpan: 2, colSpan: 2 }),
          insert(0, 2, LIME),
          card(1, 2, 'cel25-12'),
          card(2, 0, 'swsh7-167'),
          insert(2, 1, FERN),
          // (2,2) empty
        ],
        { title: 'Sky serpent', rows: 3, cols: 3, backgroundColor: PINE_MAT },
      ),
      // P5 — 4×4, the deep-forest spread — tonal inserts threading the cards.
      page(
        [
          card(0, 0, 'sv03.5-001'),
          insert(0, 1, LEAF),
          insert(0, 2, FERN),
          card(0, 3, 'sv03.5-166'),
          insert(1, 0, LIME),
          card(1, 1, 'sv03.5-002'),
          card(1, 2, 'sv03.5-003'),
          insert(1, 3, LIME),
          insert(2, 0, FERN),
          card(2, 1, 'base1-15'),
          card(2, 2, 'swsh7-167'),
          insert(2, 3, FERN),
          card(3, 0, 'sv03.5-198'),
          insert(3, 1, LEAF),
          insert(3, 2, LEAF),
          card(3, 3, 'cel25-12'),
        ],
        { title: 'Deep forest', rows: 4, cols: 4, backgroundColor: PINE_MAT },
      ),
      // P6 — 3×4, a quiet clearing: one focal card, lime breathing room.
      page(
        [
          insert(0, 1, LIME),
          insert(0, 2, LIME),
          insert(1, 0, FERN),
          card(1, 1, 'sv03.5-003'),
          // (1,2) empty — clearing
          insert(1, 3, FERN),
          insert(2, 1, LEAF),
          insert(2, 2, LEAF),
        ],
        { title: 'Clearing', rows: 3, cols: 4, backgroundColor: PINE_MAT },
      ),
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 3. Gold & legend
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'example-gold-legend',
    title: 'Gold & legend',
    description:
      'Gilded amber and ivory — Pikachu and the great legends set against a treasury of warm-gold inserts.',
    layoutStyle: 'color_theme',
    isExample: true,
    coverCardId: 'cel25-22',
    pages: [
      // P1 — 3×3, Lugia hero 2×2, gilded accents above.
      page(
        [
          // (0,0)/(0,1)/(1,0)/(1,1) is the hero
          artwork(0, 0, 'cel25-22', { rowSpan: 2, colSpan: 2 }),
          insert(0, 2, GOLD),
          card(1, 2, 'cel25-5'),
          insert(2, 0, AMBER),
          card(2, 1, 'base1-58'),
          // (2,2) empty
        ],
        { title: 'Silver wing, gold light', rows: 3, cols: 3, backgroundColor: NIGHT_MAT },
      ),
      // P2 — 3×4, Pikachu across eras on parchment, framed in gold.
      page(
        [
          insert(0, 0, GOLD),
          card(0, 1, 'base1-58'),
          card(0, 2, 'sv03.5-173'),
          insert(0, 3, GOLD),
          // (1,0) empty
          card(1, 1, 'sv03.5-025'),
          card(1, 2, 'cel25-5'),
          // (1,3) empty
          insert(2, 0, AMBER),
          card(2, 1, 'cel25-6'),
          // (2,2) empty
          insert(2, 3, AMBER),
        ],
        { title: 'Pikachu, gilded', rows: 3, cols: 4, backgroundColor: PARCH_MAT },
      ),
      // P3 — 4×3, a column of legends with an amber spine.
      page(
        [
          card(0, 0, 'cel25-22'),
          insert(0, 1, AMBER),
          card(0, 2, 'cel25-1'),
          insert(1, 1, GOLD),
          insert(2, 1, IVORY),
          card(3, 0, 'cel25-2'),
          insert(3, 1, AMBER),
          card(3, 2, 'base1-16'),
        ],
        { title: 'Treasury', rows: 4, cols: 3, backgroundColor: NIGHT_MAT },
      ),
      // P4 — 3×3, Ho-Oh hero spanning the centre 2×2.
      page(
        [
          card(0, 0, 'cel25-5'),
          insert(0, 1, GOLD),
          // (0,2) empty
          insert(1, 0, AMBER),
          artwork(1, 1, 'cel25-1', { rowSpan: 2, colSpan: 2 }),
          card(2, 0, 'base1-16'),
        ],
        { title: 'Phoenix gold', rows: 3, cols: 3, backgroundColor: NIGHT_MAT },
      ),
      // P5 — 4×4, the full treasury spread — gold woven through the legends.
      page(
        [
          card(0, 0, 'cel25-22'),
          insert(0, 1, GOLD),
          insert(0, 2, AMBER),
          card(0, 3, 'cel25-1'),
          insert(1, 0, AMBER),
          card(1, 1, 'cel25-5'),
          card(1, 2, 'base1-58'),
          insert(1, 3, GOLD),
          insert(2, 0, GOLD),
          card(2, 1, 'cel25-2'),
          card(2, 2, 'cel25-11'),
          insert(2, 3, AMBER),
          card(3, 0, 'base1-16'),
          insert(3, 1, IVORY),
          insert(3, 2, IVORY),
          card(3, 3, 'sv03.5-173'),
        ],
        { title: 'Hall of legends', rows: 4, cols: 4, backgroundColor: NIGHT_MAT },
      ),
      // P6 — 3×4, the coda: a single gilded focal card.
      page(
        [
          insert(0, 1, GOLD),
          insert(0, 2, GOLD),
          insert(1, 0, AMBER),
          card(1, 1, 'cel25-22'),
          // (1,2) empty — the keepsake breathes
          insert(1, 3, AMBER),
          insert(2, 1, IVORY),
          insert(2, 2, IVORY),
        ],
        { title: 'Keepsake', rows: 3, cols: 4, backgroundColor: NIGHT_MAT },
      ),
    ],
  },
];

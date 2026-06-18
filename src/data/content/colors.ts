/**
 * Content module: Color-theme study binders.
 *
 * Three palette-driven michi studies. Each composition is built for *card-size realism*:
 * every standard card fills exactly one pocket (1×1). Oversized footprints are reserved for
 * the two real-world cases the catalogue models — a `jumbo` (2×2 oversized card) and a
 * `vunion` (four real pieces tiling a 2×2) — and are used only where the palette matches.
 * Pages lean on tonal `insert` slots (negative-space fillers, which MAY span) plus intentional
 * empty pockets so the palette reads unmistakably on every page: cards sharing a hue + matching
 * `insert` tones + a tuned mat `backgroundColor`.
 *
 * All card ids referenced here already exist in the base catalogue (see src/data/sampleData.ts);
 * a couple of palette-matched extras are declared below via `defineCard`.
 */

import {
  JUMBO,
  VUNION,
  artPanel,
  card,
  defineCard,
  insert,
  jumbo,
  page,
  pokemonArt,
  sliceRegion,
  vunion,
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
  // 1. Fire & sunset  — reds/oranges; a Charizard JUMBO is the only oversized card.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'example-fire-sunset',
    title: 'Fire & sunset',
    description:
      'Embers, flame and crimson — a warm study that burns from a Charizard jumbo out to dusk.',
    layoutStyle: 'color_theme',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // P1 — 3×3, the hero. A real oversized Charizard jumbo fills the top-left 2×2,
      // embers and two framed cards trailing down the right edge.
      page(
        [
          jumbo(0, 0, JUMBO.charizard),
          insert(0, 2, EMBER),
          card(1, 2, 'base1-12'),
          insert(2, 0, CRIMSON),
          card(2, 1, 'base1-14'),
          // (2,2) intentionally empty — let the ember breathe
        ],
        { title: 'Ignition', rows: 3, cols: 3, backgroundColor: ASH_MAT },
      ),
      // P2 — render page: a Charizard pocket-puzzle with a Moltres column fills the top 2×3,
      // with a row of flame cards beneath it.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, pokemonArt(6)),
          artPanel(0, 2, pokemonArt(146), { rowSpan: 2, colSpan: 1 }),
          card(2, 0, 'base1-4'),
          card(2, 1, 'base1-12'),
          card(2, 2, 'sv03.5-199'),
        ],
        { title: 'Fire incarnate', rows: 3, cols: 3, backgroundColor: ASH_MAT },
      ),
      // P3 — 3×4, the Charmander line on a warm mat, framed by flame inserts.
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
      // P3 — 4×3, a vertical crimson stripe down the middle column, framed cards either side.
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
      // P4 — 3×3, the Ho-Oh "rainbow wing" — framed 1×1 cards with flame radiating out.
      // No oversized card here: every pocket is a 1×1 card or a tonal insert.
      page(
        [
          card(0, 0, 'base1-4'),
          insert(0, 1, FLAME),
          card(0, 2, 'sv03.5-006'),
          insert(1, 0, EMBER),
          card(1, 1, 'cel25-1'),
          insert(1, 2, EMBER),
          card(2, 0, 'swsh7-169'),
          insert(2, 1, CRIMSON),
          card(2, 2, 'base1-12'),
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
  // 2. Forest greens — no green jumbo or V-UNION exists, so this binder is
  //    entirely 1×1 standard cards, green tonal inserts, and negative space.
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
      // P1 — 3×3, Venusaur framed at the heart of the canopy, lime and leaf around it.
      page(
        [
          insert(0, 0, LIME),
          card(0, 1, 'sv03.5-166'),
          // (0,2) empty
          card(1, 0, 'sv03.5-001'),
          card(1, 1, 'base1-15'),
          insert(1, 2, LEAF),
          insert(2, 0, LEAF),
          card(2, 1, 'sv03.5-002'),
          // (2,2) empty
        ],
        { title: 'Canopy', rows: 3, cols: 3, backgroundColor: PINE_MAT },
      ),
      // render page: a Venusaur pocket-puzzle with a Sceptile column over a row of greens.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, pokemonArt(3)),
          artPanel(0, 2, pokemonArt(254), { rowSpan: 2, colSpan: 1 }),
          card(2, 0, 'sv03.5-001'),
          card(2, 1, 'base1-15'),
          card(2, 2, 'swsh7-167'),
        ],
        { title: 'The canopy kings', rows: 3, cols: 3, backgroundColor: PINE_MAT },
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
      // P4 — 3×3, the emerald legends — M Rayquaza and Xerneas framed (1×1 each),
      // lime and fern threading between them. No oversized card: no green jumbo exists.
      page(
        [
          card(0, 0, 'cel25-13'),
          insert(0, 1, LIME),
          card(0, 2, 'cel25-12'),
          insert(1, 0, FERN),
          card(1, 1, 'swsh7-167'),
          insert(1, 2, FERN),
          card(2, 0, 'sv03.5-166'),
          insert(2, 1, LEAF),
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
  // 3. Gold & legend — gilded palette: Lugia & Mewtwo JUMBOs and a Zacian
  //    V-UNION (gold/teal) sit alongside framed 1×1 legends.
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
      // P1 — 3×3, a Lugia jumbo fills the top-left 2×2; gilded accents down the right.
      page(
        [
          jumbo(0, 0, JUMBO.lugia),
          insert(0, 2, GOLD),
          card(1, 2, 'cel25-5'),
          insert(2, 0, AMBER),
          card(2, 1, 'base1-58'),
          // (2,2) empty
        ],
        { title: 'Silver wing, gold light', rows: 3, cols: 3, backgroundColor: NIGHT_MAT },
      ),
      // render page: a Ho-Oh pocket-puzzle with a Lugia column over gilded legends.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, pokemonArt(250)),
          artPanel(0, 2, pokemonArt(249), { rowSpan: 2, colSpan: 1 }),
          card(2, 0, 'cel25-22'),
          card(2, 1, 'cel25-5'),
          card(2, 2, 'base1-58'),
        ],
        { title: 'The tower duo', rows: 3, cols: 3, backgroundColor: NIGHT_MAT },
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
      // P3 — 4×4, the Zacian V-UNION (gold/teal) tiles the top-left 2×2 as four real
      // pieces; framed legends and an amber spine fill the rest.
      page(
        [
          ...vunion(0, 0, VUNION.zacian),
          insert(0, 2, AMBER),
          card(0, 3, 'cel25-1'),
          insert(1, 2, GOLD),
          card(1, 3, 'cel25-22'),
          card(2, 0, 'cel25-2'),
          insert(2, 1, IVORY),
          card(2, 2, 'base1-16'),
          insert(2, 3, AMBER),
          insert(3, 0, AMBER),
          card(3, 1, 'cel25-11'),
          insert(3, 2, GOLD),
          card(3, 3, 'sv03.5-173'),
        ],
        { title: 'Treasury', rows: 4, cols: 4, backgroundColor: NIGHT_MAT },
      ),
      // P4 — 3×3, a Mewtwo jumbo anchors the centre-bottom 2×2; gilded cards above it.
      page(
        [
          card(0, 0, 'cel25-5'),
          insert(0, 1, GOLD),
          card(0, 2, 'base1-16'),
          insert(1, 0, AMBER),
          // (1,1)..(2,2) is the Mewtwo jumbo
          jumbo(1, 1, JUMBO.mewtwo),
          card(2, 0, 'cel25-1'),
        ],
        { title: 'Psychic gold', rows: 3, cols: 3, backgroundColor: NIGHT_MAT },
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

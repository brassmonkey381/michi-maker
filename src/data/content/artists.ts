/**
 * Content module: Artist spotlight binders.
 *
 * Each binder is a curated gallery of ONE illustrator — michi-styled, full-page artwork
 * heroes with a few framed accents and intentional negative space. Mats are chosen to
 * flatter the art: warm cream for Arita's painterly classics, gallery-dark for 5ban's
 * sleek digital work, and a soft botanical wash for Nishida's pastel illustrations.
 *
 * Helpers in ./_helpers (card / artwork / insert / defineCard / page). Card ids reference
 * the shared TCGdex catalogue in ../sampleData; a few illustrator-matched cards are added
 * here via defineCard.
 */

import {
  artwork,
  card,
  insert,
  page,
  type ContentModule,
} from '@/data/content/_helpers';

// --- Mats / palette --------------------------------------------------------
// Gallery-dark mats that let bright art glow, plus a warm cream for painterly work.
const GALLERY_DARK = '#14131A';
const GALLERY_WARM = '#1B1410';
const CREAM = '#F3ECDD';
const PARCHMENT = '#EBE0CB';
const SLATE = '#1A1E26';
const ROSE_MIST = '#F1E6EC';
const LEAF_MIST = '#E7EEDF';

// Every card referenced below already lives in the base TCGdex catalogue (../sampleData),
// so this module declares no extra cards.
export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = [
  // ===================================================================
  // 1. Mitsuhiro Arita — the painter of the classics (warm cream gallery)
  // ===================================================================
  {
    id: 'example-arita-spotlight',
    title: 'Arita — Painter of the Classics',
    description:
      "A gallery for Mitsuhiro Arita, whose brush gave the original sets their soul. Warm cream mats let the painterly Base Set heroes breathe.",
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // Cover plate: full-bleed Charizard hero with a sliver of cream beside it.
      page(
        [
          artwork(0, 0, 'base1-4', { rowSpan: 3, colSpan: 2 }),
          insert(0, 2, CREAM),
          card(1, 2, 'base1-58'),
          insert(2, 2, CREAM),
        ],
        { title: 'Plate I — Charizard', rows: 3, cols: 3, backgroundColor: GALLERY_WARM },
      ),
      // Full-page Venusaur spread — the art is the whole page.
      page([artwork(0, 0, 'base1-15', { rowSpan: 3, colSpan: 3 })], {
        title: 'Plate II — Venusaur',
        rows: 3,
        cols: 3,
        backgroundColor: GALLERY_WARM,
      }),
      // Diptych: two 2×2 painterly heroes facing each other across cream.
      page(
        [
          artwork(0, 0, 'base1-6', { rowSpan: 2, colSpan: 2 }),
          artwork(2, 2, 'base1-4', { rowSpan: 2, colSpan: 2 }),
          insert(0, 3, CREAM),
          insert(3, 0, CREAM),
        ],
        { title: 'Plate III — Water & Fire', rows: 4, cols: 4, backgroundColor: CREAM },
      ),
      // The mascot, centred and framed, floated on parchment with deep margins.
      page(
        [
          insert(0, 0, PARCHMENT),
          card(1, 1, 'base1-58'),
          insert(2, 2, PARCHMENT),
        ],
        { title: 'Plate IV — Pikachu, framed', rows: 3, cols: 3, backgroundColor: CREAM },
      ),
      // The starters return — Arita's modern 151 reprints, two big heroes.
      page(
        [
          artwork(0, 0, 'sv03.5-200', { rowSpan: 3, colSpan: 2 }),
          card(0, 2, 'sv03.5-170'),
          insert(1, 2, CREAM),
          artwork(2, 2, 'sv03.5-170'),
        ],
        { title: 'Plate V — Kanto, revisited', rows: 3, cols: 3, backgroundColor: GALLERY_WARM },
      ),
      // Anniversary Pikachu — a single full-bleed celebration.
      page([artwork(0, 0, 'cel25-5', { rowSpan: 3, colSpan: 3 })], {
        title: 'Plate VI — 25 Years',
        rows: 3,
        cols: 3,
        backgroundColor: GALLERY_WARM,
      }),
      // Closing wall: a salon hang of his catalogue, framed small with air between.
      page(
        [
          card(0, 0, 'base1-4'),
          card(0, 2, 'base1-6'),
          card(0, 4, 'base1-15'),
          insert(1, 1, CREAM),
          insert(1, 3, CREAM),
          card(2, 0, 'base1-58'),
          card(2, 2, 'sv03.5-170'),
          card(2, 4, 'sv03.5-200'),
        ],
        { title: 'Plate VII — The Arita Wall', rows: 3, cols: 5, backgroundColor: CREAM },
      ),
    ],
  },

  // ===================================================================
  // 2. 5ban Graphics — chromatic digital craft (gallery-dark)
  // ===================================================================
  {
    id: 'example-5ban-spotlight',
    title: '5ban Graphics — Chromatic Craft',
    description:
      'A dark gallery for 5ban Graphics — the studio behind the holographic eeveelution V cards and Sinnoh legendaries. Black mats make the foil-rendered art glow.',
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'swsh7-179',
    pages: [
      // Title wall: a 2×2 Espeon hero, an accent V, and one tonal insert.
      page(
        [
          artwork(0, 0, 'swsh7-179', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'swsh7-172'),
          insert(1, 2, GALLERY_DARK),
        ],
        { title: 'Hall I — Espeon V', rows: 3, cols: 3, backgroundColor: GALLERY_DARK },
      ),
      // The eeveelution V wall — 5ban's four full-bleed V heroes, symmetric on black.
      page(
        [
          artwork(0, 0, 'swsh7-172'),
          insert(0, 1, GALLERY_DARK),
          artwork(0, 2, 'swsh7-177'),
          artwork(1, 0, 'swsh7-169'),
          insert(1, 1, GALLERY_DARK),
          artwork(1, 2, 'swsh7-179'),
        ],
        { title: 'Hall II — The Eeveelution V Wall', rows: 2, cols: 3, backgroundColor: GALLERY_DARK },
      ),
      // Vaporeon, full-page — a single immersive spread.
      page([artwork(0, 0, 'swsh7-172', { rowSpan: 3, colSpan: 3 })], {
        title: 'Hall III — Vaporeon V',
        rows: 3,
        cols: 3,
        backgroundColor: GALLERY_DARK,
      }),
      // Sinnoh dragons: Palkia & Dialga as facing 2×2 heroes on slate.
      page(
        [
          artwork(0, 0, 'cel25-4', { rowSpan: 2, colSpan: 2 }),
          artwork(2, 2, 'cel25-20', { rowSpan: 2, colSpan: 2 }),
          insert(0, 3, SLATE),
          insert(3, 0, SLATE),
        ],
        { title: 'Hall IV — Palkia & Dialga', rows: 4, cols: 4, backgroundColor: SLATE },
      ),
      // Venusaur ex — a wide hero with a column of framed eeveelution V accents.
      page(
        [
          artwork(0, 0, 'sv03.5-003', { rowSpan: 3, colSpan: 2 }),
          card(0, 2, 'swsh7-169'),
          card(1, 2, 'swsh7-177'),
          card(2, 2, 'swsh7-172'),
        ],
        { title: 'Hall V — Venusaur ex', rows: 3, cols: 3, backgroundColor: GALLERY_DARK },
      ),
      // Closing salon: 5ban's catalogue hung small — four V's, Venusaur ex, two dragons.
      page(
        [
          card(0, 0, 'swsh7-172'),
          card(0, 1, 'swsh7-177'),
          card(0, 2, 'swsh7-169'),
          card(0, 3, 'swsh7-179'),
          card(1, 0, 'sv03.5-003'),
          card(1, 1, 'cel25-4'),
          insert(1, 2, GALLERY_DARK),
          card(1, 3, 'cel25-20'),
        ],
        { title: 'Hall VI — The Full Set', rows: 2, cols: 4, backgroundColor: GALLERY_DARK },
      ),
    ],
  },

  // ===================================================================
  // 3. Yuu Nishida — soft light & botanicals (pastel gallery)
  // ===================================================================
  {
    id: 'example-nishida-spotlight',
    title: 'Nishida — Soft Light',
    description:
      "A pastel gallery for Yuu Nishida, whose illustrations bathe Pokémon in gentle, naturalistic light. Botanical and rose mats keep the mood quiet.",
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'cel25-11',
    pages: [
      // Opening: Mew, full-bleed and dreamlike, with a rose sliver beside it.
      page(
        [
          artwork(0, 0, 'cel25-11', { rowSpan: 3, colSpan: 2 }),
          insert(0, 2, ROSE_MIST),
          card(1, 2, 'swsh7-184'),
          insert(2, 2, ROSE_MIST),
        ],
        { title: 'Room I — Mew', rows: 3, cols: 3, backgroundColor: ROSE_MIST },
      ),
      // Sylveon V — a single full-page spread, all softness.
      page([artwork(0, 0, 'swsh7-184', { rowSpan: 3, colSpan: 3 })], {
        title: 'Room II — Sylveon V',
        rows: 3,
        cols: 3,
        backgroundColor: ROSE_MIST,
      }),
      // The Kanto-grass diptych — Bulbasaur grows into Ivysaur, facing, on leaf-green.
      page(
        [
          artwork(0, 0, 'sv03.5-001', { rowSpan: 2, colSpan: 2 }),
          artwork(2, 2, 'sv03.5-002', { rowSpan: 2, colSpan: 2 }),
          insert(0, 3, LEAF_MIST),
          insert(3, 0, LEAF_MIST),
        ],
        { title: 'Room III — Bulbasaur & Ivysaur', rows: 4, cols: 4, backgroundColor: LEAF_MIST },
      ),
      // A framed Bulbasaur, centred on a wide botanical wall with deep margins.
      page(
        [
          insert(0, 0, LEAF_MIST),
          card(1, 1, 'sv03.5-001'),
          insert(2, 2, LEAF_MIST),
        ],
        { title: 'Room IV — Bulbasaur, framed', rows: 3, cols: 3, backgroundColor: LEAF_MIST },
      ),
      // Mew again, full-page — the gallery's quiet heart.
      page([artwork(0, 0, 'cel25-11', { rowSpan: 3, colSpan: 3 })], {
        title: 'Room V — Mew, alone',
        rows: 3,
        cols: 3,
        backgroundColor: ROSE_MIST,
      }),
      // Closing wall: Nishida's small cast hung with generous air.
      page(
        [
          card(0, 0, 'cel25-11'),
          insert(0, 1, ROSE_MIST),
          card(0, 2, 'swsh7-184'),
          insert(1, 0, ROSE_MIST),
          card(1, 1, 'sv03.5-001'),
          insert(1, 2, ROSE_MIST),
          card(2, 0, 'sv03.5-002'),
          insert(2, 1, ROSE_MIST),
          artwork(2, 2, 'swsh7-184'),
        ],
        { title: 'Room VI — The Soft Wall', rows: 3, cols: 3, backgroundColor: ROSE_MIST },
      ),
    ],
  },
];

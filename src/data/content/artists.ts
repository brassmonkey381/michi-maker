/**
 * Content module: Artist spotlight binders.
 *
 * Each binder is a curated gallery of ONE illustrator — michi-styled as a real
 * one-pocket salon hang: standard cards are framed at their true 1×1 footprint,
 * floated in generous negative space, with tonal `insert`s sized to real michi
 * insert formats (1×1, 1×2 / 2×1, 2×2, or a full-page 3×3 wash). One illustrator
 * may get a single oversized JUMBO hero when the jumbo art is genuinely theirs.
 *
 * Mats are chosen to flatter the art: warm gallery-dark for Arita's painterly
 * classics, a deeper gallery-black for 5ban's sleek digital work, and soft
 * botanical / rose washes for Nishida's pastel illustrations.
 *
 * Helpers in ./_helpers (card / jumbo / insert / page). Card ids reference the
 * shared TCGdex catalogue in ../sampleData; jumbo ids come from `JUMBO`.
 */

import {
  card,
  insert,
  jumbo,
  page,
  JUMBO,
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
  // 1. Mitsuhiro Arita — the painter of the classics (warm gallery)
  // ===================================================================
  {
    id: 'example-arita-spotlight',
    title: 'Arita — Painter of the Classics',
    description:
      "A gallery for Mitsuhiro Arita, whose brush gave the original sets their soul. Warm dark mats and wide margins let the painterly Base Set heroes breathe.",
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // Plate I — the JUMBO Charizard hero, an oversized 2×2 plate, with a single
      // 1×1 Gyarados accent and a tall tonal column of negative space.
      page(
        [
          jumbo(0, 0, JUMBO.charizard),
          insert(0, 2, GALLERY_WARM, { rowSpan: 3 }),
          card(2, 0, 'base1-6'),
        ],
        { title: 'Plate I — Charizard, jumbo', rows: 3, cols: 3, backgroundColor: GALLERY_WARM },
      ),
      // Plate II — Venusaur centred on a wide wall, framed at true size with deep
      // margins (full-page tonal washes above and below, single card floating).
      page(
        [
          insert(0, 0, GALLERY_WARM, { colSpan: 3 }),
          card(1, 1, 'base1-15'),
          insert(2, 0, GALLERY_WARM, { colSpan: 3 }),
        ],
        { title: 'Plate II — Venusaur, framed', rows: 3, cols: 3, backgroundColor: GALLERY_WARM },
      ),
      // Plate III — Water & Fire diptych: two framed 1×1 heroes facing across a
      // 3×2 band of cream.
      page(
        [
          card(1, 0, 'base1-6'),
          insert(0, 1, CREAM, { rowSpan: 3, colSpan: 2 }),
          card(1, 3, 'base1-4'),
        ],
        { title: 'Plate III — Water & Fire', rows: 3, cols: 4, backgroundColor: CREAM },
      ),
      // Plate IV — the mascot, centred and framed, floated on parchment with a
      // full 1×3 insert above and below for deep, even margins.
      page(
        [
          insert(0, 0, PARCHMENT, { colSpan: 3 }),
          card(1, 1, 'base1-58'),
          insert(2, 0, PARCHMENT, { colSpan: 3 }),
        ],
        { title: 'Plate IV — Pikachu, framed', rows: 3, cols: 3, backgroundColor: CREAM },
      ),
      // Plate V — Kanto, revisited: Arita's modern 151 reprints hung as a small
      // row of framed cards with tonal air between them.
      page(
        [
          card(1, 0, 'sv03.5-170'),
          insert(1, 1, GALLERY_WARM),
          card(1, 2, 'sv03.5-200'),
          insert(1, 3, GALLERY_WARM),
          card(1, 4, 'cel25-5'),
        ],
        { title: 'Plate V — Kanto, revisited', rows: 3, cols: 5, backgroundColor: GALLERY_WARM },
      ),
      // Plate VI — the Arita Wall: a salon hang of his catalogue, framed small
      // with generous negative space between each plate.
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
        { title: 'Plate VI — The Arita Wall', rows: 3, cols: 5, backgroundColor: CREAM },
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
      'A dark gallery for 5ban Graphics — the studio behind the holographic eeveelution V cards and Sinnoh legendaries. Black mats and wide margins make the foil-rendered art glow.',
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'swsh7-179',
    pages: [
      // Hall I — Espeon V, framed and centred on black with a full tonal wash
      // above and below for deep gallery margins.
      page(
        [
          insert(0, 0, GALLERY_DARK, { colSpan: 3 }),
          card(1, 1, 'swsh7-179'),
          insert(2, 0, GALLERY_DARK, { colSpan: 3 }),
        ],
        { title: 'Hall I — Espeon V', rows: 3, cols: 3, backgroundColor: GALLERY_DARK },
      ),
      // Hall II — the eeveelution V wall: 5ban's four framed V heroes hung in a
      // salon block, separated by a full 1×3 band of tonal air.
      page(
        [
          card(0, 0, 'swsh7-172'),
          insert(0, 1, GALLERY_DARK),
          card(0, 2, 'swsh7-177'),
          insert(1, 0, GALLERY_DARK, { colSpan: 3 }),
          card(2, 0, 'swsh7-169'),
          insert(2, 1, GALLERY_DARK),
          card(2, 2, 'swsh7-179'),
        ],
        { title: 'Hall II — The Eeveelution V Wall', rows: 3, cols: 3, backgroundColor: GALLERY_DARK },
      ),
      // Hall III — Vaporeon V, a single framed card centred and ringed by tonal
      // slate inserts, the gallery's quiet centre.
      page(
        [
          insert(0, 0, SLATE, { colSpan: 3 }),
          insert(1, 0, SLATE),
          card(1, 1, 'swsh7-172'),
          insert(1, 2, SLATE),
          insert(2, 0, SLATE, { colSpan: 3 }),
        ],
        { title: 'Hall III — Vaporeon V', rows: 3, cols: 3, backgroundColor: SLATE },
      ),
      // Hall IV — Sinnoh dragons: Palkia & Dialga framed and facing across a 3×2
      // band of slate.
      page(
        [
          card(1, 0, 'cel25-4'),
          insert(0, 1, SLATE, { rowSpan: 3, colSpan: 2 }),
          card(1, 3, 'cel25-20'),
        ],
        { title: 'Hall IV — Palkia & Dialga', rows: 3, cols: 4, backgroundColor: SLATE },
      ),
      // Hall V — Venusaur ex, framed, with a column of framed eeveelution V
      // accents down one side and a tall tonal column of air between.
      page(
        [
          card(0, 0, 'sv03.5-003'),
          insert(0, 1, GALLERY_DARK, { rowSpan: 3 }),
          card(0, 2, 'swsh7-169'),
          card(1, 2, 'swsh7-177'),
          card(2, 2, 'swsh7-172'),
        ],
        { title: 'Hall V — Venusaur ex', rows: 3, cols: 3, backgroundColor: GALLERY_DARK },
      ),
      // Hall VI — the full set: 5ban's catalogue hung small in a salon grid, four
      // V's, Venusaur ex's dragons and a Vaporeon, with tonal air between.
      page(
        [
          card(0, 0, 'swsh7-172'),
          card(0, 2, 'swsh7-177'),
          card(0, 4, 'swsh7-169'),
          insert(1, 1, GALLERY_DARK),
          insert(1, 3, GALLERY_DARK),
          card(2, 0, 'swsh7-179'),
          card(2, 2, 'cel25-4'),
          card(2, 4, 'cel25-20'),
        ],
        { title: 'Hall VI — The Full Set', rows: 3, cols: 5, backgroundColor: GALLERY_DARK },
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
      "A pastel gallery for Yuu Nishida, whose illustrations bathe Pokémon in gentle, naturalistic light. Botanical and rose mats with airy margins keep the mood quiet.",
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'cel25-11',
    pages: [
      // Room I — Mew, framed and centred on rose, with a full tonal wash above
      // and below for soft, deep margins.
      page(
        [
          insert(0, 0, ROSE_MIST, { colSpan: 3 }),
          card(1, 1, 'cel25-11'),
          insert(2, 0, ROSE_MIST, { colSpan: 3 }),
        ],
        { title: 'Room I — Mew', rows: 3, cols: 3, backgroundColor: ROSE_MIST },
      ),
      // Room II — Sylveon V, a single framed card centred and ringed by soft rose
      // inserts, all softness.
      page(
        [
          insert(0, 0, ROSE_MIST, { colSpan: 3 }),
          insert(1, 0, ROSE_MIST),
          card(1, 1, 'swsh7-184'),
          insert(1, 2, ROSE_MIST),
          insert(2, 0, ROSE_MIST, { colSpan: 3 }),
        ],
        { title: 'Room II — Sylveon V', rows: 3, cols: 3, backgroundColor: ROSE_MIST },
      ),
      // Room III — the Kanto-grass diptych: Bulbasaur grows into Ivysaur, two
      // framed cards facing across a 3×2 band of leaf-green.
      page(
        [
          card(1, 0, 'sv03.5-001'),
          insert(0, 1, LEAF_MIST, { rowSpan: 3, colSpan: 2 }),
          card(1, 3, 'sv03.5-002'),
        ],
        { title: 'Room III — Bulbasaur & Ivysaur', rows: 3, cols: 4, backgroundColor: LEAF_MIST },
      ),
      // Room IV — a framed Bulbasaur, centred on a wide botanical wall with a full
      // tonal wash above and below for deep margins.
      page(
        [
          insert(0, 0, LEAF_MIST, { colSpan: 3 }),
          card(1, 1, 'sv03.5-001'),
          insert(2, 0, LEAF_MIST, { colSpan: 3 }),
        ],
        { title: 'Room IV — Bulbasaur, framed', rows: 3, cols: 3, backgroundColor: LEAF_MIST },
      ),
      // Room V — Mew again, framed and centred, ringed by even rose inserts — the
      // gallery's quiet heart.
      page(
        [
          insert(0, 0, ROSE_MIST, { colSpan: 3 }),
          insert(1, 0, ROSE_MIST),
          card(1, 1, 'cel25-11'),
          insert(1, 2, ROSE_MIST),
          insert(2, 0, ROSE_MIST, { colSpan: 3 }),
        ],
        { title: 'Room V — Mew, alone', rows: 3, cols: 3, backgroundColor: ROSE_MIST },
      ),
      // Room VI — the Soft Wall: Nishida's small cast hung in a salon grid with
      // generous tonal air, separated by a full 1×3 band of rose.
      page(
        [
          card(0, 0, 'cel25-11'),
          insert(0, 1, ROSE_MIST),
          card(0, 2, 'swsh7-184'),
          insert(1, 0, ROSE_MIST, { colSpan: 3 }),
          card(2, 0, 'sv03.5-001'),
          insert(2, 1, ROSE_MIST),
          card(2, 2, 'sv03.5-002'),
        ],
        { title: 'Room VI — The Soft Wall', rows: 3, cols: 3, backgroundColor: ROSE_MIST },
      ),
    ],
  },
];

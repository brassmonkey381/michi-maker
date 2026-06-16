/**
 * Content module: Vintage / WOTC classics binders.
 *
 * Three multi-page michi binders celebrating the 1999 Base Set era. Built for
 * card-size realism per the michi method (woahpoke.com/michi-method):
 *   - Every standard Base Set holo sits in exactly ONE pocket (1×1) — no blown-up cards.
 *   - At most one oversized `jumbo` (2×2) hero anchors a binder, sparingly.
 *   - Tonal `insert` mats (which MAY span 1×1 / 1×2 / 2×1 / 2×2 / 3×3) carry the negative
 *     space, and pockets left out of `slots` stay empty — a vintage holo wall.
 *
 *   - 'example-base-set-chase' — dark ink mats, a single Charizard jumbo hero, holos framed.
 *   - 'example-1999-in-cream'  — cream vintage mats, a Ken Sugimori art study.
 *   - 'example-foil-wall'      — dense 1×1 grids of Base Set holos with tonal seams.
 *
 * Card art is real official TCG art from the TCGdex CDN. Every id referenced here lives in
 * the bundled catalogue (src/data/sampleData.ts) — including the JUMBO ids — except one
 * extra Base Set holo declared below.
 */

import {
  card,
  defineCard,
  insert,
  jumbo,
  page,
  JUMBO,
  type ContentModule,
} from '@/data/content/_helpers';

// A couple of extra Base Set holos not already in the base catalogue.
export const cards: ContentModule['cards'] = [
  defineCard({
    id: 'base1-7',
    name: 'Hitmonchan',
    pokemon: 'Hitmonchan',
    setName: 'Base Set',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/7/high.webp',
    dominantColor: '#C0703B',
  }),
];

// Vintage mat palette.
const INK = '#10141C'; // near-black, makes foils pop
const COFFEE = '#1B1410'; // warm dark brown
const SLATE = '#141A24'; // cool dark slate
const CREAM = '#F3ECDD'; // classic cream
const PARCHMENT = '#FBF4D6'; // warm pale parchment
const LINEN = '#EDE3CF'; // muted vintage linen

// Tonal inserts (kept low-saturation so the holos stay the focus).
const EMBER = '#3A2418';
const ASH = '#222A36';
const GOLD = '#C8A165';
const SAGE = '#C7CBB6';

export const binders: ContentModule['binders'] = [
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Base Set chase — dark mats, a single Charizard jumbo, holos with breathing room.
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'example-base-set-chase',
    title: 'Base Set chase',
    description:
      'The 1999 chase, on ink. A jumbo Charizard anchors the opener; the rest are 1×1 holos framed by negative space.',
    layoutStyle: 'anchor',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // p1 — the anchor: a 2×2 jumbo Charizard hero, two fire holos, the rest empty.
      page(
        [
          jumbo(0, 0, JUMBO.charizard),
          card(0, 2, 'base1-12'),
          card(1, 2, 'base1-14'),
          // bottom row: a single foil, off-centre, empty pockets either side
          card(2, 1, 'base1-16'),
        ],
        { title: 'The one everyone chased', rows: 3, cols: 3, backgroundColor: COFFEE },
      ),
      // p2 — the water/grass wing, a symmetrical quartet with an ash seam down the middle.
      page(
        [
          card(0, 0, 'base1-2'),
          insert(0, 1, ASH, { rowSpan: 3 }), // a 3×1 tonal seam
          card(0, 2, 'base1-15'),
          card(2, 0, 'base1-6'),
          card(2, 2, 'base1-13'),
        ],
        { title: 'Two wings', rows: 3, cols: 3, backgroundColor: SLATE },
      ),
      // p3 — the psychics, a centred diamond around an empty heart.
      page(
        [
          card(0, 1, 'base1-1'),
          card(1, 0, 'base1-10'),
          card(1, 2, 'base1-11'),
          card(2, 1, 'base1-9'),
        ],
        { title: 'Psychic core', rows: 3, cols: 3, backgroundColor: INK },
      ),
      // p4 — fighters across the bottom, a wide ember mat holding the upper space.
      page(
        [
          insert(0, 0, EMBER, { rowSpan: 2, colSpan: 3 }), // a 2×3 mat up top
          card(2, 0, 'base1-8'),
          card(2, 1, 'base1-7'),
          card(2, 2, 'base1-11'),
        ],
        { title: 'Negative space', rows: 3, cols: 3, backgroundColor: INK },
      ),
      // p5 — the lightning corner, asymmetric (3×4).
      page(
        [
          card(0, 0, 'base1-16'),
          card(0, 1, 'base1-14'),
          insert(0, 3, ASH, { rowSpan: 3 }), // tall accent seam on the right
          card(1, 0, 'cel25-5'),
          card(2, 0, 'base1-58'),
          card(2, 2, 'base1-9'),
        ],
        { title: 'Sparks', rows: 3, cols: 4, backgroundColor: SLATE },
      ),
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. 1999 in cream — vintage cream mats, a Ken Sugimori art study.
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'example-1999-in-cream',
    title: '1999, in cream',
    description:
      "A vintage study on cream paper — the quieter Base Set holos and Ken Sugimori's line, given room.",
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'base1-1',
    pages: [
      // p1 — the title plate: a single centred holo flanked by gold mats.
      page(
        [
          insert(0, 0, GOLD, { rowSpan: 3 }), // gold pillar, left
          card(1, 1, 'base1-1'),
          insert(0, 2, GOLD, { rowSpan: 3 }), // gold pillar, right
        ],
        { title: 'Frontispiece', rows: 3, cols: 3, backgroundColor: PARCHMENT },
      ),
      // p2 — the Sugimori line: four of his holos, hung like a gallery at the corners.
      page(
        [
          card(0, 0, 'base1-5'),
          card(0, 2, 'base1-3'),
          card(2, 0, 'base1-12'),
          card(2, 2, 'base1-11'),
        ],
        { title: "Sugimori's hand", rows: 3, cols: 3, backgroundColor: CREAM },
      ),
      // p3 — a grass plate: holos around a quiet 2×2 sage mat.
      page(
        [
          card(0, 0, 'base1-13'),
          card(0, 2, 'base1-15'),
          insert(1, 1, SAGE, { rowSpan: 2, colSpan: 2 }), // a 2×2 mat anchoring the lower-right
          card(2, 0, 'base1-9'),
        ],
        { title: 'Plate I — grass', rows: 3, cols: 3, backgroundColor: LINEN },
      ),
      // p4 — a calm 3×4 spread, a single foil per quarter over linen mats.
      page(
        [
          card(0, 0, 'base1-14'),
          insert(0, 1, LINEN, { rowSpan: 1, colSpan: 2 }), // 1×2 mat across the top middle
          card(0, 3, 'base1-2'),
          card(2, 0, 'base1-16'),
          insert(2, 1, LINEN, { rowSpan: 1, colSpan: 2 }), // 1×2 mat across the bottom middle
          card(2, 3, 'base1-6'),
        ],
        { title: 'Four corners', rows: 3, cols: 4, backgroundColor: CREAM },
      ),
      // p5 — the colophon: two holos low, the page otherwise bare gold.
      page(
        [
          card(0, 0, 'base1-3'),
          insert(0, 1, GOLD, { rowSpan: 3, colSpan: 2 }), // a 3×2 gold mat closing the study
          card(2, 0, 'base1-10'),
        ],
        { title: 'Colophon', rows: 3, cols: 3, backgroundColor: PARCHMENT },
      ),
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Foil wall — dense 1×1 grids of holos punctuated by tonal seams.
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'example-foil-wall',
    title: 'Foil wall',
    description:
      'The whole Base Set holo run as a wall of foil — packed 1×1 grids broken up by tonal seams and a single jumbo.',
    layoutStyle: 'full_page_spread',
    isExample: true,
    coverCardId: 'base1-6',
    pages: [
      // p1 — the wall: a full 4×4 grid of holos, edge to edge.
      page(
        [
          card(0, 0, 'base1-1'),
          card(0, 1, 'base1-2'),
          card(0, 2, 'base1-3'),
          card(0, 3, 'base1-4'),
          card(1, 0, 'base1-5'),
          card(1, 1, 'base1-6'),
          card(1, 2, 'base1-7'),
          card(1, 3, 'base1-8'),
          card(2, 0, 'base1-9'),
          card(2, 1, 'base1-10'),
          card(2, 2, 'base1-11'),
          card(2, 3, 'base1-12'),
          card(3, 0, 'base1-13'),
          card(3, 1, 'base1-14'),
          card(3, 2, 'base1-15'),
          card(3, 3, 'base1-16'),
        ],
        { title: 'Sixteen, packed', rows: 4, cols: 4, backgroundColor: INK },
      ),
      // p2 — the jumbo plate: a 2×2 Blastoise hero with a row of holo accents beneath.
      page(
        [
          jumbo(0, 0, JUMBO.blastoise),
          card(0, 2, 'base1-13'),
          card(1, 2, 'base1-15'),
          card(2, 0, 'base1-6'),
          card(2, 1, 'base1-2'),
          card(2, 2, 'base1-9'),
        ],
        { title: 'Hero — Blastoise', rows: 3, cols: 3, backgroundColor: SLATE },
      ),
      // p3 — a 4×4 wall with a 2×2 ash mat punched into the centre.
      page(
        [
          card(0, 0, 'base1-12'),
          card(0, 1, 'base1-14'),
          card(0, 2, 'base1-5'),
          card(0, 3, 'base1-1'),
          card(1, 0, 'base1-11'),
          insert(1, 1, ASH, { rowSpan: 2, colSpan: 2 }), // a 2×2 tonal void
          card(1, 3, 'base1-9'),
          card(2, 0, 'base1-8'),
          card(2, 3, 'base1-3'),
          card(3, 0, 'base1-7'),
          card(3, 1, 'base1-10'),
          card(3, 2, 'base1-13'),
          card(3, 3, 'cel25-5'),
        ],
        { title: 'Ash, centred', rows: 4, cols: 4, backgroundColor: COFFEE },
      ),
      // p4 — the Charizard plate: a tall ember mat with three fire holos beside it.
      page(
        [
          insert(0, 0, EMBER, { rowSpan: 3, colSpan: 2 }), // a 3×2 mat, left
          card(0, 2, 'base1-12'),
          card(1, 2, 'base1-14'),
          card(2, 2, 'base1-58'),
        ],
        { title: 'Ember plate', rows: 3, cols: 3, backgroundColor: INK },
      ),
      // p5 — a 3×4 sampler with a cool tonal seam down the third column.
      page(
        [
          card(0, 0, 'base1-15'),
          card(0, 1, 'base1-2'),
          insert(0, 2, ASH, { rowSpan: 3 }), // 3×1 cool seam
          card(0, 3, 'base1-10'),
          card(1, 0, 'base1-1'),
          card(1, 3, 'base1-11'),
          card(2, 0, 'base1-6'),
          card(2, 1, 'base1-13'),
          card(2, 3, 'base1-9'),
        ],
        { title: 'Cool seam', rows: 3, cols: 4, backgroundColor: SLATE },
      ),
      // p6 — closing spread: a wide ember mat over a row of quiet holos.
      page(
        [
          insert(0, 0, EMBER, { rowSpan: 2, colSpan: 3 }), // a 2×3 mat closing the wall
          card(2, 0, 'base1-15'),
          card(2, 1, 'base1-5'),
          card(2, 2, 'base1-4'),
        ],
        { title: 'Last page', rows: 3, cols: 3, backgroundColor: INK },
      ),
    ],
  },
];

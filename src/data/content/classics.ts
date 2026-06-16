/**
 * Content module: Vintage / WOTC classics binders.
 *
 * Three multi-page michi binders celebrating the 1999 Base Set era:
 *   - 'example-base-set-chase' — dark mat, Charizard 2×2 hero, holos framed by negative space.
 *   - 'example-1999-in-cream'  — cream vintage mats, a Ken Sugimori art study.
 *   - 'example-foil-wall'      — dense grids of Base Set holos with full-bleed heroes.
 *
 * Card art is real official TCG art from the TCGdex CDN. Most cards already live in the bundled
 * catalogue (src/data/sampleData.ts); a couple of extra Base Set holos are declared below.
 */

import {
  artwork,
  card,
  defineCard,
  insert,
  page,
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
  // 1. Base Set chase — dark mats, Charizard the anchor, holos with breathing room.
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'example-base-set-chase',
    title: 'Base Set chase',
    description:
      'The 1999 chase, on ink. Charizard anchors a 2×2 hero, the rest of the holos framed by negative space.',
    layoutStyle: 'anchor',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // p1 — the anchor: Charizard hero, two complementary fire holos, the rest empty.
      page(
        [
          artwork(0, 0, 'base1-4', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'base1-12'),
          card(1, 2, 'base1-14'),
          // bottom row: a single foil, off-centre, with empty pockets either side
          card(2, 1, 'base1-16'),
        ],
        { title: 'The one everyone chased', rows: 3, cols: 3, backgroundColor: COFFEE },
      ),
      // p2 — the water/grass wing, symmetrical pair with an ash seam down the middle.
      page(
        [
          card(0, 0, 'base1-2'),
          insert(0, 1, ASH),
          card(0, 2, 'base1-15'),
          insert(1, 1, ASH),
          card(2, 0, 'base1-6'),
          insert(2, 1, ASH),
          card(2, 2, 'base1-13'),
        ],
        { title: 'Two wings', rows: 3, cols: 3, backgroundColor: SLATE },
      ),
      // p3 — the psychics, a centred trio.
      page(
        [
          card(0, 1, 'base1-1'),
          card(1, 0, 'base1-10'),
          card(1, 2, 'base1-11'),
          card(2, 1, 'base1-9'),
        ],
        { title: 'Psychic core', rows: 3, cols: 3, backgroundColor: INK },
      ),
      // p4 — a full-bleed Mewtwo hero, two quiet accents.
      page(
        [
          artwork(0, 0, 'base1-10', { rowSpan: 2, colSpan: 3 }),
          card(2, 0, 'base1-8'),
          insert(2, 1, EMBER),
          card(2, 2, 'base1-7'),
        ],
        { title: 'Negative space', rows: 3, cols: 3, backgroundColor: INK },
      ),
      // p5 — the lightning corner, asymmetric (3×4).
      page(
        [
          card(0, 0, 'base1-16'),
          card(0, 1, 'base1-14'),
          insert(0, 3, ASH),
          card(1, 3, 'cel25-5'),
          artwork(2, 0, 'base1-58', { rowSpan: 1, colSpan: 2 }),
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
      // p1 — the title plate: a single centred holo on parchment.
      page(
        [
          insert(0, 0, GOLD),
          card(0, 1, 'base1-1'),
          insert(0, 2, GOLD),
          // middle and bottom mostly empty — a frontispiece
          insert(2, 1, LINEN),
        ],
        { title: 'Frontispiece', rows: 3, cols: 3, backgroundColor: PARCHMENT },
      ),
      // p2 — the Sugimori line: four of his holos, hung like a gallery.
      page(
        [
          card(0, 0, 'base1-5'),
          card(0, 2, 'base1-3'),
          card(2, 0, 'base1-12'),
          card(2, 2, 'base1-11'),
        ],
        { title: "Sugimori's hand", rows: 3, cols: 3, backgroundColor: CREAM },
      ),
      // p3 — a 2×2 hero (Venusaur) reading large against linen, with a small accent.
      page(
        [
          card(0, 0, 'base1-13'),
          artwork(0, 1, 'base1-15', { rowSpan: 2, colSpan: 2 }),
          card(2, 0, 'base1-9'),
          insert(2, 1, SAGE),
          card(2, 2, 'base1-10'),
        ],
        { title: 'Plate I — grass', rows: 3, cols: 3, backgroundColor: LINEN },
      ),
      // p4 — a calm 4-wide spread, a single foil per quarter.
      page(
        [
          card(0, 0, 'base1-14'),
          insert(0, 1, LINEN),
          insert(0, 2, LINEN),
          card(0, 3, 'base1-2'),
          card(2, 0, 'base1-16'),
          insert(2, 2, LINEN),
          card(2, 3, 'base1-6'),
        ],
        { title: 'Four corners', rows: 3, cols: 4, backgroundColor: CREAM },
      ),
      // p5 — the colophon: one hero full-bleed, the page otherwise bare.
      page(
        [
          artwork(0, 0, 'base1-3', { rowSpan: 2, colSpan: 2 }),
          insert(0, 2, GOLD),
          insert(2, 2, GOLD),
        ],
        { title: 'Colophon', rows: 3, cols: 3, backgroundColor: PARCHMENT },
      ),
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Foil wall — dense grids of holos punctuated by full-bleed heroes.
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: 'example-foil-wall',
    title: 'Foil wall',
    description:
      'The whole Base Set holo run as a wall of foil — packed 4×4 grids broken up by full-bleed heroes.',
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
      // p2 — Gyarados hero full-bleed (2×3), a row of accents beneath.
      page(
        [
          artwork(0, 0, 'base1-6', { rowSpan: 2, colSpan: 3 }),
          card(2, 0, 'base1-2'),
          card(2, 1, 'base1-13'),
          card(2, 2, 'base1-15'),
        ],
        { title: 'Hero — Gyarados', rows: 3, cols: 3, backgroundColor: SLATE },
      ),
      // p3 — a 4×4 wall with a 2×2 Zapdos punched into the centre.
      page(
        [
          card(0, 0, 'base1-12'),
          card(0, 1, 'base1-14'),
          card(0, 2, 'base1-5'),
          card(0, 3, 'base1-1'),
          card(1, 0, 'base1-11'),
          artwork(1, 1, 'base1-16', { rowSpan: 2, colSpan: 2 }),
          card(1, 3, 'base1-9'),
          card(2, 0, 'base1-8'),
          card(2, 3, 'base1-3'),
          card(3, 0, 'base1-7'),
          card(3, 1, 'base1-10'),
          card(3, 2, 'base1-13'),
          card(3, 3, 'cel25-5'),
        ],
        { title: 'Zapdos, centred', rows: 4, cols: 4, backgroundColor: COFFEE },
      ),
      // p4 — the Charizard plate: full-bleed 3×2 with three fire complements.
      page(
        [
          artwork(0, 0, 'base1-4', { rowSpan: 3, colSpan: 2 }),
          card(0, 2, 'base1-12'),
          card(1, 2, 'base1-14'),
          card(2, 2, 'base1-58'),
        ],
        { title: 'Charizard, full-bleed', rows: 3, cols: 3, backgroundColor: INK },
      ),
      // p5 — a 3×4 sampler with a tonal seam.
      page(
        [
          card(0, 0, 'base1-15'),
          card(0, 1, 'base1-2'),
          insert(0, 2, ASH),
          card(0, 3, 'base1-10'),
          card(1, 0, 'base1-1'),
          insert(1, 2, ASH),
          card(1, 3, 'base1-11'),
          card(2, 0, 'base1-6'),
          card(2, 1, 'base1-13'),
          insert(2, 2, ASH),
          card(2, 3, 'base1-9'),
        ],
        { title: 'Cool seam', rows: 3, cols: 4, backgroundColor: SLATE },
      ),
      // p6 — closing spread: a single full-bleed Venusaur, the page otherwise quiet.
      page(
        [
          artwork(0, 0, 'base1-15', { rowSpan: 2, colSpan: 3 }),
          insert(2, 0, EMBER),
          card(2, 1, 'base1-5'),
          insert(2, 2, EMBER),
        ],
        { title: 'Last page', rows: 3, cols: 3, backgroundColor: INK },
      ),
    ],
  },
];

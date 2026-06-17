/**
 * Content module: the Kanto / Base Set starter lines — a single-Pokémon study.
 *
 * Nine pages, one per evolution stage in dex order (Bulbasaur → Venusaur, Charmander →
 * Charizard, Squirtle → Blastoise). Each page is a 3×3 grid that features exactly ONE
 * Pokémon: its pockets hold real cards of that Pokémon across sets and eras, anchored by
 * the 1999 Base Set card, and the rest of the page is given to type-themed full-bleed art
 * panels (grass → forest, fire → flame/sunset, water → ocean) and intentional empty space.
 *
 * Composition discipline (verified per page):
 *   - Every page is 3×3 with AT MOST 6 card pockets and AT LEAST 3 artwork cells.
 *   - Card pockets are always 1×1; art panels span for composition (a colSpan:3 banner is
 *     three artwork cells; an oceanTall portrait is a 2×1, etc.).
 *   - No slot overlaps another; pockets left out of `slots` are negative space.
 *
 * Cards already in the base catalogue (src/data/sampleData.ts) are referenced by id and need
 * no declaration; the Base Set evolutions and a few era accents are declared below via
 * `defineCard`. Every art URL is a verified TCGdex `…/high.webp`.
 */

import {
  ART,
  artPanel,
  card,
  defineCard,
  page,
  type ContentModule,
} from '@/data/content/_helpers';

// --- page mats -------------------------------------------------------------

// Grass — cream paper & deep pine, sage for the lighter spreads.
const CREAM_MAT = '#EFF3E7';
const PINE_MAT = '#10180F';
const SAGE_MAT = '#E6EFE0';

// Fire — ash & ember darks that flatter the holo Charizards, a warm blush for the kit.
const ASH_MAT = '#141A24';
const EMBER_MAT = '#1B1410';
const BLUSH_MAT = '#FBE7DD';

// Water — deep navy & a pale tide blue.
const NAVY_MAT = '#10141C';
const TIDE_MAT = '#E7F1F8';

// Cards not already in the bundled catalogue. (Existing ids — sv03.5-001/166/002/004/005/006/
// 007/008/009/168/170/171/199/200, base1-2/4/15 — are reused freely with no declaration.)
export const cards: ContentModule['cards'] = [
  // Bulbasaur
  defineCard({
    id: 'base1-44',
    name: 'Bulbasaur',
    pokemon: 'Bulbasaur',
    setName: 'Base Set',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/44/high.webp',
    dominantColor: '#5BA86B',
  }),
  defineCard({
    id: 'bw5-1',
    name: 'Bulbasaur',
    pokemon: 'Bulbasaur',
    setName: 'Dark Explorers',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/bw/bw5/1/high.webp',
    dominantColor: '#6BB36B',
  }),
  defineCard({
    id: 'det1-1',
    name: 'Bulbasaur',
    pokemon: 'Bulbasaur',
    setName: 'Detective Pikachu',
    illustrator: 'MPC Film',
    imageUrl: 'https://assets.tcgdex.net/en/sm/det1/1/high.webp',
    dominantColor: '#7BBF6B',
  }),
  // Ivysaur
  defineCard({
    id: 'base1-30',
    name: 'Ivysaur',
    pokemon: 'Ivysaur',
    setName: 'Base Set',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/30/high.webp',
    dominantColor: '#4F9E63',
  }),
  defineCard({
    id: 'sv03.5-167',
    name: 'Ivysaur',
    pokemon: 'Ivysaur',
    setName: '151',
    illustrator: 'Yoriyuki Ikegami',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/167/high.webp',
    dominantColor: '#67B070',
  }),
  defineCard({
    id: 'bw5-2',
    name: 'Ivysaur',
    pokemon: 'Ivysaur',
    setName: 'Dark Explorers',
    illustrator: 'sui',
    imageUrl: 'https://assets.tcgdex.net/en/bw/bw5/2/high.webp',
    dominantColor: '#4F9E63',
  }),
  defineCard({
    id: 'pop2-7',
    name: 'Ivysaur',
    pokemon: 'Ivysaur',
    setName: 'POP Series 2',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/pop/pop2/7/high.webp',
    dominantColor: '#5BA86B',
  }),
  // Venusaur
  defineCard({
    id: 'base4-18',
    name: 'Venusaur',
    pokemon: 'Venusaur',
    setName: 'Base Set 2',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base4/18/high.webp',
    dominantColor: '#3F8E57',
  }),
  defineCard({
    id: 'pl3-13',
    name: 'Venusaur',
    pokemon: 'Venusaur',
    setName: 'Supreme Victors',
    illustrator: 'Kouki Saitou',
    imageUrl: 'https://assets.tcgdex.net/en/pl/pl3/13/high.webp',
    dominantColor: '#47966B',
  }),
  defineCard({
    id: 'dp3-20',
    name: 'Venusaur',
    pokemon: 'Venusaur',
    setName: 'Secret Wonders',
    illustrator: 'Kazuyuki Kano',
    imageUrl: 'https://assets.tcgdex.net/en/dp/dp3/20/high.webp',
    dominantColor: '#3F8E57',
  }),
  defineCard({
    id: 'bw5-3',
    name: 'Venusaur',
    pokemon: 'Venusaur',
    setName: 'Dark Explorers',
    illustrator: 'Masakazu Fukuda',
    imageUrl: 'https://assets.tcgdex.net/en/bw/bw5/3/high.webp',
    dominantColor: '#4F9E63',
  }),
  // Charmander
  defineCard({
    id: 'base1-46',
    name: 'Charmander',
    pokemon: 'Charmander',
    setName: 'Base Set',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/46/high.webp',
    dominantColor: '#E8743B',
  }),
  defineCard({
    id: 'det1-4',
    name: 'Charmander',
    pokemon: 'Charmander',
    setName: 'Detective Pikachu',
    illustrator: 'MPC Film',
    imageUrl: 'https://assets.tcgdex.net/en/sm/det1/4/high.webp',
    dominantColor: '#EF8A3B',
  }),
  defineCard({
    id: 'sm3-18',
    name: 'Charmander',
    pokemon: 'Charmander',
    setName: 'Burning Shadows',
    illustrator: 'Kagemaru Himeno',
    imageUrl: 'https://assets.tcgdex.net/en/sm/sm3/18/high.webp',
    dominantColor: '#E8743B',
  }),
  defineCard({
    id: 'swsh4-23',
    name: 'Charmander',
    pokemon: 'Charmander',
    setName: 'Vivid Voltage',
    illustrator: 'MAHOU',
    imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh4/23/high.webp',
    dominantColor: '#F0913B',
  }),
  // Charmeleon
  defineCard({
    id: 'base1-24',
    name: 'Charmeleon',
    pokemon: 'Charmeleon',
    setName: 'Base Set',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/24/high.webp',
    dominantColor: '#D9542B',
  }),
  defineCard({
    id: 'sv03.5-169',
    name: 'Charmeleon',
    pokemon: 'Charmeleon',
    setName: '151',
    illustrator: 'miki kudo',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/169/high.webp',
    dominantColor: '#EF8A3B',
  }),
  defineCard({
    id: 'swsh4-24',
    name: 'Charmeleon',
    pokemon: 'Charmeleon',
    setName: 'Vivid Voltage',
    illustrator: 'SATOSHI NAKAI',
    imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh4/24/high.webp',
    dominantColor: '#D9542B',
  }),
  // Charizard
  defineCard({
    id: 'base4-4',
    name: 'Charizard',
    pokemon: 'Charizard',
    setName: 'Base Set 2',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base4/4/high.webp',
    dominantColor: '#E8743B',
  }),
  defineCard({
    id: 'ecard1-6',
    name: 'Charizard',
    pokemon: 'Charizard',
    setName: 'Expedition Base Set',
    illustrator: 'Hiromichi Sugiyama',
    imageUrl: 'https://assets.tcgdex.net/en/ecard/ecard1/6/high.webp',
    dominantColor: '#D9542B',
  }),
  // Squirtle
  defineCard({
    id: 'base1-63',
    name: 'Squirtle',
    pokemon: 'Squirtle',
    setName: 'Base Set',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/63/high.webp',
    dominantColor: '#3F86C0',
  }),
  defineCard({
    id: 'bw7-29',
    name: 'Squirtle',
    pokemon: 'Squirtle',
    setName: 'Boundaries Crossed',
    illustrator: 'Kanako Eo',
    imageUrl: 'https://assets.tcgdex.net/en/bw/bw7/29/high.webp',
    dominantColor: '#4F96C8',
  }),
  defineCard({
    id: 'ex4-46',
    name: 'Squirtle',
    pokemon: 'Squirtle',
    setName: 'Team Magma vs Team Aqua',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/ex/ex4/46/high.webp',
    dominantColor: '#3F86C0',
  }),
  // Wartortle
  defineCard({
    id: 'base1-42',
    name: 'Wartortle',
    pokemon: 'Wartortle',
    setName: 'Base Set',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/42/high.webp',
    dominantColor: '#3878B0',
  }),
  defineCard({
    id: 'sv03.5-171',
    name: 'Wartortle',
    pokemon: 'Wartortle',
    setName: '151',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/171/high.webp',
    dominantColor: '#4F96C8',
  }),
  defineCard({
    id: 'bw7-30',
    name: 'Wartortle',
    pokemon: 'Wartortle',
    setName: 'Boundaries Crossed',
    illustrator: 'Mizue',
    imageUrl: 'https://assets.tcgdex.net/en/bw/bw7/30/high.webp',
    dominantColor: '#3F86C0',
  }),
  defineCard({
    id: 'base4-63',
    name: 'Wartortle',
    pokemon: 'Wartortle',
    setName: 'Base Set 2',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/base/base4/63/high.webp',
    dominantColor: '#3878B0',
  }),
  // Blastoise
  defineCard({
    id: 'base4-2',
    name: 'Blastoise',
    pokemon: 'Blastoise',
    setName: 'Base Set 2',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/base/base4/2/high.webp',
    dominantColor: '#2F6CA8',
  }),
  defineCard({
    id: 'pl1-2',
    name: 'Blastoise',
    pokemon: 'Blastoise',
    setName: 'Platinum',
    illustrator: 'Kagemaru Himeno',
    imageUrl: 'https://assets.tcgdex.net/en/pl/pl1/2/high.webp',
    dominantColor: '#3878B0',
  }),
  defineCard({
    id: 'dp3-2',
    name: 'Blastoise',
    pokemon: 'Blastoise',
    setName: 'Secret Wonders',
    illustrator: 'Daisuke Ito',
    imageUrl: 'https://assets.tcgdex.net/en/dp/dp3/2/high.webp',
    dominantColor: '#2F6CA8',
  }),
  defineCard({
    id: 'bw7-31',
    name: 'Blastoise',
    pokemon: 'Blastoise',
    setName: 'Boundaries Crossed',
    illustrator: 'Satoshi Shirai',
    imageUrl: 'https://assets.tcgdex.net/en/bw/bw7/31/high.webp',
    dominantColor: '#3F86C0',
  }),
];

export const binders: ContentModule['binders'] = [
  {
    id: 'example-base-starters',
    title: 'Base Set starters',
    description:
      'The three Kanto starter lines — one page per stage, each species across the eras with its 1999 Base Set card, set against type-themed art.',
    layoutStyle: 'single_pokemon',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // ── GRASS LINE ─────────────────────────────────────────────────────────
      // P1 — Bulbasaur. 5 cards across the top, a forest banner grounding the page.
      // cards: 5 · artwork: 3 (banner) · empty: 1 → (0,1)
      page(
        [
          card(0, 0, 'base1-44'),
          card(0, 2, 'sv03.5-001'),
          card(1, 0, 'det1-1'),
          card(1, 1, 'sv03.5-166'),
          card(1, 2, 'bw5-1'),
          artPanel(2, 0, ART.forest, { colSpan: 3 }),
          // (0,1) empty
        ],
        { title: 'Bulbasaur · seed', rows: 3, cols: 3, backgroundColor: CREAM_MAT },
      ),
      // P2 — Ivysaur. A forest banner up top; the line beneath it with breathing room.
      // cards: 4 · artwork: 3 (banner) · empty: 2 → (1,1),(2,2)
      page(
        [
          artPanel(0, 0, ART.forest, { colSpan: 3 }),
          card(1, 0, 'base1-30'),
          card(1, 2, 'sv03.5-167'),
          card(2, 0, 'bw5-2'),
          card(2, 1, 'pop2-7'),
          // (1,1),(2,2) empty
        ],
        { title: 'Ivysaur · bud', rows: 3, cols: 3, backgroundColor: PINE_MAT },
      ),
      // P3 — Venusaur. A forest column down the right; the bloom anchored left.
      // cards: 5 · artwork: 3 (2×1 column + 1×1) · empty: 1 → (2,1)
      page(
        [
          card(0, 0, 'base1-15'),
          card(0, 1, 'base4-18'),
          artPanel(0, 2, ART.forest, { rowSpan: 2, colSpan: 1 }),
          card(1, 0, 'pl3-13'),
          card(1, 1, 'bw5-3'),
          card(2, 0, 'dp3-20'),
          artPanel(2, 2, ART.forest, { colSpan: 1 }),
          // (2,1) empty
        ],
        { title: 'Venusaur · bloom', rows: 3, cols: 3, backgroundColor: SAGE_MAT },
      ),
      // ── FIRE LINE ──────────────────────────────────────────────────────────
      // P4 — Charmander. A sunset banner over the hatchling and its eras.
      // cards: 5 · artwork: 3 (banner) · empty: 1 → (1,1)
      page(
        [
          artPanel(0, 0, ART.sunset, { colSpan: 3 }),
          card(1, 0, 'base1-46'),
          card(1, 2, 'sv03.5-004'),
          card(2, 0, 'det1-4'),
          card(2, 1, 'sm3-18'),
          card(2, 2, 'swsh4-23'),
          // (1,1) empty
        ],
        { title: 'Charmander · spark', rows: 3, cols: 3, backgroundColor: BLUSH_MAT },
      ),
      // P5 — Charmeleon. A fire painting fills the left 3×2; the line stacks down the right.
      // cards: 3 · artwork: 6 (3×2 block) · empty: 0
      page(
        [
          artPanel(0, 0, ART.fire, { rowSpan: 3, colSpan: 2 }),
          card(0, 2, 'base1-24'),
          card(1, 2, 'sv03.5-169'),
          card(2, 2, 'swsh4-24'),
        ],
        { title: 'Charmeleon · flare', rows: 3, cols: 3, backgroundColor: ASH_MAT },
      ),
      // P6 — Charizard. The holo on ember black, a fire column blazing up the right.
      // cards: 5 · artwork: 3 (3×1 column) · empty: 1 → (2,1)
      page(
        [
          card(0, 0, 'base1-4'),
          card(0, 1, 'base4-4'),
          artPanel(0, 2, ART.fireEngine, { rowSpan: 3, colSpan: 1 }),
          card(1, 0, 'sv03.5-006'),
          card(1, 1, 'ecard1-6'),
          card(2, 0, 'sv03.5-168'),
          // (2,1) empty
        ],
        { title: 'Charizard · blaze', rows: 3, cols: 3, backgroundColor: EMBER_MAT },
      ),
      // ── WATER LINE ─────────────────────────────────────────────────────────
      // P7 — Squirtle. A wide ocean banner up top; the line beneath on tide blue.
      // cards: 4 · artwork: 3 (banner) · empty: 2 → (1,1),(2,2)
      page(
        [
          artPanel(0, 0, ART.oceanWide, { colSpan: 3 }),
          card(1, 0, 'base1-63'),
          card(1, 2, 'sv03.5-007'),
          card(2, 0, 'bw7-29'),
          card(2, 1, 'ex4-46'),
          // (1,1),(2,2) empty
        ],
        { title: 'Squirtle · trickle', rows: 3, cols: 3, backgroundColor: TIDE_MAT },
      ),
      // P8 — Wartortle. A tall ocean portrait down the left; the line to its right.
      // cards: 5 · artwork: 2 (2×1) + 1 (1×1) = 3 · empty: 1 → (2,2)
      page(
        [
          artPanel(0, 0, ART.oceanTall, { rowSpan: 2, colSpan: 1 }),
          card(0, 1, 'base1-42'),
          card(0, 2, 'sv03.5-008'),
          card(1, 1, 'sv03.5-171'),
          card(1, 2, 'bw7-30'),
          artPanel(2, 0, ART.oceanWide, { colSpan: 1 }),
          card(2, 1, 'base4-63'),
          // (2,2) empty
        ],
        { title: 'Wartortle · current', rows: 3, cols: 3, backgroundColor: NAVY_MAT },
      ),
      // P9 — Blastoise. An ocean banner grounds the page; the cannon-shell across the top.
      // cards: 6 · artwork: 3 (banner) · empty: 0
      page(
        [
          card(0, 0, 'base1-2'),
          card(0, 1, 'base4-2'),
          card(0, 2, 'sv03.5-009'),
          card(1, 0, 'pl1-2'),
          card(1, 1, 'dp3-2'),
          card(1, 2, 'bw7-31'),
          artPanel(2, 0, ART.oceanWide, { colSpan: 3 }),
        ],
        { title: 'Blastoise · torrent', rows: 3, cols: 3, backgroundColor: NAVY_MAT },
      ),
    ],
  },
];

/**
 * Content module: the Kanto / Base Set starter lines — a single-Pokémon study.
 *
 * Nine pages, one per evolution stage in dex order (Bulbasaur → Venusaur, Charmander →
 * Charizard, Squirtle → Blastoise). Each page is a 3×3 grid that features exactly ONE
 * Pokémon: its pockets hold real cards of that Pokémon across sets and eras, anchored by the
 * 1999 Base Set card, sat in a clean block; the remaining pockets are type-themed hand-drawn
 * ukiyo-e (a green/forest print for grass, Red Fuji / fireworks for fire, the Great Wave / rain
 * for water) sliced across a clean 2×2 block or column (`sliceRegion`) — art and cards never overlap.
 *
 * Composition discipline (verified per page):
 *   - Every page is 3×3 with AT MOST 6 card pockets; the rest are themed-art pockets (≥3 art).
 *   - Art fills clean rectangles only — no card is ever laid over a sliced image.
 *   - No slot overlaps another; no pocket is left empty.
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
  sliceRegion,
  type ContentModule,
} from '@/data/content/_helpers';

// --- page mats -------------------------------------------------------------
// The cards carry the Pokémon; the empty pockets are filled with type-themed hand-drawn ukiyo-e
// (green/forest prints for grass, Red-Fuji/fireworks for fire, Great-Wave/rain for water) sliced
// into a 2×2 block or column. Deep, type-tinted mats frame the art and make the cards pop.
const PINE_MAT = '#10180F'; // grass — deep pine
const ASH_MAT = '#141A24'; // fire — cool ash
const EMBER_MAT = '#1B1410'; // fire — warm ember
const NAVY_MAT = '#10141C'; // water — deep navy

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
      'The three Kanto starter lines — one page per stage, each species across the eras with its 1999 Base Set card, set into type-themed hand-drawn ukiyo-e sliced across the pockets.',
    layoutStyle: 'single_pokemon',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // ── GRASS LINE ── green/forest prints ───────────────────────────────────
      // P1 — Bulbasaur. A 2×2 watermill (greenery) block + 5 cards. 5 cards / 4 art.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.watermill),
          card(0, 2, 'base1-44'),
          card(1, 2, 'sv03.5-001'),
          card(2, 0, 'det1-1'),
          card(2, 1, 'sv03.5-166'),
          card(2, 2, 'bw5-1'),
        ],
        { title: 'Bulbasaur · seed', backgroundColor: PINE_MAT },
      ),
      // P2 — Ivysaur. A 2×2 grove block + a willow accent + 4 cards. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.edoForest),
          card(0, 2, 'base1-30'),
          card(1, 2, 'sv03.5-167'),
          artPanel(2, 0, ART.edoWillow),
          card(2, 1, 'bw5-2'),
          card(2, 2, 'pop2-7'),
        ],
        { title: 'Ivysaur · bud', backgroundColor: PINE_MAT },
      ),
      // P3 — Venusaur. A 2×2 summer-garden block + 5 cards. 5 / 4.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.edoGreen),
          card(0, 2, 'base1-15'),
          card(1, 2, 'base4-18'),
          card(2, 0, 'pl3-13'),
          card(2, 1, 'bw5-3'),
          card(2, 2, 'dp3-20'),
        ],
        { title: 'Venusaur · bloom', backgroundColor: PINE_MAT },
      ),
      // ── FIRE LINE ── Red Fuji / fireworks / storm ───────────────────────────
      // P4 — Charmander. A 2×2 Red-Fuji block + 5 cards. 5 / 4.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.redFuji),
          card(0, 2, 'base1-46'),
          card(1, 2, 'sv03.5-004'),
          card(2, 0, 'det1-4'),
          card(2, 1, 'sm3-18'),
          card(2, 2, 'swsh4-23'),
        ],
        { title: 'Charmander · spark', backgroundColor: EMBER_MAT },
      ),
      // P5 — Charmeleon. A tall fireworks hero (3×2) + the line down the right. 3 / 6.
      page(
        [
          ...sliceRegion(0, 0, 3, 2, ART.edoFireworks),
          card(0, 2, 'base1-24'),
          card(1, 2, 'sv03.5-169'),
          card(2, 2, 'swsh4-24'),
        ],
        { title: 'Charmeleon · flare', backgroundColor: ASH_MAT },
      ),
      // P6 — Charizard. A 2×2 thunderstorm block + 5 cards. 5 / 4.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.lightning),
          card(0, 2, 'base1-4'),
          card(1, 2, 'base4-4'),
          card(2, 0, 'sv03.5-006'),
          card(2, 1, 'ecard1-6'),
          card(2, 2, 'sv03.5-168'),
        ],
        { title: 'Charizard · blaze', backgroundColor: EMBER_MAT },
      ),
      // ── WATER LINE ── Great Wave / sea / rain ───────────────────────────────
      // P7 — Squirtle. A 2×2 Great-Wave block + a sea-coast accent + 4 cards. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.greatWave),
          card(0, 2, 'base1-63'),
          card(1, 2, 'sv03.5-007'),
          artPanel(2, 0, ART.edoSea),
          card(2, 1, 'bw7-29'),
          card(2, 2, 'ex4-46'),
        ],
        { title: 'Squirtle · trickle', backgroundColor: NAVY_MAT },
      ),
      // P8 — Wartortle. A 2×2 rain-shower block + 5 cards. 5 / 4.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.edoRain),
          card(0, 2, 'base1-42'),
          card(1, 2, 'sv03.5-008'),
          card(2, 0, 'sv03.5-171'),
          card(2, 1, 'bw7-30'),
          card(2, 2, 'base4-63'),
        ],
        { title: 'Wartortle · current', backgroundColor: NAVY_MAT },
      ),
      // P9 — Blastoise. 6 cards (top two rows) over a Great-Wave banner across the bottom. 6 / 3.
      page(
        [
          card(0, 0, 'base1-2'),
          card(0, 1, 'base4-2'),
          card(0, 2, 'sv03.5-009'),
          card(1, 0, 'pl1-2'),
          card(1, 1, 'dp3-2'),
          card(1, 2, 'bw7-31'),
          ...sliceRegion(2, 0, 1, 3, ART.greatWave),
        ],
        { title: 'Blastoise · torrent', backgroundColor: NAVY_MAT },
      ),
    ],
  },
];

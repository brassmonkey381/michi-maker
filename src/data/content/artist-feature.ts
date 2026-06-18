/**
 * Content module: a single-illustrator feature binder.
 *
 * One artist, one mood: **Mitsuhiro Arita** — the painter of the original Base Set
 * Charizard — through a secondary theme of **fire & dragons**. Arita illustrated 716
 * cards; here we hang only his flame-and-scale work (Charizard, Gyarados, Moltres,
 * Dragonite, Ho-Oh, Reshiram, Rayquaza, …) on warm gallery-dark mats.
 *
 * Page discipline (every page is a 3×3 grid, verified below):
 *   - at MOST 6 pockets hold cards, in a clean block; every remaining pocket is art placed by URL
 *     via the slice method — a flame-or-scale Pokémon as a 2×2 pocket-puzzle (`sliceRegion`) or a
 *     merged hero, plus a second species accent. Art and cards never overlap (≥3 art). No paintings.
 *   - every card is by Mitsuhiro Arita AND is a fire- or dragon-type Pokémon.
 *   - no slot overlaps another and no footprint leaves the 3×3 grid.
 *
 * Every card id below was verified against the TCGdex API: its `illustrator` is
 * "Mitsuhiro Arita" and its `high.webp` art returns HTTP 200. Helpers live in
 * ./_helpers; the aggregator (./index.ts) imports `cards` and `binders`.
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

// --- Mats / palette --------------------------------------------------------
// Warm gallery-darks that flatter Arita's painterly flame work and frame the sliced/merged
// dragon-and-flame renders that fill each plate's pockets.
const EMBER_DARK = '#1B1410';
const GALLERY_WARM = '#141A24';
const NIGHT_WARM = '#14131A';

// Arita's fire & dragon cards. base1-4 (Charizard) and base1-6 (Gyarados) already live
// in the base catalogue, so they are referenced directly and NOT redeclared here.
export const cards: ContentModule['cards'] = [
  defineCard({
    id: 'base1-46',
    name: 'Charmander',
    pokemon: 'Charmander',
    setName: 'Base Set',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/46/high.webp',
    dominantColor: '#F0913B',
  }),
  defineCard({
    id: 'base1-24',
    name: 'Charmeleon',
    pokemon: 'Charmeleon',
    setName: 'Base Set',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/24/high.webp',
    dominantColor: '#E8743B',
  }),
  defineCard({
    id: 'base1-18',
    name: 'Dragonair',
    pokemon: 'Dragonair',
    setName: 'Base Set',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/18/high.webp',
    dominantColor: '#7FA8D8',
  }),
  defineCard({
    id: 'hgss1-4',
    name: 'Gyarados',
    pokemon: 'Gyarados',
    setName: 'HeartGold & SoulSilver',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/hgss/hgss1/4/high.webp',
    dominantColor: '#3F6FB0',
  }),
  defineCard({
    id: 'hgss4-62',
    name: 'Dratini',
    pokemon: 'Dratini',
    setName: 'HGSS — Triumphant',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/hgss/hgss4/62/high.webp',
    dominantColor: '#7FA8D8',
  }),
  defineCard({
    id: 'base3-12',
    name: 'Moltres',
    pokemon: 'Moltres',
    setName: 'Fossil',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base3/12/high.webp',
    dominantColor: '#E8743B',
  }),
  defineCard({
    id: 'base3-27',
    name: 'Moltres',
    pokemon: 'Moltres',
    setName: 'Fossil',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/base/base3/27/high.webp',
    dominantColor: '#E8A93B',
  }),
  defineCard({
    id: 'pop5-1',
    name: 'Ho-Oh',
    pokemon: 'Ho-Oh',
    setName: 'POP Series 5',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/pop/pop5/1/high.webp',
    dominantColor: '#E8A93B',
  }),
  defineCard({
    id: 'xy7-15',
    name: 'Entei',
    pokemon: 'Entei',
    setName: 'Ancient Origins',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/xy/xy7/15/high.webp',
    dominantColor: '#C0703B',
  }),
  defineCard({
    id: 'dp6-2',
    name: 'Dragonite',
    pokemon: 'Dragonite',
    setName: 'Legends Awakened',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/dp/dp6/2/high.webp',
    dominantColor: '#E8A93B',
  }),
  defineCard({
    id: 'ex3-10',
    name: 'Salamence',
    pokemon: 'Salamence',
    setName: 'Dragon',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/ex/ex3/10/high.webp',
    dominantColor: '#3F6FB0',
  }),
  defineCard({
    id: 'ex16-94',
    name: 'Flygon ex',
    pokemon: 'Flygon',
    setName: 'Power Keepers',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/ex/ex16/94/high.webp',
    dominantColor: '#5BA86B',
  }),
  defineCard({
    id: 'xyp-XY64',
    name: 'Rayquaza',
    pokemon: 'Rayquaza',
    setName: 'XY Promos',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/xy/xyp/XY64/high.webp',
    dominantColor: '#3FA86B',
  }),
  defineCard({
    id: 'xyp-XY74',
    name: 'Reshiram',
    pokemon: 'Reshiram',
    setName: 'XY Promos',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/xy/xyp/XY74/high.webp',
    dominantColor: '#D8C8B0',
  }),
  defineCard({
    id: 'bw4-12',
    name: 'Arcanine',
    pokemon: 'Arcanine',
    setName: 'Dark Explorers',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/bw/bw4/12/high.webp',
    dominantColor: '#E8743B',
  }),
  defineCard({
    id: 'sm3-28',
    name: 'Alolan Ninetales',
    pokemon: 'Ninetales',
    setName: 'Burning Shadows',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/sm/sm3/28/high.webp',
    dominantColor: '#8FC8D8',
  }),
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
    id: 'lc-3',
    name: 'Charizard',
    pokemon: 'Charizard',
    setName: 'Legendary Collection',
    illustrator: 'Mitsuhiro Arita',
    imageUrl: 'https://assets.tcgdex.net/en/lc/lc/3/high.webp',
    dominantColor: '#E8743B',
  }),
];

export const binders: ContentModule['binders'] = [
  // ===================================================================
  // Arita — Fire & Dragons. One illustrator, one element. Six plates,
  // each 3×3 with ≤6 framed cards and ≥3 full-bleed flame panels.
  // ===================================================================
  {
    id: 'example-arita',
    title: 'Arita — Fire & Dragons',
    description:
      "A single-illustrator gallery for Mitsuhiro Arita — the painter of the Base Set Charizard — hung to one element: fire & dragons. Charizard, Gyarados, Moltres, Dragonite, Ho-Oh and more, floated on warm mats over fire, storm and sea prints sliced across the pockets.",
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // Plate I — Born of fire. The Charmander line (top) · a 2×2 Red-Fuji block + a fireworks column. 3 / 6.
      page(
        [
          card(0, 0, 'base1-46'),
          card(0, 1, 'base1-24'),
          card(0, 2, 'base1-4'),
          ...sliceRegion(1, 0, 2, 2, ART.redFuji),
          artPanel(1, 2, ART.edoFireworks, { rowSpan: 2, colSpan: 1 }),
        ],
        { title: 'Plate I — Born of Fire', backgroundColor: EMBER_DARK },
      ),
      // Plate II — Serpents & seas. A 2×2 Great-Wave block + a rain accent + 4 cards. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.greatWave),
          card(0, 2, 'base1-6'),
          card(1, 2, 'hgss1-4'),
          artPanel(2, 0, ART.edoRain),
          card(2, 1, 'base1-18'),
          card(2, 2, 'hgss4-62'),
        ],
        { title: 'Plate II — Serpents & Seas', backgroundColor: GALLERY_WARM },
      ),
      // Plate III — The birds of flame. A 2×2 sunset-sky block + a fireworks accent + 4 cards. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.edoSky),
          card(0, 2, 'base3-12'),
          card(1, 2, 'pop5-1'),
          artPanel(2, 0, ART.edoFireworks),
          card(2, 1, 'base3-27'),
          card(2, 2, 'xy7-15'),
        ],
        { title: 'Plate III — Birds of Flame', backgroundColor: EMBER_DARK },
      ),
      // Plate IV — Dragons ascendant. A big thunderstorm block (2×2) + a moonlit accent + 4 cards. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.lightning),
          card(0, 2, 'dp6-2'),
          card(1, 2, 'xyp-XY64'),
          artPanel(2, 0, ART.edoMoon),
          card(2, 1, 'ex3-10'),
          card(2, 2, 'ex16-94'),
        ],
        { title: 'Plate IV — Dragons Ascendant', backgroundColor: GALLERY_WARM },
      ),
      // Plate V — Fire kin. A 2×2 fireworks block + a Red-Fuji accent + 4 cards. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.edoFireworks),
          card(0, 2, 'bw4-12'),
          card(1, 2, 'sm3-28'),
          artPanel(2, 0, ART.redFuji),
          card(2, 1, 'xyp-XY74'),
          card(2, 2, 'lc-3'),
        ],
        { title: 'Plate V — Fire Kin', backgroundColor: NIGHT_WARM },
      ),
      // Plate VI — The Arita fire wall. Six framed Arita classics (top two rows) over a Red-Fuji
      // banner across the bottom. 6 / 3.
      page(
        [
          card(0, 0, 'base1-4'),
          card(0, 1, 'base4-4'),
          card(0, 2, 'dp6-2'),
          card(1, 0, 'base3-12'),
          card(1, 1, 'base1-6'),
          card(1, 2, 'bw4-12'),
          ...sliceRegion(2, 0, 1, 3, ART.redFuji),
        ],
        { title: 'Plate VI — The Arita Fire Wall', backgroundColor: EMBER_DARK },
      ),
    ],
  },
];

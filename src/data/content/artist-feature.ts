/**
 * Content module: a single-illustrator feature binder.
 *
 * One artist, one mood: **Mitsuhiro Arita** — the painter of the original Base Set
 * Charizard — through a secondary theme of **fire & dragons**. Arita illustrated 716
 * cards; here we hang only his flame-and-scale work (Charizard, Gyarados, Moltres,
 * Dragonite, Ho-Oh, Reshiram, Rayquaza, …) on warm gallery-dark mats.
 *
 * Page discipline (every page is a 3×3 grid, verified below):
 *   - at MOST 6 pockets hold cards; at LEAST 3 pockets are full-bleed art panels
 *     (fire-themed ART.* washes), and the remainder is negative space (left out of `slots`).
 *   - every card is by Mitsuhiro Arita AND is a fire- or dragon-type Pokémon.
 *   - no slot overlaps another and no footprint leaves the 3×3 grid.
 *
 * Every card id below was verified against the TCGdex API: its `illustrator` is
 * "Mitsuhiro Arita" and its `high.webp` art returns HTTP 200. Helpers live in
 * ./_helpers; the aggregator (./index.ts) imports `cards` and `binders`.
 */

import {
  artPanel,
  card,
  defineCard,
  page,
  ART,
  type ContentModule,
} from '@/data/content/_helpers';

// --- Mats / palette --------------------------------------------------------
// Warm gallery-darks that flatter Arita's painterly flame work, plus a cream wall.
const EMBER_DARK = '#1B1410';
const GALLERY_WARM = '#141A24';
const NIGHT_WARM = '#14131A';
const CREAM = '#F3ECDD';

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
      "A single-illustrator gallery for Mitsuhiro Arita — the painter of the Base Set Charizard — hung to one element: fire & dragons. Charizard, Gyarados, Moltres, Dragonite, Ho-Oh and more, floated on warm mats between full-bleed flame panels.",
    layoutStyle: 'artist',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // Plate I — Born of fire. The Charmander line (3 cards) above a full-width
      // band of flame (3 art cells). Top-centre + corners left as negative space.
      // 3 cards, 3 art, 3 empty.
      page(
        [
          card(0, 0, 'base1-46'),
          card(0, 2, 'base1-24'),
          card(1, 1, 'base1-4'),
          artPanel(2, 0, ART.fire, { colSpan: 3 }),
        ],
        { title: 'Plate I — Born of Fire', backgroundColor: EMBER_DARK },
      ),
      // Plate II — Serpents & seas. Four dragon/sea cards down the left two
      // columns, a tall storm panel filling the right column (3 art cells).
      // 4 cards, 3 art, 2 empty.
      page(
        [
          card(0, 0, 'base1-6'),
          card(0, 1, 'hgss1-4'),
          card(1, 0, 'base1-18'),
          card(2, 1, 'hgss4-62'),
          artPanel(0, 2, ART.storm, { rowSpan: 3 }),
        ],
        { title: 'Plate II — Serpents & Seas', backgroundColor: GALLERY_WARM },
      ),
      // Plate III — The birds of flame. A full-width sunset band across the top
      // (3 art cells), the two Moltres + Ho-Oh + Entei beneath. 4 cards, 3 art, 2 empty.
      page(
        [
          artPanel(0, 0, ART.sunset, { colSpan: 3 }),
          card(1, 0, 'base3-12'),
          card(1, 2, 'pop5-1'),
          card(2, 0, 'base3-27'),
          card(2, 2, 'xy7-15'),
        ],
        { title: 'Plate III — Birds of Flame', backgroundColor: EMBER_DARK },
      ),
      // Plate IV — Dragons ascendant. A tall sunset-sky panel up the left column
      // (3 art cells); four dragons climbing the right two columns. 4 cards, 3 art, 2 empty.
      page(
        [
          artPanel(0, 0, ART.sunsetSky, { rowSpan: 3 }),
          card(0, 1, 'dp6-2'),
          card(0, 2, 'xyp-XY64'),
          card(1, 2, 'ex3-10'),
          card(2, 1, 'ex16-94'),
        ],
        { title: 'Plate IV — Dragons Ascendant', backgroundColor: GALLERY_WARM },
      ),
      // Plate V — Fire kin. Four flame-kin cards above a full-width band of fire
      // (3 art cells). 4 cards, 3 art, 2 empty.
      page(
        [
          card(0, 0, 'bw4-12'),
          card(0, 2, 'sm3-28'),
          card(1, 0, 'xyp-XY74'),
          card(1, 2, 'lc-3'),
          artPanel(2, 0, ART.fire, { colSpan: 3 }),
        ],
        { title: 'Plate V — Fire Kin', backgroundColor: NIGHT_WARM },
      ),
      // Plate VI — The Arita fire wall. A salon hang of six framed Arita classics
      // on cream, with three single flame panels woven between. 6 cards, 3 art, 0 empty.
      page(
        [
          card(0, 0, 'base1-4'),
          artPanel(0, 1, ART.sunset),
          card(0, 2, 'base4-4'),
          card(1, 0, 'dp6-2'),
          artPanel(1, 1, ART.fire),
          card(1, 2, 'base3-12'),
          card(2, 0, 'base1-6'),
          artPanel(2, 1, ART.storm),
          card(2, 2, 'bw4-12'),
        ],
        { title: 'Plate VI — The Arita Fire Wall', backgroundColor: CREAM },
      ),
    ],
  },
];

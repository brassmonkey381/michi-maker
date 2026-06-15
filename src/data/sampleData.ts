/**
 * Local sample catalogue + premade example binders.
 *
 * Card art uses the public PokeAPI "official artwork" sprite CDN (stable, dex-number
 * based) so the examples render real Pokémon imagery without any backend configured.
 * Replace this with data ingested from artofpkm.com once the pipeline exists
 * (see docs/DATA-MODEL.md).
 */

import { type DemoBinder, type DemoCard, type DemoSlot, uid } from '@/data/binderTypes';

const ART = (dex: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;

const SETS = ['Base Set', 'Jungle', 'Fossil', 'Scarlet & Violet', 'Evolving Skies', '151'];
const ARTISTS = ['Mitsuhiro Arita', 'Atsuko Nishida', 'Ken Sugimori', '5ban Graphics', 'Naoki Saito'];

// [dexNumber, displayName, dominantColor]
const RAW: [number, string, string][] = [
  [1, 'Bulbasaur', '#6BB36B'],
  [3, 'Venusaur', '#5BA86B'],
  [4, 'Charmander', '#F0913B'],
  [6, 'Charizard', '#E8743B'],
  [7, 'Squirtle', '#5FA8D8'],
  [9, 'Blastoise', '#4F8FD1'],
  [25, 'Pikachu', '#F4D03F'],
  [59, 'Arcanine', '#E8743B'],
  [77, 'Ponyta', '#F5A623'],
  [94, 'Gengar', '#6B5B95'],
  [130, 'Gyarados', '#3F6FB0'],
  [131, 'Lapras', '#5FA8D8'],
  [133, 'Eevee', '#C8A165'],
  [134, 'Vaporeon', '#4FA3D1'],
  [135, 'Jolteon', '#F2C744'],
  [136, 'Flareon', '#E8743B'],
  [143, 'Snorlax', '#3E5C76'],
  [144, 'Articuno', '#5FB0D8'],
  [146, 'Moltres', '#F0913B'],
  [149, 'Dragonite', '#E8A93B'],
  [150, 'Mewtwo', '#9B8FB0'],
  [151, 'Mew', '#F4A7C0'],
  [196, 'Espeon', '#C98BB9'],
  [197, 'Umbreon', '#3A3A4A'],
  [282, 'Gardevoir', '#BFD8C9'],
  [448, 'Lucario', '#2B6FB0'],
  [470, 'Leafeon', '#8BC34A'],
  [471, 'Glaceon', '#7FD0E0'],
  [700, 'Sylveon', '#F4A7C0'],
];

export const CARDS: DemoCard[] = RAW.map(([dex, name, color], i) => ({
  id: name.toLowerCase(),
  name,
  pokemon: name,
  setName: SETS[i % SETS.length],
  illustrator: ARTISTS[i % ARTISTS.length],
  imageUrl: ART(dex),
  dominantColor: color,
  orientation: 'portrait',
}));

export const CARDS_BY_ID: Record<string, DemoCard> = Object.fromEntries(
  CARDS.map((card) => [card.id, card]),
);

// --- example binders -------------------------------------------------------

type SlotOpts = Partial<Pick<DemoSlot, 'rowSpan' | 'colSpan' | 'type'>>;

const card = (row: number, col: number, cardId: string, opts?: SlotOpts): DemoSlot => ({
  id: uid('slot'),
  row,
  col,
  rowSpan: opts?.rowSpan ?? 1,
  colSpan: opts?.colSpan ?? 1,
  type: opts?.type ?? 'card',
  cardId,
});

export const SAMPLE_BINDERS: DemoBinder[] = [
  {
    id: 'example-eeveelutions',
    title: 'The Eeveelutions',
    description: 'Eevee anchored in the centre, surrounded by all eight evolutions.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'eevee',
    pages: [
      {
        id: uid('page'),
        title: 'One of each',
        rows: 3,
        cols: 3,
        backgroundColor: '#F3EEE6',
        slots: [
          card(0, 0, 'vaporeon'),
          card(0, 1, 'jolteon'),
          card(0, 2, 'flareon'),
          card(1, 0, 'espeon'),
          card(1, 1, 'eevee'),
          card(1, 2, 'umbreon'),
          card(2, 0, 'leafeon'),
          card(2, 1, 'glaceon'),
          card(2, 2, 'sylveon'),
        ],
      },
    ],
  },
  {
    id: 'example-charizard-anchor',
    title: 'Charizard, anchored',
    description: 'A 2×2 hero spanning four pockets, with fiery accents around it.',
    layoutStyle: 'anchor',
    isExample: true,
    coverCardId: 'charizard',
    pages: [
      {
        id: uid('page'),
        title: 'Hot corner',
        rows: 3,
        cols: 3,
        backgroundColor: '#1B1410',
        slots: [
          card(0, 0, 'charizard', { rowSpan: 2, colSpan: 2, type: 'artwork' }),
          card(0, 2, 'charmander'),
          card(1, 2, 'moltres'),
          card(2, 0, 'arcanine'),
          card(2, 1, 'ponyta'),
          card(2, 2, 'flareon'),
        ],
      },
    ],
  },
  {
    id: 'example-ocean-blues',
    title: 'Ocean blues',
    description: 'A cool-blue palette with two pockets left empty for breathing room.',
    layoutStyle: 'color_theme',
    isExample: true,
    coverCardId: 'blastoise',
    pages: [
      {
        id: uid('page'),
        title: 'Blue hour',
        rows: 3,
        cols: 3,
        backgroundColor: '#EAF3F8',
        slots: [
          card(0, 0, 'articuno'),
          card(0, 1, 'lapras'),
          card(0, 2, 'vaporeon'),
          card(1, 0, 'blastoise'),
          // (1,1) intentionally empty
          card(1, 2, 'glaceon'),
          card(2, 0, 'squirtle'),
          card(2, 1, 'gyarados'),
          // (2,2) intentionally empty
        ],
      },
    ],
  },
  {
    id: 'example-kanto-starters',
    title: 'Kanto starters',
    description: 'Two pages: the first partners centred with negative space, then their finals.',
    layoutStyle: 'freeform',
    isExample: true,
    coverCardId: 'charizard',
    pages: [
      {
        id: uid('page'),
        title: 'Pick one',
        rows: 3,
        cols: 3,
        backgroundColor: '#FBF6EC',
        slots: [card(1, 0, 'bulbasaur'), card(1, 1, 'charmander'), card(1, 2, 'squirtle')],
      },
      {
        id: uid('page'),
        title: 'All grown up',
        rows: 3,
        cols: 3,
        backgroundColor: '#FBF6EC',
        slots: [card(1, 0, 'venusaur'), card(1, 1, 'charizard'), card(1, 2, 'blastoise')],
      },
    ],
  },
];

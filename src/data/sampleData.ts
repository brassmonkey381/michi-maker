/**
 * Local sample catalogue + premade example binders.
 *
 * Card art is real official TCG art served from the TCGdex CDN (the same source the
 * ingestion script uses — see scripts/ingest.mjs and docs/DATA-MODEL.md), so the examples
 * render genuine card images with no backend configured. Card ids are TCGdex ids, so a
 * binder built here references cards the same way an ingested catalogue would.
 */

import { type DemoBinder, type DemoCard, type DemoSlot, uid } from '@/data/binderTypes';

const RAW: Omit<DemoCard, 'orientation'>[] = [
  // --- Base Set (1999) ---
  { id: 'base1-1', name: 'Alakazam', pokemon: 'Alakazam', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/1/high.webp', dominantColor: '#C98BB9' },
  { id: 'base1-2', name: 'Blastoise', pokemon: 'Blastoise', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/2/high.webp', dominantColor: '#4F8FD1' },
  { id: 'base1-3', name: 'Chansey', pokemon: 'Chansey', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/3/high.webp', dominantColor: '#F4C0CE' },
  { id: 'base1-4', name: 'Charizard', pokemon: 'Charizard', setName: 'Base Set', illustrator: 'Mitsuhiro Arita', imageUrl: 'https://assets.tcgdex.net/en/base/base1/4/high.webp', dominantColor: '#E8743B' },
  { id: 'base1-5', name: 'Clefairy', pokemon: 'Clefairy', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/5/high.webp', dominantColor: '#F4C0CE' },
  { id: 'base1-6', name: 'Gyarados', pokemon: 'Gyarados', setName: 'Base Set', illustrator: 'Mitsuhiro Arita', imageUrl: 'https://assets.tcgdex.net/en/base/base1/6/high.webp', dominantColor: '#3F6FB0' },
  { id: 'base1-8', name: 'Machamp', pokemon: 'Machamp', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/8/high.webp', dominantColor: '#C0703B' },
  { id: 'base1-9', name: 'Magneton', pokemon: 'Magneton', setName: 'Base Set', illustrator: 'Keiji Kinebuchi', imageUrl: 'https://assets.tcgdex.net/en/base/base1/9/high.webp', dominantColor: '#9AA4AD' },
  { id: 'base1-10', name: 'Mewtwo', pokemon: 'Mewtwo', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/10/high.webp', dominantColor: '#9B8FB0' },
  { id: 'base1-11', name: 'Nidoking', pokemon: 'Nidoking', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/11/high.webp', dominantColor: '#9B6FB0' },
  { id: 'base1-12', name: 'Ninetales', pokemon: 'Ninetales', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/12/high.webp', dominantColor: '#E8A93B' },
  { id: 'base1-13', name: 'Poliwrath', pokemon: 'Poliwrath', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/13/high.webp', dominantColor: '#3F6FB0' },
  { id: 'base1-14', name: 'Raichu', pokemon: 'Raichu', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/14/high.webp', dominantColor: '#F2A93B' },
  { id: 'base1-15', name: 'Venusaur', pokemon: 'Venusaur', setName: 'Base Set', illustrator: 'Mitsuhiro Arita', imageUrl: 'https://assets.tcgdex.net/en/base/base1/15/high.webp', dominantColor: '#5BA86B' },
  { id: 'base1-16', name: 'Zapdos', pokemon: 'Zapdos', setName: 'Base Set', illustrator: 'Ken Sugimori', imageUrl: 'https://assets.tcgdex.net/en/base/base1/16/high.webp', dominantColor: '#F2C744' },
  { id: 'base1-58', name: 'Pikachu', pokemon: 'Pikachu', setName: 'Base Set', illustrator: 'Mitsuhiro Arita', imageUrl: 'https://assets.tcgdex.net/en/base/base1/58/high.webp', dominantColor: '#F4D03F' },

  // --- 151 (Scarlet & Violet) ---
  { id: 'sv03.5-001', name: 'Bulbasaur', pokemon: 'Bulbasaur', setName: '151', illustrator: 'Yuu Nishida', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/001/high.webp', dominantColor: '#6BB36B' },
  { id: 'sv03.5-002', name: 'Ivysaur', pokemon: 'Ivysaur', setName: '151', illustrator: 'Yuu Nishida', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/002/high.webp', dominantColor: '#5BA86B' },
  { id: 'sv03.5-003', name: 'Venusaur ex', pokemon: 'Venusaur', setName: '151', illustrator: '5ban Graphics', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/003/high.webp', dominantColor: '#5BA86B' },
  { id: 'sv03.5-004', name: 'Charmander', pokemon: 'Charmander', setName: '151', illustrator: 'GIDORA', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/004/high.webp', dominantColor: '#F0913B' },
  { id: 'sv03.5-005', name: 'Charmeleon', pokemon: 'Charmeleon', setName: '151', illustrator: 'GIDORA', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/005/high.webp', dominantColor: '#E8743B' },
  { id: 'sv03.5-006', name: 'Charizard ex', pokemon: 'Charizard', setName: '151', illustrator: 'PLANETA Mochizuki', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/006/high.webp', dominantColor: '#E8743B' },
  { id: 'sv03.5-007', name: 'Squirtle', pokemon: 'Squirtle', setName: '151', illustrator: 'kantaro', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/007/high.webp', dominantColor: '#5FA8D8' },
  { id: 'sv03.5-008', name: 'Wartortle', pokemon: 'Wartortle', setName: '151', illustrator: 'kantaro', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/008/high.webp', dominantColor: '#4F8FD1' },
  { id: 'sv03.5-009', name: 'Blastoise ex', pokemon: 'Blastoise', setName: '151', illustrator: 'PLANETA Yamashita', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/009/high.webp', dominantColor: '#4F8FD1' },
  { id: 'sv03.5-025', name: 'Pikachu', pokemon: 'Pikachu', setName: '151', illustrator: 'Naoyo Kimura', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/025/high.webp', dominantColor: '#F4D03F' },
  { id: 'sv03.5-133', name: 'Eevee', pokemon: 'Eevee', setName: '151', illustrator: 'Narumi Sato', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/133/high.webp', dominantColor: '#C8A165' },
  { id: 'sv03.5-150', name: 'Mewtwo', pokemon: 'Mewtwo', setName: '151', illustrator: 'AKIRA EGAWA', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/150/high.webp', dominantColor: '#9B8FB0' },
  { id: 'sv03.5-166', name: 'Bulbasaur', pokemon: 'Bulbasaur', setName: '151', illustrator: 'Yoriyuki Ikegami', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/166/high.webp', dominantColor: '#6BB36B' },
  { id: 'sv03.5-168', name: 'Charmander', pokemon: 'Charmander', setName: '151', illustrator: 'miki kudo', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/168/high.webp', dominantColor: '#F0913B' },
  { id: 'sv03.5-170', name: 'Squirtle', pokemon: 'Squirtle', setName: '151', illustrator: 'Mitsuhiro Arita', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/170/high.webp', dominantColor: '#5FA8D8' },
  { id: 'sv03.5-173', name: 'Pikachu', pokemon: 'Pikachu', setName: '151', illustrator: 'Hiroyuki Yamamoto', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/173/high.webp', dominantColor: '#F4D03F' },
  { id: 'sv03.5-198', name: 'Venusaur ex', pokemon: 'Venusaur', setName: '151', illustrator: 'Yoriyuki Ikegami', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/198/high.webp', dominantColor: '#5BA86B' },
  { id: 'sv03.5-199', name: 'Charizard ex', pokemon: 'Charizard', setName: '151', illustrator: 'miki kudo', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp', dominantColor: '#E8743B' },
  { id: 'sv03.5-200', name: 'Blastoise ex', pokemon: 'Blastoise', setName: '151', illustrator: 'Mitsuhiro Arita', imageUrl: 'https://assets.tcgdex.net/en/sv/sv03.5/200/high.webp', dominantColor: '#4F8FD1' },

  // --- Evolving Skies (eeveelutions) ---
  { id: 'swsh7-125', name: 'Eevee', pokemon: 'Eevee', setName: 'Evolving Skies', illustrator: 'Atsushi Furusawa', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/125/high.webp', dominantColor: '#C8A165' },
  { id: 'swsh7-172', name: 'Vaporeon V', pokemon: 'Vaporeon', setName: 'Evolving Skies', illustrator: '5ban Graphics', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/172/high.webp', dominantColor: '#4FA3D1' },
  { id: 'swsh7-177', name: 'Jolteon V', pokemon: 'Jolteon', setName: 'Evolving Skies', illustrator: '5ban Graphics', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/177/high.webp', dominantColor: '#F2C744' },
  { id: 'swsh7-169', name: 'Flareon V', pokemon: 'Flareon', setName: 'Evolving Skies', illustrator: '5ban Graphics', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/169/high.webp', dominantColor: '#E8743B' },
  { id: 'swsh7-179', name: 'Espeon V', pokemon: 'Espeon', setName: 'Evolving Skies', illustrator: '5ban Graphics', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/179/high.webp', dominantColor: '#C98BB9' },
  { id: 'swsh7-215', name: 'Umbreon VMAX', pokemon: 'Umbreon', setName: 'Evolving Skies', illustrator: 'KEIICHIRO ITO', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/215/high.webp', dominantColor: '#3A3A4A' },
  { id: 'swsh7-167', name: 'Leafeon V', pokemon: 'Leafeon', setName: 'Evolving Skies', illustrator: 'You Iribi', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/167/high.webp', dominantColor: '#8BC34A' },
  { id: 'swsh7-175', name: 'Glaceon V', pokemon: 'Glaceon', setName: 'Evolving Skies', illustrator: 'Narumi Sato', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/175/high.webp', dominantColor: '#7FD0E0' },
  { id: 'swsh7-184', name: 'Sylveon V', pokemon: 'Sylveon', setName: 'Evolving Skies', illustrator: 'Yuu Nishida', imageUrl: 'https://assets.tcgdex.net/en/swsh/swsh7/184/high.webp', dominantColor: '#F4A7C0' },

  // --- Celebrations (25th anniversary legendaries) ---
  { id: 'cel25-1', name: 'Ho-Oh', pokemon: 'Ho-Oh', setName: 'Celebrations', illustrator: 'Kouki Saitou', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/1/high.webp', dominantColor: '#E8A33B' },
  { id: 'cel25-2', name: 'Reshiram', pokemon: 'Reshiram', setName: 'Celebrations', illustrator: 'Aya Kusube', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/2/high.webp', dominantColor: '#D9CFC0' },
  { id: 'cel25-3', name: 'Kyogre', pokemon: 'Kyogre', setName: 'Celebrations', illustrator: 'Ryuta Fuse', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/3/high.webp', dominantColor: '#2B6FB0' },
  { id: 'cel25-4', name: 'Palkia', pokemon: 'Palkia', setName: 'Celebrations', illustrator: '5ban Graphics', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/4/high.webp', dominantColor: '#9BB7D4' },
  { id: 'cel25-5', name: 'Pikachu', pokemon: 'Pikachu', setName: 'Celebrations', illustrator: 'Mitsuhiro Arita', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/5/high.webp', dominantColor: '#F4D03F' },
  { id: 'cel25-6', name: 'Flying Pikachu V', pokemon: 'Pikachu', setName: 'Celebrations', illustrator: 'aky CG Works', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/6/high.webp', dominantColor: '#F4D03F' },
  { id: 'cel25-8', name: 'Surfing Pikachu V', pokemon: 'Pikachu', setName: 'Celebrations', illustrator: 'aky CG Works', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/8/high.webp', dominantColor: '#5FA8D8' },
  { id: 'cel25-10', name: 'Zekrom', pokemon: 'Zekrom', setName: 'Celebrations', illustrator: 'Aya Kusube', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/10/high.webp', dominantColor: '#3A3A4A' },
  { id: 'cel25-11', name: 'Mew', pokemon: 'Mew', setName: 'Celebrations', illustrator: 'Yuu Nishida', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/11/high.webp', dominantColor: '#F4A7C0' },
  { id: 'cel25-12', name: 'Xerneas', pokemon: 'Xerneas', setName: 'Celebrations', illustrator: 'AKIRA EGAWA', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/12/high.webp', dominantColor: '#5BC0DE' },
  { id: 'cel25-17', name: 'Groudon', pokemon: 'Groudon', setName: 'Celebrations', illustrator: 'Ryuta Fuse', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/17/high.webp', dominantColor: '#C0392B' },
  { id: 'cel25-19', name: 'Yveltal', pokemon: 'Yveltal', setName: 'Celebrations', illustrator: 'AKIRA EGAWA', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/19/high.webp', dominantColor: '#C0392B' },
  { id: 'cel25-20', name: 'Dialga', pokemon: 'Dialga', setName: 'Celebrations', illustrator: '5ban Graphics', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/20/high.webp', dominantColor: '#7FB0D0' },
  { id: 'cel25-22', name: 'Lugia', pokemon: 'Lugia', setName: 'Celebrations', illustrator: 'Kouki Saitou', imageUrl: 'https://assets.tcgdex.net/en/swsh/cel25/22/high.webp', dominantColor: '#C8D6E5' },
];

export const CARDS: DemoCard[] = RAW.map((card) => ({ ...card, orientation: 'portrait' }));

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
    id: 'example-base-set',
    title: 'Base Set holos',
    description: 'Nine of the 1999 Base Set holos, dark mat to make the foils pop.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      {
        id: uid('page'),
        title: 'The classics',
        rows: 3,
        cols: 3,
        backgroundColor: '#141A24',
        slots: [
          card(0, 0, 'base1-1'),
          card(0, 1, 'base1-2'),
          card(0, 2, 'base1-4'),
          card(1, 0, 'base1-6'),
          card(1, 1, 'base1-8'),
          card(1, 2, 'base1-10'),
          card(2, 0, 'base1-11'),
          card(2, 1, 'base1-15'),
          card(2, 2, 'base1-16'),
        ],
      },
    ],
  },
  {
    id: 'example-eeveelutions',
    title: 'The Eeveelutions',
    description: 'Eevee anchored in the centre, the eight evolutions around it (Evolving Skies).',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'swsh7-215',
    pages: [
      {
        id: uid('page'),
        title: 'One of each',
        rows: 3,
        cols: 3,
        backgroundColor: '#1C1726',
        slots: [
          card(0, 0, 'swsh7-172'),
          card(0, 1, 'swsh7-177'),
          card(0, 2, 'swsh7-169'),
          card(1, 0, 'swsh7-179'),
          card(1, 1, 'swsh7-125'),
          card(1, 2, 'swsh7-215'),
          card(2, 0, 'swsh7-167'),
          card(2, 1, 'swsh7-175'),
          card(2, 2, 'swsh7-184'),
        ],
      },
    ],
  },
  {
    id: 'example-kanto-151',
    title: 'Kanto starters · 151',
    description: 'Full evolution lines, then the special-illustration chase cards.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'sv03.5-199',
    pages: [
      {
        id: uid('page'),
        title: 'Evolution lines',
        rows: 3,
        cols: 3,
        backgroundColor: '#F3ECDD',
        slots: [
          card(0, 0, 'sv03.5-001'),
          card(0, 1, 'sv03.5-004'),
          card(0, 2, 'sv03.5-007'),
          card(1, 0, 'sv03.5-002'),
          card(1, 1, 'sv03.5-005'),
          card(1, 2, 'sv03.5-008'),
          card(2, 0, 'sv03.5-003'),
          card(2, 1, 'sv03.5-006'),
          card(2, 2, 'sv03.5-009'),
        ],
      },
      {
        id: uid('page'),
        title: 'Special illustrations',
        rows: 3,
        cols: 3,
        backgroundColor: '#F3ECDD',
        slots: [
          card(0, 0, 'sv03.5-166'),
          card(0, 1, 'sv03.5-168'),
          card(0, 2, 'sv03.5-170'),
          card(1, 0, 'sv03.5-198'),
          card(1, 1, 'sv03.5-199'),
          card(1, 2, 'sv03.5-200'),
          // (2,0) empty
          card(2, 1, 'sv03.5-173'),
          // (2,2) empty
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
    coverCardId: 'sv03.5-199',
    pages: [
      {
        id: uid('page'),
        title: 'Hot corner',
        rows: 3,
        cols: 3,
        backgroundColor: '#1B1410',
        slots: [
          card(0, 0, 'sv03.5-199', { rowSpan: 2, colSpan: 2, type: 'artwork' }),
          card(0, 2, 'sv03.5-004'),
          card(1, 2, 'sv03.5-005'),
          card(2, 0, 'base1-12'),
          card(2, 1, 'swsh7-169'),
          card(2, 2, 'base1-4'),
        ],
      },
    ],
  },
  {
    id: 'example-celebrations',
    title: 'Legends of Celebrations',
    description: 'A legendary grid from the 25th-anniversary set, Mew at the centre.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'cel25-22',
    pages: [
      {
        id: uid('page'),
        title: 'Box legendaries',
        rows: 3,
        cols: 3,
        backgroundColor: '#10141C',
        slots: [
          card(0, 0, 'cel25-1'),
          card(0, 1, 'cel25-22'),
          card(0, 2, 'cel25-2'),
          card(1, 0, 'cel25-3'),
          card(1, 1, 'cel25-11'),
          card(1, 2, 'cel25-17'),
          card(2, 0, 'cel25-20'),
          card(2, 1, 'cel25-4'),
          card(2, 2, 'cel25-10'),
        ],
      },
    ],
  },
  {
    id: 'example-pikachu',
    title: 'Pikachu, many ways',
    description: 'One Pikachu across eras, with the bottom row left as breathing room.',
    layoutStyle: 'single_pokemon',
    isExample: true,
    coverCardId: 'sv03.5-173',
    pages: [
      {
        id: uid('page'),
        title: 'Same face, new art',
        rows: 3,
        cols: 3,
        backgroundColor: '#FBF4D6',
        slots: [
          card(0, 0, 'base1-58'),
          card(0, 1, 'sv03.5-025'),
          card(0, 2, 'sv03.5-173'),
          card(1, 0, 'cel25-5'),
          card(1, 1, 'cel25-6'),
          card(1, 2, 'cel25-8'),
          // row 2 intentionally empty
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
    coverCardId: 'base1-2',
    pages: [
      {
        id: uid('page'),
        title: 'Blue hour',
        rows: 3,
        cols: 3,
        backgroundColor: '#E7F1F8',
        slots: [
          card(0, 0, 'base1-2'),
          card(0, 1, 'cel25-3'),
          card(0, 2, 'swsh7-172'),
          card(1, 0, 'sv03.5-170'),
          // (1,1) intentionally empty
          card(1, 2, 'swsh7-175'),
          card(2, 0, 'cel25-22'),
          card(2, 1, 'cel25-4'),
          // (2,2) intentionally empty
        ],
      },
    ],
  },
];

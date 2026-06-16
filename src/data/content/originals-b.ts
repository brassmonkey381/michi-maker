/**
 * Original example binders, part B: Celebrations, Pikachu, Ocean blues.
 *
 * These reference cards already in the bundled catalogue (src/data/sampleData.ts), so
 * `cards` is empty. Content unit "Expand originals B" grows these into multi-page binders.
 */

import { card, type ContentModule } from '@/data/content/_helpers';

export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = [
  {
    id: 'example-celebrations',
    title: 'Legends of Celebrations',
    description: 'A legendary grid from the 25th-anniversary set, Mew at the centre.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'cel25-22',
    pages: [
      {
        id: 'page-celebrations-1',
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
        id: 'page-pikachu-1',
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
        id: 'page-ocean-blues-1',
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

/**
 * Original example binders, part A: Base Set, Eeveelutions, Kanto 151, Charizard anchor.
 *
 * These reference cards already in the bundled catalogue (src/data/sampleData.ts), so
 * `cards` is empty. Content unit "Expand originals A" grows these into multi-page binders.
 */

import { card, type ContentModule } from '@/data/content/_helpers';

export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = [
  {
    id: 'example-base-set',
    title: 'Base Set holos',
    description: 'Nine of the 1999 Base Set holos, dark mat to make the foils pop.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      {
        id: 'page-base-set-1',
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
        id: 'page-eeveelutions-1',
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
        id: 'page-kanto-151-1',
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
        id: 'page-kanto-151-2',
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
        id: 'page-charizard-anchor-1',
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
];

/**
 * Original example binders, part B: Celebrations, Pikachu, Ocean blues.
 *
 * These reference cards already in the bundled catalogue (src/data/sampleData.ts), so
 * `cards` is empty. Content unit "Expand originals B" grows these into multi-page binders.
 */

import { artwork, card, insert, page, type ContentModule } from '@/data/content/_helpers';

export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = [
  {
    id: 'example-celebrations',
    title: 'Legends of Celebrations',
    description:
      'The 25th-anniversary legendaries, given room to breathe: box-art heroes, a Mew altar, and a cosmic dragon spread.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'cel25-22',
    pages: [
      // 1 — the original grid, preserved exactly.
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
      // 2 — Lugia anchor: a 2×2 hero with a quiet wing of accents.
      page(
        [
          artwork(0, 0, 'cel25-22', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'cel25-3'),
          card(1, 2, 'cel25-4'),
          insert(2, 0, '#1C2330'),
          card(2, 1, 'cel25-12'),
          card(2, 2, 'cel25-20'),
        ],
        { title: 'Lugia, guardian of the sea', rows: 3, cols: 3, backgroundColor: '#10141C' },
      ),
      // 3 — Ho-Oh anchor: warm legend on a charcoal mat, balanced top-right.
      page(
        [
          card(0, 0, 'cel25-17'),
          card(0, 1, 'cel25-19'),
          artwork(0, 2, 'cel25-1', { rowSpan: 2, colSpan: 1 }),
          insert(1, 0, '#1B1410'),
          card(1, 1, 'cel25-2'),
          // (2,0) and (2,1) left empty — embers settling.
          card(2, 2, 'cel25-17'),
        ],
        { title: 'Ho-Oh, rainbow wing', rows: 3, cols: 3, backgroundColor: '#1B1410' },
      ),
      // 4 — Mew full-page hero: one card centred on a wide mat, single accent.
      page(
        [
          insert(0, 0, '#191320'),
          artwork(0, 1, 'cel25-11', { rowSpan: 3, colSpan: 2 }),
          insert(0, 3, '#191320'),
          card(1, 0, 'cel25-12'),
          // (1,3), (2,0) left empty for stillness around the altar.
          card(2, 3, 'cel25-4'),
        ],
        { title: 'Mew, at the centre', rows: 3, cols: 4, backgroundColor: '#1C1726' },
      ),
      // 5 — cosmic dragon spread: the creation/tao quartet on a 4×4 slate canvas.
      page(
        [
          artwork(0, 0, 'cel25-2', { rowSpan: 2, colSpan: 2 }),
          artwork(0, 2, 'cel25-10', { rowSpan: 2, colSpan: 2 }),
          insert(2, 0, '#10141C'),
          card(2, 1, 'cel25-20'),
          card(2, 2, 'cel25-4'),
          insert(2, 3, '#10141C'),
          // bottom-left/right (3,0)(3,3) left empty; constellation in the gutter.
          card(3, 1, 'cel25-3'),
          card(3, 2, 'cel25-22'),
        ],
        { title: 'Dragons & cosmos', rows: 4, cols: 4, backgroundColor: '#10141C' },
      ),
      // 6 — slate color page: shared cool palette with tonal negative space.
      page(
        [
          insert(0, 0, '#2A3344'),
          card(0, 1, 'cel25-4'),
          insert(0, 2, '#3A4458'),
          card(1, 0, 'cel25-22'),
          insert(1, 1, '#1F2A3A'),
          card(1, 2, 'cel25-20'),
          insert(2, 0, '#3A4458'),
          card(2, 1, 'cel25-3'),
          insert(2, 2, '#2A3344'),
        ],
        { title: 'Slate & starlight', rows: 3, cols: 3, backgroundColor: '#141A24' },
      ),
    ],
  },
  {
    id: 'example-pikachu',
    title: 'Pikachu, many ways',
    description:
      'One Pikachu across the eras — gallery row, era heroes, a warm-yellow color page, and the two V variants.',
    layoutStyle: 'single_pokemon',
    isExample: true,
    coverCardId: 'sv03.5-173',
    pages: [
      // 1 — the original gallery row, preserved exactly.
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
      // 2 — the 1999 hero: a 2×2 Base Set Pikachu, alone on cream.
      page(
        [
          artwork(0, 0, 'base1-58', { rowSpan: 2, colSpan: 2 }),
          insert(0, 2, '#F3E6B0'),
          // (1,2) left empty
          // (2,0)(2,1) left empty — lots of breathing room below the hero.
          card(2, 2, 'sv03.5-025'),
        ],
        { title: 'First print, 1999', rows: 3, cols: 3, backgroundColor: '#FBF4D6' },
      ),
      // 3 — modern hero: the 151 promo Pikachu spanning four pockets.
      page(
        [
          card(0, 0, 'sv03.5-025'),
          insert(0, 1, '#F7EFC8'),
          card(0, 2, 'cel25-5'),
          card(1, 0, 'base1-58'),
          artwork(1, 1, 'sv03.5-173', { rowSpan: 2, colSpan: 2 }),
          // (2,0) left empty
        ],
        { title: 'A modern classic', rows: 3, cols: 3, backgroundColor: '#FBF4D6' },
      ),
      // 4 — warm-yellow color page: gold tonal inserts, deliberate empty pockets.
      page(
        [
          insert(0, 0, '#F2D86B'),
          card(0, 1, 'cel25-5'),
          insert(0, 2, '#F7E9A8'),
          insert(0, 3, '#EFCB57'),
          card(1, 0, 'sv03.5-025'),
          insert(1, 1, '#F7E9A8'),
          card(1, 2, 'base1-58'),
          insert(1, 3, '#F2D86B'),
          // entire bottom row empty — a wide warm margin.
        ],
        { title: 'Warm yellow', rows: 3, cols: 4, backgroundColor: '#FFF8E0' },
      ),
      // 5 — Pikachu V spread: the two aky CG Works variants, framed.
      page(
        [
          insert(0, 0, '#F3E6B0'),
          card(0, 1, 'cel25-6'),
          card(0, 2, 'cel25-8'),
          insert(0, 3, '#E7F1F8'),
          card(1, 0, 'cel25-5'),
          artwork(1, 1, 'cel25-8', { rowSpan: 2, colSpan: 2 }),
          card(1, 3, 'base1-58'),
          card(2, 0, 'sv03.5-173'),
          insert(2, 3, '#F3E6B0'),
        ],
        { title: 'Flying & surfing V', rows: 3, cols: 4, backgroundColor: '#FBF4D6' },
      ),
    ],
  },
  {
    id: 'example-ocean-blues',
    title: 'Ocean blues',
    description:
      'A cool-blue palette study — tonal tide pages, a Kyogre full-page swell, and water-type anchors with deliberate gaps.',
    layoutStyle: 'color_theme',
    isExample: true,
    coverCardId: 'base1-2',
    pages: [
      // 1 — the original blue-hour grid, preserved exactly.
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
      // 2 — tonal tide page: three blues woven with cards, lots of negative space.
      page(
        [
          insert(0, 0, '#9BB7D4'),
          card(0, 1, 'swsh7-172'),
          insert(0, 2, '#E7F1F8'),
          insert(0, 3, '#2B6FB0'),
          card(1, 0, 'cel25-3'),
          insert(1, 1, '#E7F1F8'),
          insert(1, 2, '#9BB7D4'),
          card(1, 3, 'swsh7-175'),
          // entire bottom row empty — the shallows.
        ],
        { title: 'Shades of tide', rows: 3, cols: 4, backgroundColor: '#DCE9F4' },
      ),
      // 3 — Blastoise anchor: a 2×2 hero on a deep mat with cool accents.
      page(
        [
          artwork(0, 0, 'base1-2', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'sv03.5-170'),
          insert(1, 2, '#1C2A3A'),
          insert(2, 0, '#16202C'),
          card(2, 1, 'swsh7-172'),
          card(2, 2, 'sv03.5-200'),
        ],
        { title: 'Blastoise, the depths', rows: 3, cols: 3, backgroundColor: '#10141C' },
      ),
      // 4 — Kyogre full-page swell: one big artwork, two quiet accents.
      page(
        [
          artwork(0, 0, 'cel25-3', { rowSpan: 3, colSpan: 2 }),
          insert(0, 2, '#1C2A3A'),
          card(0, 3, 'cel25-22'),
          insert(1, 2, '#16202C'),
          insert(1, 3, '#1C2A3A'),
          card(2, 2, 'cel25-4'),
          // (2,3) left empty — open water.
        ],
        { title: 'Kyogre, the great swell', rows: 3, cols: 4, backgroundColor: '#0E1620' },
      ),
      // 5 — water anchors: Lugia & Kyogre paired across a 4×4 cream-blue canvas.
      page(
        [
          artwork(0, 0, 'cel25-22', { rowSpan: 2, colSpan: 2 }),
          insert(0, 2, '#C7DBEC'),
          card(0, 3, 'swsh7-172'),
          card(1, 2, 'sv03.5-170'),
          insert(1, 3, '#9BB7D4'),
          insert(2, 0, '#C7DBEC'),
          card(2, 1, 'swsh7-175'),
          artwork(2, 2, 'cel25-3', { rowSpan: 2, colSpan: 2 }),
          card(3, 0, 'base1-2'),
          // (3,1) left empty — foam.
        ],
        { title: 'Sea legends', rows: 4, cols: 4, backgroundColor: '#E7F1F8' },
      ),
      // 6 — palest color page: near-monochrome tonal study with breathing room.
      page(
        [
          insert(0, 0, '#C7DBEC'),
          card(0, 1, 'swsh7-175'),
          insert(0, 2, '#9BB7D4'),
          card(1, 0, 'cel25-4'),
          insert(1, 1, '#E7F1F8'),
          card(1, 2, 'sv03.5-170'),
          insert(2, 0, '#9BB7D4'),
          card(2, 1, 'swsh7-172'),
          insert(2, 2, '#C7DBEC'),
        ],
        { title: 'Glacier light', rows: 3, cols: 3, backgroundColor: '#EEF5FB' },
      ),
    ],
  },
];

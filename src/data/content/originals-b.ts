/**
 * Original example binders, part B: Celebrations, Pikachu, Ocean blues.
 *
 * These reference cards already in the bundled catalogue (src/data/sampleData.ts), so
 * `cards` is empty. Content unit "Expand originals B" grows these into multi-page binders.
 *
 * Card-size realism: every standard card is exactly one pocket (1×1). Oversized promos use
 * `jumbo(...)` (a real 2×2 footprint, auto-badged "JUMBO"), and V-UNIONs use `...vunion(...)`
 * (four real piece-cards tiling a 2×2). Negative space is tonal `insert`s sized to real michi
 * insert formats (1×1, 1×2/2×1, 2×2, or full-page 3×3) plus deliberately empty pockets.
 */

import {
  ART,
  artPanel,
  card,
  insert,
  jumbo,
  page,
  sliceRegion,
  vunion,
  JUMBO,
  VUNION,
  type ContentModule,
} from '@/data/content/_helpers';

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
      // art page: a thunderstorm block with a moonlit-water column, over the cosmic dragons.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.lightning),
          artPanel(0, 2, ART.edoMoon, { rowSpan: 2, colSpan: 1 }),
          card(2, 0, 'cel25-10'),
          card(2, 1, 'cel25-2'),
          card(2, 2, 'cel25-20'),
        ],
        { title: 'The cosmic dragons', rows: 3, cols: 3, backgroundColor: '#10141C' },
      ),
      // 2 — Lugia, the jumbo box-art hero: an oversized 2×2 promo with a quiet wing of accents.
      page(
        [
          jumbo(0, 0, JUMBO.lugia),
          card(0, 2, 'cel25-3'),
          card(1, 2, 'cel25-4'),
          insert(2, 0, '#1C2330'),
          card(2, 1, 'cel25-12'),
          card(2, 2, 'cel25-20'),
        ],
        { title: 'Lugia, guardian of the sea', rows: 3, cols: 3, backgroundColor: '#10141C' },
      ),
      // 3 — Ho-Oh anchor: warm legend framed 1×1 on a charcoal mat with a tall tonal margin.
      page(
        [
          card(0, 0, 'cel25-17'),
          card(0, 1, 'cel25-19'),
          card(0, 2, 'cel25-1'),
          insert(1, 0, '#1B1410', { rowSpan: 2, colSpan: 1 }),
          card(1, 1, 'cel25-2'),
          // (1,2) and (2,1) left empty — embers settling.
          card(2, 2, 'cel25-17'),
        ],
        { title: 'Ho-Oh, rainbow wing', rows: 3, cols: 3, backgroundColor: '#1B1410' },
      ),
      // 4 — Mewtwo, the jumbo altar: an oversized 2×2 promo centred between tonal margins.
      page(
        [
          insert(0, 0, '#191320', { rowSpan: 3, colSpan: 1 }),
          jumbo(0, 1, JUMBO.mewtwo),
          insert(0, 3, '#191320', { rowSpan: 3, colSpan: 1 }),
          card(2, 1, 'cel25-11'),
          card(2, 2, 'cel25-12'),
        ],
        { title: 'Mewtwo, at the altar', rows: 3, cols: 4, backgroundColor: '#1C1726' },
      ),
      // 5 — Mewtwo V-UNION spread: four real pieces tiling a 2×2, with a constellation of accents.
      page(
        [
          ...vunion(0, 0, VUNION.mewtwo),
          insert(0, 2, '#10141C', { rowSpan: 2, colSpan: 1 }),
          card(0, 3, 'cel25-10'),
          card(1, 3, 'cel25-2'),
          card(2, 0, 'cel25-20'),
          card(2, 1, 'cel25-4'),
          card(2, 2, 'cel25-3'),
          card(2, 3, 'cel25-22'),
        ],
        { title: 'Mewtwo, four faces', rows: 3, cols: 4, backgroundColor: '#10141C' },
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
      'One Pikachu across the eras — gallery row, era heroes, a warm-yellow color page, and the V-UNION quartet.',
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
      // 2 — the jumbo Pikachu: an oversized 2×2 promo, alone on cream with a tonal wing.
      page(
        [
          jumbo(0, 0, JUMBO.pikachu),
          insert(0, 2, '#F3E6B0', { rowSpan: 2, colSpan: 1 }),
          // (2,0)(2,1) left empty — lots of breathing room below the hero.
          card(2, 2, 'sv03.5-025'),
        ],
        { title: 'Big and bold', rows: 3, cols: 3, backgroundColor: '#FBF4D6' },
      ),
      // 3 — era heroes: 1999, 151 and Celebrations Pikachus, each framed 1×1 on cream.
      page(
        [
          card(0, 0, 'base1-58'),
          insert(0, 1, '#F7EFC8'),
          card(0, 2, 'sv03.5-025'),
          card(1, 0, 'cel25-5'),
          card(1, 1, 'sv03.5-173'),
          card(1, 2, 'cel25-6'),
          // (2,0) left empty
          card(2, 1, 'sv03.5-025'),
          // (2,2) left empty
        ],
        { title: 'A face for every era', rows: 3, cols: 3, backgroundColor: '#FBF4D6' },
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
      // 5 — Pikachu V-UNION spread: the four real pieces tiling a 2×2, framed by accents.
      page(
        [
          ...vunion(0, 0, VUNION.pikachu),
          insert(0, 2, '#F3E6B0'),
          card(0, 3, 'cel25-6'),
          insert(1, 2, '#E7F1F8'),
          card(1, 3, 'cel25-8'),
          card(2, 0, 'sv03.5-173'),
          card(2, 1, 'base1-58'),
          card(2, 2, 'cel25-5'),
          insert(2, 3, '#F3E6B0'),
        ],
        { title: 'Four-piece union', rows: 3, cols: 4, backgroundColor: '#FBF4D6' },
      ),
    ],
  },
  {
    id: 'example-ocean-blues',
    title: 'Ocean blues',
    description:
      'A cool-blue palette study — tonal tide pages, jumbo water heroes, a Greninja V-UNION, and anchors with deliberate gaps.',
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
      // 2 — art page: a Great-Wave block with a sea-coast column fills the top 2×3,
      // with a row of cool-blue cards beneath.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.greatWave),
          artPanel(0, 2, ART.edoSea, { rowSpan: 2, colSpan: 1 }),
          card(2, 0, 'base1-2'),
          card(2, 1, 'swsh7-172'),
          card(2, 2, 'cel25-3'),
        ],
        { title: 'The deep', rows: 3, cols: 3, backgroundColor: '#0E1620' },
      ),
      // 3 — tonal tide page: blues woven with cards, a wide insert and lots of negative space.
      page(
        [
          insert(0, 0, '#9BB7D4'),
          card(0, 1, 'swsh7-172'),
          insert(0, 2, '#E7F1F8', { rowSpan: 1, colSpan: 2 }),
          card(1, 0, 'cel25-3'),
          insert(1, 1, '#9BB7D4'),
          insert(1, 2, '#2B6FB0'),
          card(1, 3, 'swsh7-175'),
          // entire bottom row empty — the shallows.
        ],
        { title: 'Shades of tide', rows: 3, cols: 4, backgroundColor: '#DCE9F4' },
      ),
      // 3 — Blastoise, the jumbo deep-water hero: an oversized 2×2 promo with cool accents.
      page(
        [
          jumbo(0, 0, JUMBO.blastoise),
          card(0, 2, 'sv03.5-170'),
          insert(1, 2, '#1C2A3A'),
          insert(2, 0, '#16202C'),
          card(2, 1, 'swsh7-172'),
          card(2, 2, 'sv03.5-200'),
        ],
        { title: 'Blastoise, the depths', rows: 3, cols: 3, backgroundColor: '#10141C' },
      ),
      // 4 — Lugia, the jumbo swell: an oversized 2×2 promo against a full-height tonal margin.
      page(
        [
          jumbo(0, 0, JUMBO.lugia),
          insert(0, 2, '#1C2A3A', { rowSpan: 3, colSpan: 1 }),
          card(0, 3, 'cel25-22'),
          card(1, 3, 'cel25-3'),
          card(2, 0, 'sv03.5-170'),
          card(2, 1, 'cel25-4'),
          // (2,3) left empty — open water.
        ],
        { title: 'Lugia, the great swell', rows: 3, cols: 4, backgroundColor: '#0E1620' },
      ),
      // 5 — Greninja V-UNION spread: four real pieces tiling a 2×2 across a cream-blue canvas.
      page(
        [
          ...vunion(0, 0, VUNION.greninja),
          insert(0, 2, '#C7DBEC'),
          card(0, 3, 'swsh7-172'),
          card(1, 2, 'sv03.5-170'),
          insert(1, 3, '#9BB7D4'),
          insert(2, 0, '#C7DBEC'),
          card(2, 1, 'swsh7-175'),
          card(2, 2, 'cel25-3'),
          card(2, 3, 'base1-2'),
          card(3, 0, 'cel25-22'),
          card(3, 1, 'sv03.5-200'),
          insert(3, 2, '#9BB7D4', { rowSpan: 1, colSpan: 2 }),
        ],
        { title: 'Greninja, sea legends', rows: 4, cols: 4, backgroundColor: '#E7F1F8' },
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

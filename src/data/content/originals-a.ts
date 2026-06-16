/**
 * Original example binders, part A: Base Set, Eeveelutions, Kanto 151, Charizard anchor.
 *
 * Every card referenced here already lives in the bundled catalogue (src/data/sampleData.ts),
 * so `cards` stays empty. Content unit "Expand originals A" grows these into rich,
 * multi-page michi binders (4–8 pages each) with negative space and 2×2 hero spans.
 */

import { artwork, card, insert, page, type ContentModule } from '@/data/content/_helpers';

export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = [
  {
    id: 'example-base-set',
    title: 'Base Set holos',
    description: 'The 1999 Base Set foils — a Charizard anchor, a dark foil wall, and a cream Sugimori page.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'base1-4',
    pages: [
      // Page 1 — kept: the classics.
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
      // Page 2 — Charizard hero anchor (2×2 full-bleed) with foil accents + empty pockets.
      page(
        [
          artwork(0, 0, 'base1-4', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'base1-2'),
          // (1,2) intentionally empty — let the hero breathe.
          card(2, 0, 'base1-6'),
          // (2,1) empty
          card(2, 2, 'base1-10'),
        ],
        { title: 'Charizard, anchored', backgroundColor: '#1B1410' },
      ),
      // Page 3 — the foil wall: a packed grid of holos on the darkest mat.
      page(
        [
          card(0, 0, 'base1-1'),
          card(0, 1, 'base1-5'),
          card(0, 2, 'base1-9'),
          card(1, 0, 'base1-8'),
          card(1, 1, 'base1-13'),
          card(1, 2, 'base1-14'),
          card(2, 0, 'base1-11'),
          card(2, 1, 'base1-15'),
          card(2, 2, 'base1-16'),
        ],
        { title: 'Foil wall', backgroundColor: '#10141C' },
      ),
      // Page 4 — cream Sugimori page: warm mat, sparse, tonal inserts framing two heroes.
      page(
        [
          insert(0, 0, '#E7D8B8'),
          card(0, 1, 'base1-3'),
          insert(0, 2, '#E7D8B8'),
          card(1, 0, 'base1-12'),
          // (1,1) empty centre — negative space.
          card(1, 2, 'base1-2'),
          insert(2, 0, '#E7D8B8'),
          card(2, 1, 'base1-16'),
          insert(2, 2, '#E7D8B8'),
        ],
        { title: 'Sugimori, on cream', backgroundColor: '#F3ECDD' },
      ),
      // Page 5 — a single full-page Charizard spread (whole 3×3) for a closer.
      page(
        [
          artwork(0, 0, 'base1-4', { rowSpan: 3, colSpan: 3 }),
        ],
        { title: 'Full bleed', backgroundColor: '#1B1410' },
      ),
    ],
  },
  {
    id: 'example-eeveelutions',
    title: 'The Eeveelutions',
    description: 'Eevee and its evolutions — one of each, per-evolution anchors, and a cool-vs-warm split.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'swsh7-215',
    pages: [
      // Page 1 — kept: one of each.
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
      // Page 2 — Umbreon VMAX hero anchor (2×2 full-bleed) on a moonlit mat.
      page(
        [
          artwork(0, 0, 'swsh7-215', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'swsh7-184'),
          // (1,2) empty
          // (2,0) empty
          card(2, 1, 'swsh7-167'),
          card(2, 2, 'swsh7-179'),
        ],
        { title: 'Umbreon, by moonlight', backgroundColor: '#10141C' },
      ),
      // Page 3 — Eevee spotlight: the origin card centred, inserts breathing around it.
      page(
        [
          insert(0, 0, '#2A2336'),
          card(0, 1, 'swsh7-172'),
          insert(0, 2, '#2A2336'),
          card(1, 0, 'swsh7-169'),
          card(1, 1, 'swsh7-125'),
          card(1, 2, 'swsh7-177'),
          insert(2, 0, '#2A2336'),
          card(2, 1, 'swsh7-175'),
          insert(2, 2, '#2A2336'),
        ],
        { title: 'Eevee, the origin', backgroundColor: '#1C1726' },
      ),
      // Page 4 — cool vs warm: a 3×4 split, cool evolutions left, warm right, tonal seam.
      page(
        [
          // Cool column block.
          card(0, 0, 'swsh7-177'),
          card(1, 0, 'swsh7-169'),
          card(2, 0, 'swsh7-179'),
          insert(0, 1, '#243042'),
          insert(1, 1, '#243042'),
          insert(2, 1, '#243042'),
          // Warm column block.
          insert(0, 2, '#3A2420'),
          insert(1, 2, '#3A2420'),
          insert(2, 2, '#3A2420'),
          card(0, 3, 'swsh7-172'),
          card(1, 3, 'swsh7-175'),
          card(2, 3, 'swsh7-167'),
        ],
        { title: 'Cool / warm', rows: 3, cols: 4, backgroundColor: '#141A24' },
      ),
      // Page 5 — Sylveon/Glaceon pairing with deliberate empty pockets.
      page(
        [
          card(0, 0, 'swsh7-184'),
          // (0,1) empty
          card(0, 2, 'swsh7-177'),
          // (1,*) empty centre band — negative space.
          card(2, 0, 'swsh7-175'),
          // (2,1) empty
          card(2, 2, 'swsh7-167'),
        ],
        { title: 'Four corners', backgroundColor: '#1C1726' },
      ),
    ],
  },
  {
    id: 'example-kanto-151',
    title: 'Kanto starters · 151',
    description: 'Full evolution lines, the SIR chases, starter-line anchors, and a Pikachu/Mew page.',
    layoutStyle: 'themed_story',
    isExample: true,
    coverCardId: 'sv03.5-199',
    pages: [
      // Page 1 — kept: evolution lines.
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
      // Page 2 — kept: special illustrations.
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
      // Page 3 — Charizard ex full-page hero (2×2) closing the fire line.
      page(
        [
          artwork(0, 0, 'sv03.5-199', { rowSpan: 2, colSpan: 2 }),
          card(0, 2, 'sv03.5-004'),
          card(1, 2, 'sv03.5-005'),
          card(2, 0, 'sv03.5-006'),
          // (2,1) empty
          card(2, 2, 'sv03.5-198'),
        ],
        { title: 'Charizard ex', backgroundColor: '#1B1410' },
      ),
      // Page 4 — starter trio anchors on a soft cream mat, each line led by its starter.
      page(
        [
          card(0, 0, 'sv03.5-001'),
          card(0, 1, 'sv03.5-004'),
          card(0, 2, 'sv03.5-007'),
          insert(1, 0, '#E7D8B8'),
          insert(1, 1, '#E7D8B8'),
          insert(1, 2, '#E7D8B8'),
          card(2, 0, 'sv03.5-003'),
          card(2, 1, 'sv03.5-006'),
          card(2, 2, 'sv03.5-009'),
        ],
        { title: 'Starts & finishes', backgroundColor: '#FBF4D6' },
      ),
      // Page 5 — Pikachu & Mew page: two icons, lots of pastel air.
      page(
        [
          insert(0, 0, '#E7F1F8'),
          card(0, 1, 'sv03.5-025'),
          insert(0, 2, '#E7F1F8'),
          // (1,*) empty band
          insert(2, 0, '#F7E9F0'),
          card(2, 1, 'sv03.5-150'),
          insert(2, 2, '#F7E9F0'),
        ],
        { title: 'Pikachu & Mew', backgroundColor: '#E7F1F8' },
      ),
      // Page 6 — the chase wall: every SIR together on a dark mat to finish.
      page(
        [
          card(0, 0, 'sv03.5-166'),
          card(0, 1, 'sv03.5-168'),
          card(0, 2, 'sv03.5-170'),
          card(1, 0, 'sv03.5-173'),
          card(1, 1, 'sv03.5-198'),
          card(1, 2, 'sv03.5-200'),
          // (2,0) empty
          card(2, 1, 'sv03.5-199'),
          // (2,2) empty
        ],
        { title: 'The chase wall', backgroundColor: '#10141C' },
      ),
    ],
  },
  {
    id: 'example-charizard-anchor',
    title: 'Charizard, anchored',
    description: 'A 2×2 hero, a Charmander→Charizard evolution anchor, and a fiery color page.',
    layoutStyle: 'anchor',
    isExample: true,
    coverCardId: 'sv03.5-199',
    pages: [
      // Page 1 — kept: hot corner.
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
      // Page 2 — the evolution line: Charmander → Charmeleon → Charizard, top row, hero below.
      page(
        [
          card(0, 0, 'sv03.5-004'),
          card(0, 1, 'sv03.5-005'),
          card(0, 2, 'sv03.5-006'),
          artwork(1, 0, 'sv03.5-199', { rowSpan: 2, colSpan: 2 }),
          // (1,2) empty
          card(2, 2, 'base1-4'),
        ],
        { title: 'The line', backgroundColor: '#1B1410' },
      ),
      // Page 3 — fiery color page: warm holos + warm tonal inserts, matching mat.
      // base1-4 Charizard, base1-12 Ninetales, base1-14 Raichu — all warm-toned.
      page(
        [
          card(0, 0, 'base1-4'),
          insert(0, 1, '#3A2008'),
          card(0, 2, 'base1-12'),
          insert(1, 0, '#3A2008'),
          card(1, 1, 'sv03.5-006'),
          insert(1, 2, '#3A2008'),
          card(2, 0, 'base1-14'),
          insert(2, 1, '#3A2008'),
          card(2, 2, 'sv03.5-004'),
        ],
        { title: 'All fire', backgroundColor: '#241406' },
      ),
      // Page 4 — full-page Charizard spread (whole 3×3).
      page(
        [
          artwork(0, 0, 'base1-4', { rowSpan: 3, colSpan: 3 }),
        ],
        { title: 'Full bleed', backgroundColor: '#1B1410' },
      ),
      // Page 5 — afterglow: a sparse closer, two cards in opposite corners.
      page(
        [
          card(0, 0, 'sv03.5-199'),
          // wide empty middle — embers settling.
          card(2, 2, 'base1-4'),
        ],
        { title: 'Afterglow', backgroundColor: '#10141C' },
      ),
    ],
  },
];

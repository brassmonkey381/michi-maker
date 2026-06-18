/**
 * Original example binders, part A: Base Set, Eeveelutions, Kanto 151, Charizard anchor.
 *
 * Every standard card referenced here already lives in the bundled catalogue
 * (src/data/sampleData.ts), so `cards` stays empty. Sizes are card-size realistic:
 * every standard card is exactly 1×1 (one pocket), oversized promos use `jumbo` (2×2),
 * and V-UNIONs use `vunion` (four real piece-cards tiling a 2×2). Tonal `insert`s and
 * intentional empty pockets carry the michi negative space.
 */

import {
  ART,
  JUMBO,
  VUNION,
  artPanel,
  card,
  insert,
  jumbo,
  page,
  sliceRegion,
  vunion,
  type ContentModule,
} from '@/data/content/_helpers';

export const cards: ContentModule['cards'] = [];

export const binders: ContentModule['binders'] = [
  {
    id: 'example-base-set',
    title: 'Base Set holos',
    description: 'The 1999 Base Set foils — a Blastoise jumbo anchor, a dark foil wall, and a cream Sugimori page.',
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
      // Page 2 — Blastoise jumbo hero (real oversized promo, 2×2) with foil accents + sea art.
      page(
        [
          jumbo(0, 0, JUMBO.blastoise),
          card(0, 2, 'base1-2'),
          artPanel(1, 2, ART.greatWave),
          card(2, 0, 'base1-6'),
          artPanel(2, 1, ART.edoSea),
          card(2, 2, 'base1-10'),
        ],
        { title: 'Blastoise, anchored', backgroundColor: '#10141C' },
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
      // Page 5 — Charizard closer: the focal holo flanked by flame art, empty bands above/below.
      page(
        [
          // (0,*) empty top band.
          artPanel(1, 0, ART.redFuji),
          card(1, 1, 'base1-4'),
          artPanel(1, 2, ART.edoFireworks),
          // (2,*) empty bottom band — embers settling.
        ],
        { title: 'One last holo', backgroundColor: '#1B1410' },
      ),
    ],
  },
  {
    id: 'example-eeveelutions',
    title: 'The Eeveelutions',
    description: 'Eevee and its evolutions — one of each, an Umbreon jumbo anchor, and a cool-vs-warm split.',
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
      // Page 2 — Umbreon jumbo hero (real oversized promo, 2×2) on a moonlit mat, moon art beside it.
      page(
        [
          jumbo(0, 0, JUMBO.umbreon),
          card(0, 2, 'swsh7-184'),
          artPanel(1, 2, ART.edoMoon),
          artPanel(2, 0, ART.edoSnow),
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
      // Page 4 — cool vs warm: a 3×4 split, cool evolutions left, warm right, with an art seam
      // down the middle — a frost column meeting a flame column.
      page(
        [
          card(0, 0, 'swsh7-177'),
          card(1, 0, 'swsh7-169'),
          card(2, 0, 'swsh7-179'),
          ...sliceRegion(0, 1, 3, 1, ART.edoSnow),
          ...sliceRegion(0, 2, 3, 1, ART.edoFireworks),
          card(0, 3, 'swsh7-172'),
          card(1, 3, 'swsh7-175'),
          card(2, 3, 'swsh7-167'),
        ],
        { title: 'Cool / warm', rows: 3, cols: 4, backgroundColor: '#141A24' },
      ),
      // Page 5 — four corner cards with a moonlit art band threaded through the centre.
      page(
        [
          card(0, 0, 'swsh7-184'),
          // (0,1) empty
          card(0, 2, 'swsh7-177'),
          ...sliceRegion(1, 0, 1, 3, ART.edoMoon),
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
    description: 'Full evolution lines, the SIR chases, a Charizard jumbo anchor, and a Pikachu V-UNION page.',
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
      // Page 3 — Charizard jumbo hero (real oversized promo, 2×2) closing the fire line, ember art below.
      page(
        [
          jumbo(0, 0, JUMBO.charizard),
          card(0, 2, 'sv03.5-004'),
          card(1, 2, 'sv03.5-005'),
          card(2, 0, 'sv03.5-006'),
          artPanel(2, 1, ART.redFuji),
          card(2, 2, 'sv03.5-198'),
        ],
        { title: 'Charizard ex', backgroundColor: '#1B1410' },
      ),
      // Page 4 — starter trio anchors (starters above, finals below) split by a garden art band.
      page(
        [
          card(0, 0, 'sv03.5-001'),
          card(0, 1, 'sv03.5-004'),
          card(0, 2, 'sv03.5-007'),
          ...sliceRegion(1, 0, 1, 3, ART.edoGreen),
          card(2, 0, 'sv03.5-003'),
          card(2, 1, 'sv03.5-006'),
          card(2, 2, 'sv03.5-009'),
        ],
        { title: 'Starts & finishes', backgroundColor: '#FBF4D6' },
      ),
      // Page 5 — Pikachu V-UNION page: four real piece-cards tile the 2×2 hero, Mew alongside,
      // a thunderstorm band crackling across the bottom.
      page(
        [
          ...vunion(0, 0, VUNION.pikachu),
          artPanel(0, 2, ART.edoSky),
          card(1, 2, 'sv03.5-150'),
          ...sliceRegion(2, 0, 1, 3, ART.lightning),
        ],
        { title: 'Pikachu V-UNION & Mew', backgroundColor: '#E7F1F8' },
      ),
      // Page 6 — the chase wall: every SIR together on a dark mat, the Charizard ex flanked by flame art.
      page(
        [
          card(0, 0, 'sv03.5-166'),
          card(0, 1, 'sv03.5-168'),
          card(0, 2, 'sv03.5-170'),
          card(1, 0, 'sv03.5-173'),
          card(1, 1, 'sv03.5-198'),
          card(1, 2, 'sv03.5-200'),
          artPanel(2, 0, ART.redFuji),
          card(2, 1, 'sv03.5-199'),
          artPanel(2, 2, ART.edoFireworks),
        ],
        { title: 'The chase wall', backgroundColor: '#10141C' },
      ),
    ],
  },
  {
    id: 'example-charizard-anchor',
    title: 'Charizard, anchored',
    description: 'A jumbo Charizard hero, a Charmander→Charizard evolution line, and a fiery color page.',
    layoutStyle: 'anchor',
    isExample: true,
    coverCardId: 'sv03.5-199',
    pages: [
      // Page 1 — hot corner: the Charizard jumbo (real oversized promo, 2×2) anchors the corner.
      {
        id: 'page-charizard-anchor-1',
        title: 'Hot corner',
        rows: 3,
        cols: 3,
        backgroundColor: '#1B1410',
        slots: [
          jumbo(0, 0, JUMBO.charizard),
          card(0, 2, 'sv03.5-004'),
          card(1, 2, 'sv03.5-005'),
          card(2, 0, 'base1-12'),
          card(2, 1, 'swsh7-169'),
          card(2, 2, 'base1-4'),
        ],
      },
      // Page 2 — the evolution line: Charmander → Charmeleon → Charizard, the foot of the page
      // banked with flame art (empty mid-sides keep the line breathing).
      page(
        [
          card(0, 0, 'sv03.5-004'),
          card(0, 1, 'sv03.5-005'),
          card(0, 2, 'sv03.5-006'),
          // (1,0) empty
          card(1, 1, 'sv03.5-199'),
          // (1,2) empty
          artPanel(2, 0, ART.redFuji),
          card(2, 1, 'base1-4'),
          artPanel(2, 2, ART.edoFireworks),
        ],
        { title: 'The line', backgroundColor: '#1B1410' },
      ),
      // Page 3 — fiery color page: warm holos woven with a cross of flame art on a matching mat.
      // base1-4 Charizard, base1-12 Ninetales, base1-14 Raichu — all warm-toned.
      page(
        [
          card(0, 0, 'base1-4'),
          artPanel(0, 1, ART.redFuji),
          card(0, 2, 'base1-12'),
          artPanel(1, 0, ART.edoFireworks),
          card(1, 1, 'sv03.5-006'),
          artPanel(1, 2, ART.edoFireworks),
          card(2, 0, 'base1-14'),
          artPanel(2, 1, ART.redFuji),
          card(2, 2, 'sv03.5-004'),
        ],
        { title: 'All fire', backgroundColor: '#241406' },
      ),
      // Page 4 — Charizard jumbo spread: the oversized promo fills a 2×2 hero, wrapped in flame art
      // (a fireworks column up the right, a Red-Fuji banner across the foot).
      page(
        [
          jumbo(0, 0, JUMBO.charizard),
          ...sliceRegion(0, 2, 2, 1, ART.edoFireworks),
          ...sliceRegion(2, 0, 1, 3, ART.redFuji),
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

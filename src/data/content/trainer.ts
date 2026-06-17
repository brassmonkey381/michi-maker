/**
 * Content module: Trainer binder — Misty, Cerulean Gym leader (Water).
 *
 * A single curated "michi" binder built around the trainer character Misty. Page layout
 * follows the michi method, tuned to the brief's strict per-page rules:
 *   - Every page is a 3×3 grid.
 *   - At most SIX pockets hold Pokémon `card`s.
 *   - At least THREE pockets are full-bleed `artPanel` artwork — all water-themed, drawn
 *     from the playground art library (ART.oceanWide / ART.oceanTall).
 *   - The remaining pockets are left out of `slots` entirely → negative space (the michi way).
 *
 * No slot overlaps another and every footprint sits inside the 3×3 grid (verified per page).
 *
 * Cards are real official TCG art served from the TCGdex CDN — the classic 2000 Gym Heroes /
 * Gym Challenge "Misty's …" line (Ken Sugimori & Atsuko Nishida) plus the 2025 Destined Rivals
 * (Surging Sparks era, set sv10) modern Misty cards. Every image URL was verified to return 200.
 * These ids are NOT in the bundled catalogue, so this module declares them below.
 */

import {
  artPanel,
  card,
  defineCard,
  page,
  ART,
  type ContentModule,
} from '@/data/content/_helpers';

// Cool-blue michi mats — deep cerulean inks for the canvas, frost tones for the breathers.
const ABYSS = '#10141C'; // near-black cerulean — makes the holos pop
const TIDE = '#1C2A3A'; // deep gym-pool blue
const FROST = '#E7F1F8'; // pale frosted glass
const MIST = '#DCE9F4'; // soft sea-mist

// Every card referenced by this binder, declared with verified TCGdex art.
export const cards: ContentModule['cards'] = [
  // ── Cover: the trainer herself (Gym Heroes, 2000) ─────────────────────────
  defineCard({
    id: 'gym1-18',
    name: 'Misty',
    pokemon: undefined,
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/18/high.webp',
    dominantColor: '#E9913C',
  }),

  // ── Gym Heroes — Misty's classic team (2000) ──────────────────────────────
  defineCard({
    id: 'gym1-9',
    name: "Misty's Seadra",
    pokemon: 'Seadra',
    setName: 'Gym Heroes',
    illustrator: 'Atsuko Nishida',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/9/high.webp',
    dominantColor: '#2E6F9E',
  }),
  defineCard({
    id: 'gym1-10',
    name: "Misty's Tentacruel",
    pokemon: 'Tentacruel',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/10/high.webp',
    dominantColor: '#3F6FA8',
  }),
  defineCard({
    id: 'gym1-29',
    name: "Misty's Cloyster",
    pokemon: 'Cloyster',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/29/high.webp',
    dominantColor: '#4A5A86',
  }),
  defineCard({
    id: 'gym1-30',
    name: "Misty's Goldeen",
    pokemon: 'Goldeen',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/30/high.webp',
    dominantColor: '#D8743A',
  }),
  defineCard({
    id: 'gym1-31',
    name: "Misty's Poliwrath",
    pokemon: 'Poliwrath',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/31/high.webp',
    dominantColor: '#2C6E9B',
  }),
  defineCard({
    id: 'gym1-32',
    name: "Misty's Tentacool",
    pokemon: 'Tentacool',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/32/high.webp',
    dominantColor: '#3E73A6',
  }),
  defineCard({
    id: 'gym1-53',
    name: "Misty's Poliwhirl",
    pokemon: 'Poliwhirl',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/53/high.webp',
    dominantColor: '#3A77AB',
  }),
  defineCard({
    id: 'gym1-54',
    name: "Misty's Psyduck",
    pokemon: 'Psyduck',
    setName: 'Gym Heroes',
    illustrator: 'Atsuko Nishida',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/54/high.webp',
    dominantColor: '#E5C24A',
  }),
  defineCard({
    id: 'gym1-55',
    name: "Misty's Seaking",
    pokemon: 'Seaking',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/55/high.webp',
    dominantColor: '#D85F3A',
  }),
  defineCard({
    id: 'gym1-56',
    name: "Misty's Starmie",
    pokemon: 'Starmie',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/56/high.webp',
    dominantColor: '#7A52A0',
  }),
  defineCard({
    id: 'gym1-86',
    name: "Misty's Horsea",
    pokemon: 'Horsea',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/86/high.webp',
    dominantColor: '#3F79AE',
  }),
  defineCard({
    id: 'gym1-90',
    name: "Misty's Staryu",
    pokemon: 'Staryu',
    setName: 'Gym Heroes',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym1/90/high.webp',
    dominantColor: '#C77A3E',
  }),

  // ── Gym Challenge — Misty's heavy hitters (2000) ──────────────────────────
  defineCard({
    id: 'gym2-12',
    name: "Misty's Golduck",
    pokemon: 'Golduck',
    setName: 'Gym Challenge',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym2/12/high.webp',
    dominantColor: '#3A6FA6',
  }),
  defineCard({
    id: 'gym2-13',
    name: "Misty's Gyarados",
    pokemon: 'Gyarados',
    setName: 'Gym Challenge',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym2/13/high.webp',
    dominantColor: '#2F6E9B',
  }),
  defineCard({
    id: 'gym2-54',
    name: "Misty's Dewgong",
    pokemon: 'Dewgong',
    setName: 'Gym Challenge',
    illustrator: 'Ken Sugimori',
    imageUrl: 'https://assets.tcgdex.net/en/gym/gym2/54/high.webp',
    dominantColor: '#9FB9D4',
  }),

  // ── Destined Rivals — modern Misty (2025, set sv10) ───────────────────────
  defineCard({
    id: 'sv10-045',
    name: "Misty's Psyduck",
    pokemon: 'Psyduck',
    setName: 'Destined Rivals',
    illustrator: 'Yuu Nishida',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv10/045/high.webp',
    dominantColor: '#E6C84B',
  }),
  defineCard({
    id: 'sv10-046',
    name: "Misty's Staryu",
    pokemon: 'Staryu',
    setName: 'Destined Rivals',
    illustrator: 'Shinya Komatsu',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv10/046/high.webp',
    dominantColor: '#C77A3E',
  }),
  defineCard({
    id: 'sv10-047',
    name: "Misty's Starmie",
    pokemon: 'Starmie',
    setName: 'Destined Rivals',
    illustrator: 'Natsumi Yoshida',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv10/047/high.webp',
    dominantColor: '#7A52A0',
  }),
  defineCard({
    id: 'sv10-048',
    name: "Misty's Magikarp",
    pokemon: 'Magikarp',
    setName: 'Destined Rivals',
    illustrator: 'Shimaris Yukichi',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv10/048/high.webp',
    dominantColor: '#D85A3E',
  }),
  defineCard({
    id: 'sv10-049',
    name: "Misty's Gyarados",
    pokemon: 'Gyarados',
    setName: 'Destined Rivals',
    illustrator: 'GOSSAN',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv10/049/high.webp',
    dominantColor: '#2F6E9B',
  }),
  defineCard({
    id: 'sv10-050',
    name: "Misty's Lapras",
    pokemon: 'Lapras',
    setName: 'Destined Rivals',
    illustrator: 'En Morikura',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv10/050/high.webp',
    dominantColor: '#4E78B4',
  }),
];

export const binders: ContentModule['binders'] = [
  {
    id: 'example-misty',
    title: 'Misty',
    description:
      'A water-blue michi binder for the Cerulean Gym leader — her classic Gym-era team and the ' +
      'modern Destined Rivals line, framed by ocean-storm art and cool negative space.',
    layoutStyle: 'trainer',
    isExample: true,
    coverCardId: 'gym1-18',
    pages: [
      // ── p1 · Cerulean Gym (cover) — 3 cards, 3 art (oceanWide banner) ───────
      // row0: trainer card + Starmie · row1: Staryu · row2: wide ocean banner.
      page(
        [
          card(0, 0, 'gym1-18'),
          card(0, 2, 'gym1-56'),
          card(1, 1, 'gym1-90'),
          artPanel(2, 0, ART.oceanWide, { colSpan: 3 }),
          // (0,1),(1,0),(1,2) empty — breathing room around the leader.
        ],
        { title: 'Misty · Cerulean Gym', backgroundColor: ABYSS },
      ),

      // ── p2 · The Cerulean Gym — 4 cards, 3 art (tall ocean column) ──────────
      // cols 0–1 hold the jellyfish line; col 2 is a full-height ocean panel.
      page(
        [
          card(0, 0, 'gym1-9'),
          card(0, 1, 'gym1-10'),
          card(1, 0, 'gym1-32'),
          card(1, 1, 'gym1-29'),
          artPanel(0, 2, ART.oceanTall, { rowSpan: 3 }),
          // (2,0),(2,1) empty.
        ],
        { title: 'The Cerulean Gym', backgroundColor: TIDE },
      ),

      // ── p3 · Misty's team — 5 cards, 3 art (oceanWide footer) ───────────────
      // top two rows: her amphibians & seals; bottom row a wide ocean banner.
      page(
        [
          card(0, 0, 'gym1-54'),
          card(0, 1, 'gym2-12'),
          card(0, 2, 'gym1-31'),
          card(1, 0, 'gym1-53'),
          card(1, 1, 'gym2-54'),
          artPanel(2, 0, ART.oceanWide, { colSpan: 3 }),
          // (1,2) empty.
        ],
        { title: "Misty's team", backgroundColor: ABYSS },
      ),

      // ── p4 · Starmie & Staryu — 4 cards, 3 art (tall ocean column) ──────────
      // classic (top) over modern (bottom) pairings; col 2 a full-height panel.
      page(
        [
          card(0, 0, 'gym1-90'),
          card(0, 1, 'gym1-56'),
          card(1, 0, 'sv10-046'),
          card(1, 1, 'sv10-047'),
          artPanel(0, 2, ART.oceanTall, { rowSpan: 3 }),
          // (2,0),(2,1) empty.
        ],
        { title: 'Starmie & Staryu', backgroundColor: FROST },
      ),

      // ── p5 · Gyarados — 3 cards, 3 art (oceanWide footer) ───────────────────
      // Magikarp → Gyarados (classic & modern) over a churning ocean banner.
      page(
        [
          card(0, 0, 'gym2-13'),
          card(0, 2, 'sv10-048'),
          card(1, 1, 'sv10-049'),
          artPanel(2, 0, ART.oceanWide, { colSpan: 3 }),
          // (0,1),(1,0),(1,2) empty.
        ],
        { title: 'Gyarados', backgroundColor: ABYSS },
      ),

      // ── p6 · Modern Misty · Destined Rivals — 4 cards, 3 art (tall column) ──
      // col 0 a full-height ocean panel; cols 1–2 the 2025 line.
      page(
        [
          artPanel(0, 0, ART.oceanTall, { rowSpan: 3 }),
          card(0, 1, 'sv10-045'),
          card(0, 2, 'sv10-046'),
          card(1, 1, 'sv10-047'),
          card(1, 2, 'sv10-050'),
          // (2,1),(2,2) empty.
        ],
        { title: 'Modern Misty · Destined Rivals', backgroundColor: MIST },
      ),

      // ── p7 · The deep end (close) — 3 cards, 3 art (oceanWide footer) ───────
      // Horsea + the Goldeen line drift over a final wide ocean banner.
      page(
        [
          card(0, 0, 'gym1-86'),
          card(1, 1, 'gym1-30'),
          card(1, 2, 'gym1-55'),
          artPanel(2, 0, ART.oceanWide, { colSpan: 3 }),
          // (0,1),(0,2),(1,0) empty.
        ],
        { title: 'The deep end', backgroundColor: TIDE },
      ),
    ],
  },
];

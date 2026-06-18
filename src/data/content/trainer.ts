/**
 * Content module: Trainer binder — Misty, Cerulean Gym leader (Water).
 *
 * A single curated "michi" binder built around the trainer character Misty. Page layout
 * follows the michi method, tuned to the brief's strict per-page rules:
 *   - Every page is a 3×3 grid.
 *   - At most SIX pockets hold Pokémon `card`s, sat in a clean block.
 *   - Every remaining pocket is water-themed hand-drawn ukiyo-e (the Great Wave, a sea coast,
 *     a rain shower, moonlit water) sliced into a 2×2 block or a column — art and cards never
 *     overlap (≥3 art per page).
 *
 * No slot overlaps another and every footprint sits inside the 3×3 grid (verified per page).
 *
 * Cards are real official TCG art served from the TCGdex CDN — the classic 2000 Gym Heroes /
 * Gym Challenge "Misty's …" line (Ken Sugimori & Atsuko Nishida) plus the 2025 Destined Rivals
 * (Surging Sparks era, set sv10) modern Misty cards. Every image URL was verified to return 200.
 * These ids are NOT in the bundled catalogue, so this module declares them below.
 */

import {
  ART,
  artPanel,
  card,
  defineCard,
  page,
  sliceRegion,
  type ContentModule,
} from '@/data/content/_helpers';

// Cool-blue michi mats — deep cerulean inks that frame the hand-drawn sea prints in her pockets.
const ABYSS = '#10141C'; // near-black cerulean — makes the holos pop
const TIDE = '#1C2A3A'; // deep gym-pool blue

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
      'modern Destined Rivals line, each page set into a hand-drawn sea print sliced across the pockets.',
    layoutStyle: 'trainer',
    isExample: true,
    coverCardId: 'gym1-18',
    pages: [
      // ── p1 · Cerulean Gym (cover) — 3 cards (top) · a Great-Wave block + a rain column. 3 / 6.
      page(
        [
          card(0, 0, 'gym1-18'),
          card(0, 1, 'gym1-56'),
          card(0, 2, 'gym1-90'),
          ...sliceRegion(1, 0, 2, 2, ART.greatWave),
          artPanel(1, 2, ART.edoRain, { rowSpan: 2, colSpan: 1 }),
        ],
        { title: 'Misty · Cerulean Gym', backgroundColor: ABYSS },
      ),

      // ── p2 · The Cerulean Gym — a sea-coast block + a moonlit-water accent + the jellyfish line. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.edoSea),
          card(0, 2, 'gym1-9'),
          card(1, 2, 'gym1-10'),
          artPanel(2, 0, ART.edoMoon),
          card(2, 1, 'gym1-32'),
          card(2, 2, 'gym1-29'),
        ],
        { title: 'The Cerulean Gym', backgroundColor: TIDE },
      ),

      // ── p3 · Misty's team — a 2×2 rain-shower block + 5 cards. 5 / 4.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.edoRain),
          card(0, 2, 'gym1-54'),
          card(1, 2, 'gym2-12'),
          card(2, 0, 'gym1-31'),
          card(2, 1, 'gym1-53'),
          card(2, 2, 'gym2-54'),
        ],
        { title: "Misty's team", backgroundColor: ABYSS },
      ),

      // ── p4 · Starmie & Staryu — a Great-Wave block + a sea-coast accent + 4 cards. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.greatWave),
          card(0, 2, 'gym1-90'),
          card(1, 2, 'gym1-56'),
          artPanel(2, 0, ART.edoSea),
          card(2, 1, 'sv10-046'),
          card(2, 2, 'sv10-047'),
        ],
        { title: 'Starmie & Staryu', backgroundColor: TIDE },
      ),

      // ── p5 · Gyarados — 3 cards (top) · a moonlit-water block + a snow column. 3 / 6.
      page(
        [
          card(0, 0, 'gym2-13'),
          card(0, 1, 'sv10-048'),
          card(0, 2, 'sv10-049'),
          ...sliceRegion(1, 0, 2, 2, ART.edoMoon),
          artPanel(1, 2, ART.edoSnow, { rowSpan: 2, colSpan: 1 }),
        ],
        { title: 'Gyarados', backgroundColor: ABYSS },
      ),

      // ── p6 · Modern Misty · Destined Rivals — a sea-coast block + a rain accent + 4 cards. 4 / 5.
      page(
        [
          ...sliceRegion(0, 0, 2, 2, ART.edoSea),
          card(0, 2, 'sv10-045'),
          card(1, 2, 'sv10-046'),
          artPanel(2, 0, ART.edoRain),
          card(2, 1, 'sv10-047'),
          card(2, 2, 'sv10-050'),
        ],
        { title: 'Modern Misty · Destined Rivals', backgroundColor: TIDE },
      ),

      // ── p7 · The deep end (close) — 3 cards (top) · a Great-Wave block + a moonlit column. 3 / 6.
      page(
        [
          card(0, 0, 'gym1-86'),
          card(0, 1, 'gym1-30'),
          card(0, 2, 'gym1-55'),
          ...sliceRegion(1, 0, 2, 2, ART.greatWave),
          artPanel(1, 2, ART.edoMoon, { rowSpan: 2, colSpan: 1 }),
        ],
        { title: 'The deep end', backgroundColor: TIDE },
      ),
    ],
  },
];

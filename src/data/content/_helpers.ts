/**
 * Stable, read-only helpers for the content modules in this folder.
 *
 * Each content module (originals-a, classics, artists, …) exports `cards` and `binders`
 * arrays built with these helpers. `src/data/content/index.ts` aggregates them, and
 * `src/data/sampleData.ts` merges them into the app's catalogue + example binders.
 *
 * Author binders by composing pages of slots:
 *   - `card(row, col, id, opts?)`    → a framed card in a pocket
 *   - `artwork(row, col, id, opts?)` → full-bleed art (usually spanning, e.g. a 2×2 hero)
 *   - `insert(row, col, color, opts?)` → a tonal "negative-space" filler (no card)
 * Leave pockets out of `slots` entirely to keep them empty (the michi way).
 */

import {
  uid,
  type CardKind,
  type CardOrientation,
  type DemoBinder,
  type DemoCard,
  type DemoPage,
  type DemoSlot,
} from '@/data/binderTypes';

export { uid };
export type { CardKind, CardOrientation, DemoBinder, DemoCard, DemoPage, DemoSlot };

/** The shape every content module exports. */
export interface ContentModule {
  cards: DemoCard[];
  binders: DemoBinder[];
}

type SlotOpts = Partial<Pick<DemoSlot, 'rowSpan' | 'colSpan' | 'type'>>;
type SpanOpts = Partial<Pick<DemoSlot, 'rowSpan' | 'colSpan'>>;

/** A framed card slot (single pocket by default; pass spans via opts). */
export function card(row: number, col: number, cardId: string, opts?: SlotOpts): DemoSlot {
  return {
    id: uid('slot'),
    row,
    col,
    rowSpan: opts?.rowSpan ?? 1,
    colSpan: opts?.colSpan ?? 1,
    type: opts?.type ?? 'card',
    cardId,
  };
}

/** A full-bleed artwork slot — usually spanning (e.g. a 2×2 hero filling four pockets). */
export function artwork(row: number, col: number, cardId: string, opts?: SpanOpts): DemoSlot {
  return card(row, col, cardId, { ...opts, type: 'artwork' });
}

/** A tonal insert (negative-space filler) using a hex colour. */
export function insert(row: number, col: number, color: string, opts?: SpanOpts): DemoSlot {
  return {
    id: uid('slot'),
    row,
    col,
    rowSpan: opts?.rowSpan ?? 1,
    colSpan: opts?.colSpan ?? 1,
    type: 'insert',
    insertColor: color,
  };
}

/** Build a DemoCard, defaulting orientation to portrait. */
export function defineCard(
  c: Omit<DemoCard, 'orientation'> & { orientation?: CardOrientation },
): DemoCard {
  return { orientation: 'portrait', ...c };
}

// --- realistic card sizes (jumbo & V-UNION) --------------------------------
//
// Standard cards are a single pocket (1×1) — just use `card(...)`. The two helpers
// below place cards at their real-world oversized footprints:
//   - `jumbo`  : one oversized card spanning ≈2×2 (renders with a "JUMBO" badge).
//   - `vunion` : a V-UNION's four pieces, each a 1×1 card, tiled into a 2×2 block.

/**
 * A jumbo (oversized) card: one card spanning `rows`×`cols` pockets (default 2×2).
 * Reference a card whose `kind` is `'jumbo'` in the catalogue so the renderer badges it.
 */
export function jumbo(
  row: number,
  col: number,
  cardId: string,
  opts?: { rows?: number; cols?: number },
): DemoSlot {
  return card(row, col, cardId, {
    rowSpan: opts?.rows ?? 2,
    colSpan: opts?.cols ?? 2,
    type: 'card',
  });
}

/**
 * A V-UNION: its four pieces tiled into a 2×2 block whose top-left cell is (row,col).
 * Pass the four piece card ids in reading order — [topLeft, topRight, bottomLeft, bottomRight].
 * Each piece is a normal 1×1 card; reference `kind: 'vunion'` cards so they're badged.
 */
export function vunion(
  row: number,
  col: number,
  pieces: readonly [string, string, string, string],
): DemoSlot[] {
  const [tl, tr, bl, br] = pieces;
  return [
    card(row, col, tl),
    card(row, col + 1, tr),
    card(row + 1, col, bl),
    card(row + 1, col + 1, br),
  ];
}

/**
 * Verified V-UNION piece ids (TCGdex SWSH Black Star Promos, `swshp`), in
 * [topLeft, topRight, bottomLeft, bottomRight] order for `vunion(...)`.
 */
export const VUNION = {
  mewtwo: ['swshp-SWSH159', 'swshp-SWSH160', 'swshp-SWSH161', 'swshp-SWSH162'],
  greninja: ['swshp-SWSH155', 'swshp-SWSH156', 'swshp-SWSH157', 'swshp-SWSH158'],
  zacian: ['swshp-SWSH163', 'swshp-SWSH164', 'swshp-SWSH165', 'swshp-SWSH166'],
  pikachu: ['swshp-SWSH139', 'swshp-SWSH140', 'swshp-SWSH141', 'swshp-SWSH142'],
} as const satisfies Record<string, readonly [string, string, string, string]>;

/** Jumbo (oversized) card ids in the catalogue — reference these from `jumbo(...)`. */
export const JUMBO = {
  charizard: 'jumbo-charizard',
  pikachu: 'jumbo-pikachu',
  mewtwo: 'jumbo-mewtwo',
  lugia: 'jumbo-lugia',
  umbreon: 'jumbo-umbreon',
  blastoise: 'jumbo-blastoise',
} as const;

/** A page of slots. Title/background optional; grid defaults to 3×3. */
export function page(
  slots: DemoSlot[],
  opts?: { title?: string; rows?: number; cols?: number; backgroundColor?: string },
): DemoPage {
  return {
    id: uid('page'),
    title: opts?.title,
    rows: opts?.rows ?? 3,
    cols: opts?.cols ?? 3,
    backgroundColor: opts?.backgroundColor,
    slots,
  };
}

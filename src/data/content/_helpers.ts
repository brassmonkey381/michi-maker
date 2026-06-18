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

/**
 * A custom-image artwork panel (a playground / pasted image rather than a catalogue card).
 * Cover-fits its footprint, so it can take any shape — use `ART.*` for the playground art.
 */
export function artPanel(row: number, col: number, imageUrl: string, opts?: SpanOpts): DemoSlot {
  return {
    id: uid('slot'),
    row,
    col,
    rowSpan: opts?.rowSpan ?? 1,
    colSpan: opts?.colSpan ?? 1,
    type: 'artwork',
    imageUrl,
  };
}

/**
 * Official Pokémon artwork (the Sugimori-style render) for a National-Dex number, served from
 * the PokéAPI sprite CDN on GitHub — stable, CORS/hotlink-friendly, transparent PNG. Used as
 * theme-matched art to slice across a page's pockets (e.g. a Squirtle page → `pokemonArt(7)`).
 */
export function pokemonArt(dex: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
}

/**
 * Slice ONE image across a clean rectangular region — `rows`×`cols` pockets whose top-left cell
 * is (row, col) — returning a 1×1 `artwork` tile per cell, each showing its sub-rectangle of the
 * image. The whole image lives inside the region (a wide image across a 1×3 banner reads as one
 * picture cut into three; a tall one down a 3×1 column, etc.), with binder gaps between pieces.
 * This is exactly what the Slice Studio produces (`placeSlicedArtwork`): the region must hold
 * only art (don't overlap cards) so nothing is laid over the picture.
 */
export function sliceRegion(
  row: number,
  col: number,
  rows: number,
  cols: number,
  imageUrl: string,
): DemoSlot[] {
  const tiles: DemoSlot[] = [];
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      tiles.push({
        id: uid('slot'),
        row: row + i,
        col: col + j,
        rowSpan: 1,
        colSpan: 1,
        type: 'artwork',
        imageUrl,
        imageCrop: { x: j / cols, y: i / rows, w: 1 / cols, h: 1 / rows },
      });
    }
  }
  return tiles;
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
 * V-UNION piece id tuples and jumbo card ids — re-exported from the shared card-sizing
 * module so content authors and the editor UI share one source of truth.
 */
export { VUNION, JUMBO } from '@/data/cardSizing';
export { ART } from '@/data/artworkLibrary';

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

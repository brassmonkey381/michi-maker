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
  type CardOrientation,
  type DemoBinder,
  type DemoCard,
  type DemoPage,
  type DemoSlot,
} from '@/data/binderTypes';

export { uid };
export type { CardOrientation, DemoBinder, DemoCard, DemoPage, DemoSlot };

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

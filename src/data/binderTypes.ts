/**
 * Local, ergonomic view-models for the binder display/editor.
 *
 * These intentionally mirror the Supabase schema (see supabase/migrations and
 * src/types/domain.ts) but are flattened for convenient in-memory editing. When the
 * backend is wired up, the store in src/store/binders.tsx is the single place that maps
 * between these shapes and the database rows.
 */

import type { BinderSlotType, CardOrientation, MichiLayoutStyle } from '@/types/domain';

export type { BinderSlotType, CardOrientation, MichiLayoutStyle };

/**
 * The real-world size class of a card, which determines its pocket footprint:
 *  - `standard` — a normal 63×88mm card: exactly one pocket (1×1). The default.
 *  - `jumbo`    — an oversized promo card: one card spanning multiple pockets (≈2×2).
 *  - `vunion`   — one of the four pieces of a V-UNION card; each piece is itself a
 *                 standard-size card (1×1), and four of them tile into a 2×2 block.
 */
export type CardKind = 'standard' | 'jumbo' | 'vunion';

export interface DemoCard {
  id: string;
  name: string;
  pokemon?: string;
  setName?: string;
  illustrator?: string;
  imageUrl: string;
  /** Hex colour used for color-theme layouts and as the slot backing. */
  dominantColor?: string;
  orientation: CardOrientation;
  /** Real-world size class. Absent ⇒ `standard` (a single pocket). */
  kind?: CardKind;
}

export interface DemoSlot {
  id: string;
  /** Top-left cell of the slot (0-indexed). */
  row: number;
  col: number;
  /** How many cells the slot spans. 1 = a single pocket. */
  rowSpan: number;
  colSpan: number;
  /**
   * 'card' references a `cardId`. 'artwork' is a full-bleed image: either a `cardId` or a
   * custom `imageUrl` (a user-supplied / playground art panel). 'insert' uses `insertColor`.
   */
  type: Exclude<BinderSlotType, 'empty'>;
  cardId?: string;
  insertColor?: string;
  /** Custom artwork image (used by 'artwork' slots that aren't a catalogue card). */
  imageUrl?: string;
  /**
   * For a sliced artwork (a full image spread across several pockets): the sub-rectangle of
   * `imageUrl` this slot shows, as fractions 0–1 of the whole image. Absent ⇒ show the whole.
   */
  imageCrop?: { x: number; y: number; w: number; h: number };
}

export interface DemoPage {
  id: string;
  title?: string;
  /** Free-text page description (persisted to binder_pages.notes). */
  description?: string;
  rows: number;
  cols: number;
  backgroundColor?: string;
  slots: DemoSlot[];
}

export interface DemoBinder {
  id: string;
  title: string;
  description?: string;
  layoutStyle: MichiLayoutStyle;
  /** Premade, read-only-by-default reference binders ship with the app. */
  isExample: boolean;
  coverCardId?: string;
  pages: DemoPage[];
}

// --- helpers ---------------------------------------------------------------

let _counter = 0;

/** A small unique id generator (runtime only — fine for keys and the bundled examples). */
export function uid(prefix = 'id'): string {
  _counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_counter.toString(36)}`;
}

/**
 * RFC4122 v4 UUID. Used for ids that get persisted to Supabase (the `uuid` columns).
 * Math.random is fine here — these are client-generated ids for a personal app, not secrets.
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** A fresh empty page of the given grid size (persistable — uses a UUID id). */
export function emptyPage(rows = 3, cols = 3, title?: string): DemoPage {
  return { id: uuidv4(), title, rows, cols, slots: [] };
}

/** Cells covered by a slot, as "row,col" keys (accounts for spans). */
export function slotCells(slot: DemoSlot): string[] {
  const keys: string[] = [];
  for (let r = slot.row; r < slot.row + slot.rowSpan; r += 1) {
    for (let c = slot.col; c < slot.col + slot.colSpan; c += 1) {
      keys.push(`${r},${c}`);
    }
  }
  return keys;
}

/** The set of every cell on a page already occupied by some slot. */
export function occupiedCells(page: DemoPage): Set<string> {
  const set = new Set<string>();
  for (const slot of page.slots) {
    for (const key of slotCells(slot)) set.add(key);
  }
  return set;
}

/** A candidate placement (position + span) — a slot-shaped object without an id/type. */
export interface SlotCandidate {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

/**
 * Cells a candidate placement would cover, as "row,col" keys (accounts for spans).
 * Mirrors `slotCells` but works on a span-only candidate (no id/type required).
 */
export function candidateCells(candidate: SlotCandidate): string[] {
  const keys: string[] = [];
  for (let r = candidate.row; r < candidate.row + candidate.rowSpan; r += 1) {
    for (let c = candidate.col; c < candidate.col + candidate.colSpan; c += 1) {
      keys.push(`${r},${c}`);
    }
  }
  return keys;
}

/**
 * Whether `candidate` can be placed on `page`:
 *  - it fits within the grid (row/col >= 0, and row+rowSpan <= rows, col+colSpan <= cols), and
 *  - none of its cells overlap an existing slot, ignoring the slot whose id === ignoreId
 *    (so a slot can be re-placed/resized over its own footprint).
 * Pure — does not mutate the page.
 */
export function canPlaceSlot(
  page: DemoPage,
  candidate: SlotCandidate,
  ignoreId?: string,
): boolean {
  // Span must be a positive size and the footprint must sit inside the grid.
  if (candidate.rowSpan < 1 || candidate.colSpan < 1) return false;
  if (candidate.row < 0 || candidate.col < 0) return false;
  if (candidate.row + candidate.rowSpan > page.rows) return false;
  if (candidate.col + candidate.colSpan > page.cols) return false;

  // No overlap with any other slot's cells (the ignored slot's cells are free game).
  const taken = new Set<string>();
  for (const slot of page.slots) {
    if (slot.id === ignoreId) continue;
    for (const key of slotCells(slot)) taken.add(key);
  }
  return candidateCells(candidate).every((key) => !taken.has(key));
}

/**
 * The first cell (reading order, top-left→bottom-right) where a `rowSpan`×`colSpan` footprint
 * fits on the page without overlapping any slot (except `ignoreId`). Returns null if none fits.
 */
export function firstFreePlacement(
  page: DemoPage,
  rowSpan: number,
  colSpan: number,
  ignoreId?: string,
): { row: number; col: number } | null {
  for (let row = 0; row <= page.rows - rowSpan; row += 1) {
    for (let col = 0; col <= page.cols - colSpan; col += 1) {
      if (canPlaceSlot(page, { row, col, rowSpan, colSpan }, ignoreId)) return { row, col };
    }
  }
  return null;
}

/** Deep-clone a binder, assigning fresh (persistable) UUID ids — used to remix an example. */
export function cloneBinder(binder: DemoBinder, overrides?: Partial<DemoBinder>): DemoBinder {
  return {
    ...binder,
    id: uuidv4(),
    isExample: false,
    pages: binder.pages.map((page) => ({
      ...page,
      id: uuidv4(),
      slots: page.slots.map((slot) => ({ ...slot, id: uuidv4() })),
    })),
    ...overrides,
  };
}

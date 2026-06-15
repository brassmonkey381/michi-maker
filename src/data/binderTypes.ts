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
}

export interface DemoSlot {
  id: string;
  /** Top-left cell of the slot (0-indexed). */
  row: number;
  col: number;
  /** How many cells the slot spans. 1 = a single pocket. */
  rowSpan: number;
  colSpan: number;
  /** 'card' / 'artwork' reference a card; 'insert' uses insertColor. Empty = no slot. */
  type: Exclude<BinderSlotType, 'empty'>;
  cardId?: string;
  insertColor?: string;
}

export interface DemoPage {
  id: string;
  title?: string;
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

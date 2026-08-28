/**
 * Rebuild a tcgscan binder as a michi binder — the paper binder the scanner already recorded,
 * pocket for pocket, instead of a fresh arrangement of the same cards.
 *
 * tcgscan's storage layer (supabase/migrations/20260827130000 and its follow-ups) records where a
 * card physically IS: a `storage_units` row of kind 'binder' carries the page shape (grid_rows ×
 * grid_cols) and how many pages the binder has been scanned to; each `portfolio_entries` row
 * carries `storage_page` and `storage_pos`, the pocket index within that page, row-major. That is
 * a complete michi binder already — this module is only the arithmetic that turns
 * `slot = row * cols + col` back into a row and a column.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is curate. The build wizard exists for "arrange my cards
 * beautifully"; this is the opposite errand, and a card that sits in page 4 pocket 7 on the shelf
 * belongs in page 4 pocket 7 here. Empty pockets stay empty and empty pages stay in the binder,
 * because the shape of the gaps is the thing being carried over.
 *
 * Pure and dependency-light so `node --test` can run it (see tcgscanBinderImport.test.ts).
 */
import { uuidv4, type DemoPage, type DemoSlot } from './binderTypes.ts';

/**
 * The page shape assumed when tcgscan never recorded one. Its own backfill chose 3 × 4 for every
 * binder scanned before the grid column existed (20260827210000), so an unrecorded binder is
 * overwhelmingly likely to be one of those — and the caller is told the shape was assumed rather
 * than read, because the user is the only one who can actually confirm it.
 */
export const ASSUMED_ROWS = 3;
export const ASSUMED_COLS = 4;

/** One entry's claim on a pocket. Page/pos are nullable: an entry can be loose in the binder. */
export interface TcgscanPocket {
  cardId: string;
  /** 1-based page number in the physical binder. Null = not placed on a page. */
  page: number | null;
  /** Pocket within the page, 0-based row-major. Null = not placed in a pocket. */
  pos: number | null;
  /** The camera moment, the first tie-break when two entries claim one pocket. */
  scannedAt: string | null;
  /** The entry id, the last tie-break — it makes the result stable, never arbitrary. */
  entryId: string;
}

/** A tcgscan `storage_units` row of kind 'binder', with the entries that live in it. */
export interface TcgscanBinder {
  id: string;
  collectionId: string;
  name: string;
  /** Page shape as tcgscan recorded it. Null = never recorded (see ASSUMED_ROWS/COLS). */
  rows: number | null;
  cols: number | null;
  /** Highest page ever scanned, INCLUDING pages whose cards were all discarded in review. */
  pageCount: number | null;
  entries: TcgscanPocket[];
}

export interface RebuildResult {
  pages: DemoPage[];
  rows: number;
  cols: number;
  /** Cards that reached the pocket they sit in on the shelf. */
  placed: number;
  /** Dropped: an earlier entry already claimed that pocket (two devices scanning offline). */
  collided: number;
  /** Dropped: the pocket index falls outside this page shape. */
  offGrid: number;
  /** Dropped: no page or pocket recorded — loose in the binder rather than in a pocket. */
  loose: number;
  /** Pages the per-binder page cap left behind, and the cards that were on them. */
  droppedPages: number;
  droppedCards: number;
  /** True when the page shape was assumed rather than read from the scan. */
  assumedShape: boolean;
}

/** Every card that did not make it into a pocket, for one honest number in the UI. */
export function unplacedCount(r: RebuildResult): number {
  return r.collided + r.offGrid + r.loose + r.droppedCards;
}

/**
 * Turn one tcgscan binder into michi pages.
 *
 * `maxPages` is the tier's per-binder page cap. Pages past it are LEFT BEHIND rather than
 * squeezed in: the whole value of this import is that page 6 here is page 6 on the shelf, and
 * compacting the tail to fit would silently break that for every page after the first gap.
 */
export function rebuildTcgscanBinder(binder: TcgscanBinder, maxPages: number): RebuildResult {
  const assumedShape = binder.rows == null || binder.cols == null;
  const rows = binder.rows ?? ASSUMED_ROWS;
  const cols = binder.cols ?? ASSUMED_COLS;
  const capacity = rows * cols;

  // The display order the storage migration defines: page, then pocket, then the camera moment,
  // then the id. Sorting by it here is what makes "first claim wins" mean the same thing as what
  // tcgscan itself shows, rather than whatever order PostgREST happened to return.
  const sorted = [...binder.entries].sort(
    (a, b) =>
      (a.page ?? 0) - (b.page ?? 0) ||
      (a.pos ?? 0) - (b.pos ?? 0) ||
      // Nulls last: an entry with no camera moment is the older record, not the newer one.
      (a.scannedAt ?? '￿').localeCompare(b.scannedAt ?? '￿') ||
      a.entryId.localeCompare(b.entryId),
  );

  // How many pages the binder HAS, which is not the same as how many hold a card: page_count
  // remembers a tail page whose cards were all discarded (20260828150000), and dropping it would
  // renumber every page after a gap. A binder with nothing in it still gets one page — michi
  // binders always have at least one.
  const highestEntryPage = sorted.reduce((n, e) => (e.page && e.page > n ? e.page : n), 0);
  const total = Math.max(binder.pageCount ?? 0, highestEntryPage, 1);
  const kept = Math.min(total, Math.max(1, maxPages));

  const pages: DemoPage[] = Array.from({ length: kept }, () => ({
    id: uuidv4(),
    rows,
    cols,
    slots: [] as DemoSlot[],
  }));

  const taken = new Set<string>();
  let placed = 0;
  let collided = 0;
  let offGrid = 0;
  let loose = 0;
  let droppedCards = 0;

  for (const e of sorted) {
    if (e.page == null || e.pos == null || e.page < 1 || e.pos < 0) {
      loose += 1;
      continue;
    }
    if (e.page > kept) {
      droppedCards += 1;
      continue;
    }
    if (e.pos >= capacity) {
      offGrid += 1;
      continue;
    }
    const key = `${e.page}:${e.pos}`;
    if (taken.has(key)) {
      collided += 1;
      continue;
    }
    taken.add(key);
    pages[e.page - 1].slots.push({
      id: uuidv4(),
      row: Math.floor(e.pos / cols),
      col: e.pos % cols,
      rowSpan: 1,
      colSpan: 1,
      type: 'card',
      cardId: e.cardId,
      // These are the owner's actual cards, so the pockets consume owned copies exactly as a
      // placement made from "My collection" does — and can be reclaimed the same way.
      fromCollection: true,
    });
    placed += 1;
  }

  return {
    pages,
    rows,
    cols,
    placed,
    collided,
    offGrid,
    loose,
    droppedPages: total - kept,
    droppedCards,
    assumedShape,
  };
}

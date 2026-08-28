/**
 * Rebuild a tcgscan binder as a michi binder — the paper binder the scanner already recorded,
 * pocket for pocket, instead of a fresh arrangement of the same cards.
 *
 * tcgscan's storage layer records where a card physically IS: a `storage_units` row of kind
 * 'binder' carries the binder's page shape and how many pages it has been scanned to, and each
 * `portfolio_entries` row carries `storage_page`, `storage_pos` (the pocket, row-major) and — since
 * 20260828140000 — `storage_rows`/`storage_cols`, the shape of the PAGE it was filed onto. That is
 * a complete michi binder already; this module is the arithmetic that turns
 * `slot = row * cols + col` back into a row and a column.
 *
 * WHAT IT DELIBERATELY DOES NOT DO is curate. The build wizard exists for "arrange my cards
 * beautifully"; this is the opposite errand, and a card that sits in page 4 pocket 7 on the shelf
 * belongs in page 4 pocket 7 here. Empty pockets stay empty and empty pages keep their number,
 * because the shape of the gaps is the thing being carried over.
 *
 * ITS OFFLINE SIBLING is `scripts/build-binders-from-scans.mjs`, which does the same job straight
 * to SQL for one account. THE RULES BELOW MUST MATCH ITS RULES — per-page shape with the unit grid
 * as fallback, first non-null shape wins, first claim wins a contested pocket, and a shape michi
 * cannot draw is refused rather than rounded. Two implementations that disagree would put the same
 * card in two different pockets depending on which one ran.
 *
 * Pure and dependency-light so `node --test` can run it (see tcgscanBinderImport.test.ts).
 */
import { uuidv4, type DemoPage, type DemoSlot } from './binderTypes.ts';

/**
 * The page shape assumed when nothing recorded one. tcgscan's own backfill chose 3 × 4 for every
 * binder scanned before the grid column existed (20260827210000), so an unrecorded binder is
 * overwhelmingly likely to be one of those — and the caller is told the shape was assumed rather
 * than read, because the user is the only one who can confirm it.
 */
export const ASSUMED_ROWS = 3;
export const ASSUMED_COLS = 4;

/**
 * michi's own limit: `binder_pages` CHECKs rows and cols into 1..6, while tcgscan tolerates up to
 * 12 and its grid inference has reported phantom shapes. A page outside this cannot be drawn as a
 * michi page at all, so it is refused rather than rounded into a lie about where the cards are.
 */
export const MIN_SIDE = 1;
export const MAX_SIDE = 6;

/** One entry's claim on a pocket. Page/pos are nullable: an entry can be loose in the binder. */
export interface TcgscanPocket {
  cardId: string;
  /** 1-based page number in the physical binder. Null = not placed on a page. */
  page: number | null;
  /** Pocket within the page, 0-based row-major against THAT PAGE's shape. Null = not in a pocket. */
  pos: number | null;
  /** The page's own shape when this card was filed. Null = unknown; the unit's grid is then it. */
  rows: number | null;
  cols: number | null;
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
  /** The binder-wide page shape. Null = never recorded; it is also the per-page fallback. */
  rows: number | null;
  cols: number | null;
  /** Highest page ever scanned, INCLUDING pages whose cards were all discarded in review. */
  pageCount: number | null;
  entries: TcgscanPocket[];
}

export interface RebuildResult {
  pages: DemoPage[];
  /** The binder's prevailing page shape — the commonest one, for a one-line summary. */
  rows: number;
  cols: number;
  /** True when the pages are not all the same shape (legal: a binder can mix page sizes). */
  mixedShapes: boolean;
  /** Cards that reached the pocket they sit in on the shelf. */
  placed: number;
  /** Dropped: an earlier entry already claimed that pocket (two devices scanning offline). */
  collided: number;
  /** Dropped: the pocket falls outside its page, or its page has a shape michi cannot draw. */
  offGrid: number;
  /** Dropped: no page or pocket recorded — loose in the binder rather than in a pocket. */
  loose: number;
  /** Pages the per-binder page cap left behind, and the cards that were on them. */
  droppedPages: number;
  droppedCards: number;
  /** Pages whose recorded shape is outside michi's 1..6; kept, numbered, and left empty. */
  unusablePages: number;
  /** True when no shape was recorded anywhere and ASSUMED_ROWS/COLS had to stand in. */
  assumedShape: boolean;
}

/** Every card that did not make it into a pocket, for one honest number in the UI. */
export function unplacedCount(r: RebuildResult): number {
  return r.collided + r.offGrid + r.loose + r.droppedCards;
}

function drawable(rows: number, cols: number): boolean {
  return rows >= MIN_SIDE && rows <= MAX_SIDE && cols >= MIN_SIDE && cols <= MAX_SIDE;
}

/**
 * Turn one tcgscan binder into michi pages.
 *
 * `maxPages` is the tier's per-binder page cap. Pages past it are LEFT BEHIND rather than squeezed
 * in: the whole value of this import is that page 6 here is page 6 on the shelf, and compacting the
 * tail to fit would silently break that for every page after the first gap.
 */
export function rebuildTcgscanBinder(binder: TcgscanBinder, maxPages: number): RebuildResult {
  // The unit's grid is the fallback for every page that recorded none, and the assumed shape is
  // the fallback for that. A unit grid tcgscan allows but michi cannot draw (7..12 a side) is not
  // a usable fallback either, so it falls through to the assumed one.
  const unitRows = binder.rows ?? ASSUMED_ROWS;
  const unitCols = binder.cols ?? ASSUMED_COLS;
  const fallback = drawable(unitRows, unitCols)
    ? { rows: unitRows, cols: unitCols }
    : { rows: ASSUMED_ROWS, cols: ASSUMED_COLS };

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

  // EACH PAGE'S OWN SHAPE, from the entries filed onto it — a binder that mixes 9-pocket and
  // 4-pocket pages decodes correctly only this way. A page whose cards disagree (two sessions, a
  // corrected grid) keeps the first, exactly as the offline sibling does.
  const shapeOf = new Map<number, { rows: number; cols: number }>();
  let recordedAny = false;
  for (const e of sorted) {
    if (e.page == null || e.cols == null || shapeOf.has(e.page)) continue;
    recordedAny = true;
    shapeOf.set(e.page, { rows: e.rows ?? fallback.rows, cols: e.cols });
  }

  // How many pages the binder HAS, which is not how many hold a card: page_count remembers a tail
  // page whose cards were all discarded (20260828150000), and dropping it would renumber every
  // page after a gap. A binder with nothing in it still gets one page — michi binders always have
  // at least one.
  const highestEntryPage = sorted.reduce((n, e) => (e.page && e.page > n ? e.page : n), 0);
  const total = Math.max(binder.pageCount ?? 0, highestEntryPage, 1);
  const kept = Math.min(total, Math.max(1, maxPages));

  // A page michi cannot draw still EXISTS on the shelf, so it keeps its number and is drawn at the
  // fallback shape with no cards in it. Losing the page would renumber everything after it, which
  // is the one thing this import must never do.
  const unusable = new Set<number>();
  const pages: DemoPage[] = [];
  for (let p = 1; p <= kept; p += 1) {
    const shape = shapeOf.get(p) ?? fallback;
    const ok = drawable(shape.rows, shape.cols);
    if (!ok) unusable.add(p);
    pages.push({
      id: uuidv4(),
      rows: ok ? shape.rows : fallback.rows,
      cols: ok ? shape.cols : fallback.cols,
      slots: [] as DemoSlot[],
    });
  }

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
    // Its own page's shape decides the pocket — never the binder's, and never the page it would
    // have had if every page were the same.
    const page = pages[e.page - 1];
    if (unusable.has(e.page) || e.pos >= page.rows * page.cols) {
      offGrid += 1;
      continue;
    }
    const key = `${e.page}:${e.pos}`;
    if (taken.has(key)) {
      collided += 1;
      continue;
    }
    taken.add(key);
    page.slots.push({
      id: uuidv4(),
      row: Math.floor(e.pos / page.cols),
      col: e.pos % page.cols,
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

  // The prevailing shape, for the one-line summary: the commonest, with ties going to the first
  // page, so a binder of mostly 3 × 4 with one odd page still reads as 3 × 4.
  const tally = new Map<string, number>();
  for (const p of pages) {
    const k = `${p.rows}x${p.cols}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  let prevailing = pages[0];
  let best = 0;
  for (const p of pages) {
    const n = tally.get(`${p.rows}x${p.cols}`) ?? 0;
    if (n > best) {
      best = n;
      prevailing = p;
    }
  }

  return {
    pages,
    rows: prevailing.rows,
    cols: prevailing.cols,
    mixedShapes: tally.size > 1,
    placed,
    collided,
    offGrid,
    loose,
    droppedPages: total - kept,
    droppedCards,
    unusablePages: unusable.size,
    // Only a binder where NOTHING recorded a shape — no page, no unit — is running on the guess.
    assumedShape: !recordedAny && (binder.rows == null || binder.cols == null),
  };
}

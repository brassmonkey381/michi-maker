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
 * to SQL for one account. Most rules are shared and must stay shared — per-page shape with the unit
 * grid as fallback, first non-null shape wins, first claim wins a contested pocket — because two
 * implementations that disagree put the same card in two different pockets depending on which one
 * ran. ONE RULE HERE IS STRICTER, and the script should follow: a page is drawn on one of michi's
 * REAL page sizes (see realSizeFor). The script tests rows/cols against binder_pages' 1..6 CHECK,
 * which passes shapes michi has no page for — a 3 × 5 is legal to the database and does not exist
 * on a shelf.
 *
 * Pure and dependency-light so `node --test` can run it (see tcgscanBinderImport.test.ts).
 */
import { REAL_PAGE_SIZES } from './binderPhysics.ts';
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
 * WHICH SHAPES MICHI ACTUALLY HAS. `binder_pages` CHECKs 1..6 a side, but that is a backstop, not
 * the model: michi draws REAL side-load pages — 2×2, 3×3, 3×4, 4×4 — and 4 rows × 3 columns is not
 * among them because it does not exist physically (binderPhysics). The whole fold-a-pair geometry
 * downstream assumes 2, 3 or 4 columns.
 *
 * tcgscan is looser on both counts: it tolerates 12 a side, and its grid inference has reported a
 * phantom 3 × 5. So a scanned page can carry a shape michi has no page for, and the choice is
 * between refusing the page and drawing it on the nearest real one.
 *
 * IT IS DRAWN, and the pocket index is what makes that safe: `pos` means row and column against
 * the shape it was SCANNED at, so decoding with that shape and then drawing on a real page keeps
 * every card in the row and column it physically occupies. A 3 × 5 whose cards only reach column 3
 * lands perfectly on a 3 × 4; a 2 × 3 becomes the top two rows of a 3 × 3. Only a coordinate with
 * nowhere to go on any real page is dropped, and it is counted.
 */
function realSizeFor(
  rows: number,
  cols: number,
): { rows: number; cols: number; exact: boolean; rotated: boolean } {
  const exact = REAL_PAGE_SIZES.find((z) => z.rows === rows && z.cols === cols);
  if (exact) return { rows: exact.rows, cols: exact.cols, exact: true, rotated: false };
  // SIDEWAYS, NOT WRONG. tcgscan's rows and cols are camera-relative, so a 3 × 4 page photographed
  // turned is honestly reported as 4 × 3 — a shape michi has no page for, and the transpose of one
  // it does. Rotating it back is the only reading that keeps the real page shape AND every card's
  // neighbours; drawing it on a 4 × 4 instead would keep the camera's framing and lose the binder.
  const turned = REAL_PAGE_SIZES.find((z) => z.rows === cols && z.cols === rows);
  if (turned) return { rows: turned.rows, cols: turned.cols, exact: false, rotated: true };
  // Otherwise: keep the most pockets, then take the smallest page that keeps them. Coverage first
  // because every cell it cannot reach is a card dropped; smallest second so a 3 × 5 becomes a
  // 3 × 4 rather than a 4 × 4 that keeps no more cards and invents an empty row. A page that
  // CONTAINS the scanned shape wins on coverage automatically, so this is one rule, not two.
  const best = [...REAL_PAGE_SIZES].sort((a, b) => {
    const ca = Math.min(a.rows, rows) * Math.min(a.cols, cols);
    const cb = Math.min(b.rows, rows) * Math.min(b.cols, cols);
    return cb - ca || a.rows * a.cols - b.rows * b.cols;
  })[0];
  return { rows: best.rows, cols: best.cols, exact: false, rotated: false };
}

/** Is this a page michi has? Used for the unit-grid fallback, which has no pockets to decode. */
function isRealSize(rows: number, cols: number): boolean {
  return REAL_PAGE_SIZES.some((z) => z.rows === rows && z.cols === cols);
}

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
  /** Pages scanned at a shape michi has no page for, drawn on the nearest real one. */
  normalizedPages: number;
  /**
   * Pages scanned sideways and rotated back upright. WHICH WAY IS A GUESS — a quarter turn
   * clockwise — because the camera's orientation is not recorded, so the page is right and its
   * rotation is 50/50. Surfaced to the user for exactly that reason.
   */
  rotatedPages: number;
  /** True when no shape was recorded anywhere and ASSUMED_ROWS/COLS had to stand in. */
  assumedShape: boolean;
}

/** Every card that did not make it into a pocket, for one honest number in the UI. */
export function unplacedCount(r: RebuildResult): number {
  return r.collided + r.offGrid + r.loose + r.droppedCards;
}

/**
 * Turn one tcgscan binder into michi pages.
 *
 * `maxPages` is the tier's per-binder page cap. Pages past it are LEFT BEHIND rather than squeezed
 * in: the whole value of this import is that page 6 here is page 6 on the shelf, and compacting the
 * tail to fit would silently break that for every page after the first gap.
 */
export function rebuildTcgscanBinder(binder: TcgscanBinder, maxPages: number): RebuildResult {
  // The unit's grid is the fallback for every page that recorded none. Unlike a page's own shape
  // it decodes nothing — a page with no entries has no pockets to place — so a unit grid that is
  // not one of michi's real pages is simply not used: 3 × 4 (which is real, and tcgscan's own
  // backfill default) stands in instead of normalising a shape nothing depends on.
  const unitRows = binder.rows ?? ASSUMED_ROWS;
  const unitCols = binder.cols ?? ASSUMED_COLS;
  const fallback = isRealSize(unitRows, unitCols)
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
    if (e.page == null || e.cols == null || e.cols < 1 || shapeOf.has(e.page)) continue;
    const r = e.rows ?? fallback.rows;
    recordedAny = true;
    shapeOf.set(e.page, { rows: r < 1 ? fallback.rows : r, cols: e.cols });
  }

  // How many pages the binder HAS, which is not how many hold a card: page_count remembers a tail
  // page whose cards were all discarded (20260828150000), and dropping it would renumber every
  // page after a gap. A binder with nothing in it still gets one page — michi binders always have
  // at least one.
  const highestEntryPage = sorted.reduce((n, e) => (e.page && e.page > n ? e.page : n), 0);
  const total = Math.max(binder.pageCount ?? 0, highestEntryPage, 1);
  const kept = Math.min(total, Math.max(1, maxPages));

  // Two shapes per page, and the difference is the whole trick: `scanned` is what the pocket index
  // means, `drawn` is the real michi page it goes onto. They are the same shape for any page
  // scanned at a size michi has, which is nearly all of them.
  const scannedOf: { rows: number; cols: number; rotated: boolean }[] = [];
  let normalizedPages = 0;
  let rotatedPages = 0;
  const pages: DemoPage[] = [];
  for (let p = 1; p <= kept; p += 1) {
    const scanned = shapeOf.get(p) ?? fallback;
    const drawn = realSizeFor(scanned.rows, scanned.cols);
    if (drawn.rotated) rotatedPages += 1;
    else if (!drawn.exact) normalizedPages += 1;
    scannedOf.push({ ...scanned, rotated: drawn.rotated });
    pages.push({ id: uuidv4(), rows: drawn.rows, cols: drawn.cols, slots: [] as DemoSlot[] });
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
    // DECODED against the shape it was SCANNED at, then checked against the page it is DRAWN on.
    // Decoding with the drawn shape instead would move cards sideways on any page michi had to
    // normalise — the exact silent wrongness this import exists to avoid.
    const page = pages[e.page - 1];
    const scanned = scannedOf[e.page - 1];
    const seenRow = Math.floor(e.pos / scanned.cols);
    const seenCol = e.pos % scanned.cols;
    // A quarter turn clockwise: the camera's leftmost column becomes the page's top row. Adjacency
    // survives either way round, so a wrong guess is a rotated page the owner can see at a glance,
    // never a scrambled one.
    const row = scanned.rotated ? seenCol : seenRow;
    const col = scanned.rotated ? scanned.rows - 1 - seenRow : seenCol;
    if (row >= page.rows || col >= page.cols || row < 0 || col < 0) {
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
      row,
      col,
      rowSpan: 1,
      colSpan: 1,
      type: 'card',
      cardId: e.cardId,
      // These are the owner's actual cards, so the pockets consume owned copies exactly as a
      // placement made from "My collection" does — and can be reclaimed the same way.
      fromCollection: true,
      // WHICH copy: the entry whose storage address is this pocket. This is the join key the
      // real-scan display needs to show the photo of the card actually sitting here, rather
      // than the newest photo of any copy of it (see DemoSlot.sourceEntryId).
      sourceEntryId: e.entryId,
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
    normalizedPages,
    rotatedPages,
    // Only a binder where NOTHING recorded a shape — no page, no unit — is running on the guess.
    assumedShape: !recordedAny && (binder.rows == null || binder.cols == null),
  };
}

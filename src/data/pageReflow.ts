/**
 * RESHAPING A BINDER WITHOUT LOSING A CARD.
 *
 * Changing the pocket layout used to be refused whenever anything would fall outside the new grid
 * ("Page 3 has content that wouldn't fit 2×2"), which is safe and unhelpful: the person has to
 * empty the very pages they were trying to re-lay out, by hand, before the control will work. This
 * reflows instead — every pocket keeps its ORDER and moves into the new grid, spilling onto more
 * pages when the new one holds fewer.
 *
 * Reading order is the contract. Pockets are taken page by page, top to bottom and left to right,
 * and laid back down the same way, so a binder someone filled in a deliberate sequence comes out in
 * that sequence at a different width. Nothing is dropped and nothing is silently overwritten: a
 * piece that cannot fit ANY page of the new shape (a 2×2 art block on a 1-column page) stops the
 * whole operation and is named, because quietly deleting the thing you were re-arranging is worse
 * than refusing.
 *
 * Pure and side-effect free — no store, no persistence, no ids minted for slots (a reflowed pocket
 * is the SAME pocket, so it keeps its id and with it its owned-copy claim, `sourceEntryId`).
 */
import { emptyPage, type DemoPage, type DemoSlot } from './binderTypes.ts';

export interface ReflowResult {
  /** The re-laid pages. Same slots (same ids), possibly spread over more or fewer pages. */
  pages: DemoPage[];
  /** How many pages the binder gained (positive) or shed (negative). */
  pageDelta: number;
  /** How many pockets ended up on a different page than they started on. */
  moved: number;
  /** Set when nothing could be done: the caller shows this and changes nothing. */
  blocked?: string;
}

/** Page-level settings that belong to the PAGE (its look), not to its contents. */
type PageStyleFields = Pick<DemoPage, 'title' | 'description' | 'track' | 'backgroundColor' | 'sleeve' | 'artBacking' | 'isPublic'>;

function styleOf(page: DemoPage | undefined): PageStyleFields {
  if (!page) return {};
  const { title, description, track, backgroundColor, sleeve, artBacking, isPublic } = page;
  return { title, description, track, backgroundColor, sleeve, artBacking, isPublic };
}

/** Reading order within a page: top to bottom, then left to right. */
function inReadingOrder(slots: readonly DemoSlot[]): DemoSlot[] {
  return [...slots].sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * First cell (row-major) where a `rowSpan × colSpan` block fits without touching an occupied cell,
 * or null when this page has no room left for it.
 */
function findCell(taken: boolean[][], rows: number, cols: number, rowSpan: number, colSpan: number):
{ row: number; col: number } | null {
  for (let row = 0; row + rowSpan <= rows; row += 1) {
    for (let col = 0; col + colSpan <= cols; col += 1) {
      let free = true;
      for (let r = row; r < row + rowSpan && free; r += 1) {
        for (let c = col; c < col + colSpan && free; c += 1) if (taken[r][c]) free = false;
      }
      if (free) return { row, col };
    }
  }
  return null;
}

function occupy(taken: boolean[][], slot: DemoSlot, row: number, col: number): void {
  for (let r = row; r < row + slot.rowSpan; r += 1) {
    for (let c = col; c < col + slot.colSpan; c += 1) taken[r][c] = true;
  }
}

/**
 * Re-lay every pocket of `pages` into `rows × cols` pages, preserving reading order.
 *
 * Page LOOK travels by position, not by content: page 1 keeps page 1's title, colour and sleeves
 * even though different cards may now sit on it. That is the honest choice for a reflow — the
 * pages are the binder's furniture, and the cards are what moved through them.
 */
export function reflowToShape(pages: readonly DemoPage[], rows: number, cols: number): ReflowResult {
  if (rows < 1 || cols < 1) return { pages: [...pages], pageDelta: 0, moved: 0, blocked: 'That page size is not valid.' };

  // Refuse before touching anything if a single piece can never fit the new grid.
  for (let i = 0; i < pages.length; i += 1) {
    const tooBig = pages[i].slots.find((slot) => slot.rowSpan > rows || slot.colSpan > cols);
    if (tooBig) {
      return {
        pages: [...pages],
        pageDelta: 0,
        moved: 0,
        blocked: `Page ${i + 1} holds a ${tooBig.rowSpan}×${tooBig.colSpan} piece, which does not fit a ${rows}×${cols} page. Remove it first.`,
      };
    }
  }

  /** Where each pocket started, so `moved` counts real movement rather than re-lays. */
  const startPage = new Map<string, number>();
  pages.forEach((page, index) => page.slots.forEach((slot) => startPage.set(slot.id, index)));

  const queue = pages.flatMap((page) => inReadingOrder(page.slots));
  const out: DemoPage[] = [];
  let taken: boolean[][] = [];
  let moved = 0;

  const startPageAt = (index: number): void => {
    const source = pages[index];
    // A page that already existed keeps its id (its share links and saved row survive); only a
    // genuine spill page is minted.
    const fresh = emptyPage(rows, cols);
    out.push({ ...fresh, ...styleOf(source), rows, cols, id: source?.id ?? fresh.id, slots: [] });
    taken = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  };

  startPageAt(0);
  for (const slot of queue) {
    let cell = findCell(taken, rows, cols, slot.rowSpan, slot.colSpan);
    if (!cell) {
      startPageAt(out.length);
      cell = findCell(taken, rows, cols, slot.rowSpan, slot.colSpan)!;
    }
    occupy(taken, slot, cell.row, cell.col);
    out[out.length - 1].slots.push({ ...slot, row: cell.row, col: cell.col });
    if (startPage.get(slot.id) !== out.length - 1) moved += 1;
  }

  /**
   * KEEP THE BINDER'S OWN LENGTH where the cards no longer reach. A 12-page binder that reflows
   * into 9 pages of content is still a 12-page binder — the person chose those pages, and the
   * empty ones at the back are where the next cards go. Only pages that existed keep existing;
   * this never invents any.
   */
  for (let index = out.length; index < pages.length; index += 1) {
    const source = pages[index];
    out.push({ ...source, rows, cols, slots: [] });
  }

  return { pages: out, pageDelta: out.length - pages.length, moved };
}

/** A short line for the toast: what the reshape actually did. */
export function reflowSummary(result: Pick<ReflowResult, 'moved' | 'pageDelta'>, rows: number, cols: number): string {
  const size = `${rows}×${cols}`;
  if (result.moved === 0 && result.pageDelta === 0) return `All pages set to ${size}`;
  const parts = [`All pages set to ${size}`];
  if (result.moved > 0) parts.push(`${result.moved} card${result.moved === 1 ? '' : 's'} reflowed`);
  if (result.pageDelta > 0) parts.push(`+${result.pageDelta} page${result.pageDelta === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

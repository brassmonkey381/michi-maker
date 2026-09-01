/**
 * HOW BIG THE PAGE GETS. The one rule this file exists to enforce: the page you are looking at
 * takes the space, and everything else pays rent.
 *
 * What it replaced: the current page and its two neighbours were each given an equal third of the
 * width, so at 1024–1920 the page being edited got under a third of the window while its two
 * DIMMED companions took twice that between them. A 4K monitor rendered the same 560px page a
 * tablet did.
 *
 * Two things had to move together. Widening the page without a height budget just pushes its lower
 * rows below the fold — a 3×3 at 900px wide is over 1200px tall, taller than the laptop it would
 * be running on. So the page is sized by whichever runs out first, width or height, which is what
 * "fit to window" means everywhere else it exists (Figma's Shift+1, every image viewer).
 *
 * AND THE MEASUREMENT CORRECTED THE PLAN. Fitting a 3×3 page into a 1080p window's height yields
 * about 540px — so the old 560px ceiling was already at the height limit, and on a 768-tall window
 * the honest fit is barely 320px. Height, not width, is what binds on a landscape monitor; the
 * audit had called it a width problem. Fitting alone would therefore have made the page SMALLER on
 * every laptop, which is the opposite of the point.
 *
 * Hence LEGACY_MIN_WIDTH: the fit may make the page bigger, never smaller than it renders today.
 * Tall and portrait windows grow past the old ceiling; short ones keep what they had and simply
 * scroll, as they already did. The reclaimed neighbour width is then what makes the page DOMINANT
 * rather than merely large — which was always the real complaint.
 *
 * Neighbours become PEEKS: a narrow strip of the real adjacent page, rendered at full scale and
 * clipped, the way the next page sits under your thumb in a physical binder. They keep their job —
 * showing what is next and accepting a dragged card — while costing a tenth of the width.
 *
 * Pure and dependency-free so `node --test` can exercise it (see binderLayout.test.ts); the
 * geometry constants mirror BinderGrid, which is the component that actually draws.
 */

/** Card box aspect (height ÷ width) — must match CARD_ASPECT in BinderGrid. */
export const CARD_ASPECT = 88 / 63;

/** Grid internals, mirroring BinderGrid's non-small branch (a page below 220px is "small"). */
const PAD = 12;
const GAP = 6;
const SMALL_PAD = 6;
const SMALL_GAP = 3;
/** Caption strip reserved under each row when text labels are on. */
const CAPTION_H = 34;
const SMALL_CAPTION_H = 30;
const SMALL_BELOW = 220;

/** The least of an adjacent page that still reads as a page edge and can take a dropped card. */
export const PEEK_WIDTH = 88;

/**
 * A peek may never exceed this share of the page. The page is height-capped on a landscape
 * monitor, so on a wide screen there is width left over once it has taken all it can use; rather
 * than leave that as blank margin, the peeks absorb it and show more of the neighbouring pages.
 * The ratio is what stops that drifting back into the equal-thirds layout this replaced — at a
 * third each, the page still outweighs both peeks together.
 */
export const PEEK_MAX_RATIO = 1 / 3;

/** Space between the peek and the page. */
export const SPREAD_GAP = 12;

/** Below this there is no room for a page AND two peeks; the page goes it alone. */
export const PEEK_MIN_WIDTH = 700;

/** The floor a page is never squeezed under, even when the viewport is short. */
export const MIN_PAGE_WIDTH = 320;

/**
 * What the page rendered at before any of this existed. The height fit is only ever allowed to
 * grow the page past this, never to shrink it below — so no window can come out worse than it was.
 */
export const LEGACY_MIN_WIDTH = 560;

/**
 * The height a page occupies at a given width — the same sum BinderGrid lays out, so the two
 * cannot drift without this file's tests noticing.
 */
export function pageHeightAt(width: number, rows: number, cols: number, captionsOn: boolean): number {
  const small = width < SMALL_BELOW;
  const pad = small ? SMALL_PAD : PAD;
  const gap = small ? SMALL_GAP : GAP;
  const captionH = captionsOn ? (small ? SMALL_CAPTION_H : CAPTION_H) : 0;
  const cellW = (width - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = cellW * CARD_ASPECT;
  return (cellH + captionH) * rows + gap * (rows - 1) + pad * 2;
}

/**
 * The inverse: the widest page whose height still fits `height`. Solved algebraically rather than
 * by search, from the same terms as pageHeightAt.
 */
export function widthForHeight(height: number, rows: number, cols: number, captionsOn: boolean): number {
  const captionH = captionsOn ? CAPTION_H : 0;
  const usable = height - captionH * rows - GAP * (rows - 1) - PAD * 2;
  if (usable <= 0) return MIN_PAGE_WIDTH;
  const cellH = usable / rows;
  const cellW = cellH / CARD_ASPECT;
  return cellW * cols + PAD * 2 + GAP * (cols - 1);
}

export interface SpreadLayout {
  /** Width of the page being looked at. */
  pageWidth: number;
  /** Visible width of each neighbour strip; 0 when there is no room for peeks. */
  peekWidth: number;
  /** Whether peeks should be drawn at all. */
  showPeeks: boolean;
}

/**
 * Lay out the single-sided view.
 *
 * `availableHeight` of 0 or less means "no height budget known" — the caller could not measure —
 * and the page is then sized by width alone, which is the old behaviour and never worse than it.
 */
export function spreadLayout({
  availableWidth,
  availableHeight,
  rows,
  cols,
  captionsOn,
  hasNeighbours,
  maxWidth,
}: {
  availableWidth: number;
  availableHeight: number;
  rows: number;
  cols: number;
  captionsOn: boolean;
  hasNeighbours: boolean;
  /** A ceiling the caller wants respected regardless (the print/share surfaces set one). */
  maxWidth?: number;
}): SpreadLayout {
  const showPeeks = hasNeighbours && availableWidth >= PEEK_MIN_WIDTH;
  // The page is served FIRST, against the smallest peeks that still work; only what it cannot use
  // is offered back to them. Sizing the peeks first would be the old mistake in a new costume.
  const widthBudget = showPeeks
    ? availableWidth - 2 * (PEEK_WIDTH + SPREAD_GAP)
    : availableWidth;

  // The height fit may only ever GROW the page: a short window keeps what it renders today and
  // scrolls, exactly as it already does, rather than being shrunk in the name of fitting.
  const byHeight = availableHeight > 0 ? widthForHeight(availableHeight, rows, cols, captionsOn) : Infinity;
  const target = Math.max(byHeight, LEGACY_MIN_WIDTH);
  const fitted = Math.min(widthBudget, target, maxWidth ?? Infinity);
  const pageWidth = Math.floor(Math.max(fitted, Math.min(MIN_PAGE_WIDTH, availableWidth)));

  const slack = availableWidth - pageWidth - 2 * SPREAD_GAP;
  const peekWidth = showPeeks
    ? Math.floor(Math.min(Math.max(PEEK_WIDTH, slack / 2), pageWidth * PEEK_MAX_RATIO))
    : 0;

  return { pageWidth, peekWidth, showPeeks };
}

/**
 * The double-sided book. It has no dimmed neighbours — both pages are live and editable — so its
 * only constraint was the width cap, and its fix is the height fit alone. Measured separately
 * because the two modes fail in opposite ways: the spread wasted space on companions, the book
 * wasted it on a ceiling.
 */
export function bookLayout({
  availableWidth,
  availableHeight,
  rows,
  cols,
  captionsOn,
  gap,
  maxWidth,
}: {
  availableWidth: number;
  availableHeight: number;
  rows: number;
  cols: number;
  captionsOn: boolean;
  gap: number;
  maxWidth?: number;
}): number {
  const byWidth = (availableWidth - gap) / 2;
  const byHeight = availableHeight > 0 ? widthForHeight(availableHeight, rows, cols, captionsOn) : Infinity;
  const target = Math.max(byHeight, LEGACY_MIN_WIDTH);
  const fitted = Math.min(byWidth, target, maxWidth ?? Infinity);
  return Math.floor(Math.max(fitted, Math.min(MIN_PAGE_WIDTH, byWidth)));
}

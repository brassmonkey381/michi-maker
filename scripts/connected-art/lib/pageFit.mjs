/**
 * WHAT SHAPE IS THIS GROUP, AND WHICH BINDER PAGE HOLDS IT?
 *
 * Connected artwork is a LAYOUT, not a list. "Taillow, Buizel, Mankey, Lotad, Paras, Ponyta,
 * Yanma" is seven cards, but whether the illustration runs 1x7 along a shelf or folds into 2x4
 * is invisible in the caption and decides which binder it belongs in. The shape comes from the
 * photograph's detection boxes and from nothing else.
 *
 * THE RULE (owner, 2026-09-23): a group of R rows by C columns goes in the SMALLEST page that
 * fits both dimensions. A 2x3 group needs 2 rows and 3 columns, 2x2 cannot hold it, so it lands
 * on 3x3 with a row to spare. Page size is a BINDER-WIDE setting in this product, so "which page
 * fits" is also "which binder it belongs in", and that is why the binders are split by shape
 * rather than by theme.
 */

/** The page shapes a real binder comes in (mirrors src/data/binderPhysics REAL_PAGE_SIZES). */
export const PAGE_SIZES = [
  { label: '2x2', rows: 2, cols: 2 },
  { label: '3x3', rows: 3, cols: 3 },
  { label: '3x4', rows: 3, cols: 4 },
  { label: '4x4', rows: 4, cols: 4 },
];

/**
 * Group detection boxes into rows by their vertical centres.
 *
 * Cards photographed on a table are never perfectly aligned, so rows are found by clustering
 * rather than by equality: a box starts a new row when its centre sits more than `tolerance` of
 * the median card height below the current row's centre. Within a row, boxes are ordered left to
 * right, which is the order the caption names them and the order the art reads.
 *
 * @param {{xmin:number,ymin:number,xmax:number,ymax:number}[]} boxes
 * @param {number} tolerance fraction of median card height that still counts as the same row
 */
export function toGrid(boxes, tolerance = 0.5) {
  if (!boxes || boxes.length === 0) return { rows: 0, cols: 0, grid: [] };

  const withCentres = boxes.map((b, i) => ({
    i,
    box: b,
    cx: (b.xmin + b.xmax) / 2,
    cy: (b.ymin + b.ymax) / 2,
    h: b.ymax - b.ymin,
  }));

  const heights = withCentres.map((b) => b.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 1;
  const gap = medianH * tolerance;

  const byY = [...withCentres].sort((a, b) => a.cy - b.cy);
  const rows = [];
  let current = [byY[0]];
  for (let k = 1; k < byY.length; k += 1) {
    // Compare against the row's RUNNING MEAN, not its first member: a long row drifts, and
    // comparing to the first card alone splits a tilted row in half.
    const mean = current.reduce((s, b) => s + b.cy, 0) / current.length;
    if (Math.abs(byY[k].cy - mean) <= gap) current.push(byY[k]);
    else {
      rows.push(current);
      current = [byY[k]];
    }
  }
  rows.push(current);

  const grid = rows.map((r) => [...r].sort((a, b) => a.cx - b.cx).map((b) => b.i));
  return { rows: grid.length, cols: Math.max(...grid.map((r) => r.length)), grid };
}

/**
 * The smallest page that fits R rows by C columns, or null when nothing does.
 *
 * Null is a real answer, not a failure: a single row of five cards needs five columns and the
 * widest page has four, so that group cannot be laid out without breaking the line the artwork
 * makes. Those are worth seeing rather than silently wrapping.
 */
export function fitPage(rows, cols) {
  if (!rows || !cols) return null;
  return PAGE_SIZES.find((p) => p.rows >= rows && p.cols >= cols) ?? null;
}

/**
 * Same question for a group that may be rotated. A 1x5 does not fit, but a 5x1 standing upright
 * does not either; a 2x3 and a 3x2 are both 3x3. Reports whether turning it helps, which is a
 * decision for a person rather than something to do silently, because rotating a scene that
 * reads left to right destroys it.
 */
export function fitPageAllowingRotation(rows, cols) {
  const direct = fitPage(rows, cols);
  if (direct) return { page: direct, rotated: false };
  const turned = fitPage(cols, rows);
  return turned ? { page: turned, rotated: true } : { page: null, rotated: false };
}

/** Where a group sits on its page: top-left, so the art starts where the eye does. */
export function placeOnPage(grid, page) {
  const cells = [];
  grid.forEach((row, r) => {
    row.forEach((boxIndex, c) => {
      if (r < page.rows && c < page.cols) cells.push({ boxIndex, row: r, col: c });
    });
  });
  return cells;
}

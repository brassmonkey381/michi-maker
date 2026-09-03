/**
 * THE SHAPE A BINDER'S PAGES ARE, said the way the page-size picker says it: ROWS×COLUMNS, so
 * "3×4" is three rows of four pockets — the landscape twelve-pocket page.
 *
 * Page size applies to every page of a binder at once, so nearly every binder has one shape and
 * this is a lookup of the first page. Older binders and imports can still mix (a 3×3 binder that
 * grew a 3×4 page before the setting became binder-wide), and those say so rather than lying
 * about a shape most of their pages do not have.
 */
export interface ShapedPage {
  rows: number;
  cols: number;
}

/** "3×4" for a binder whose pages all share one shape, "mixed" when they do not, "" for none. */
export function binderShapeLabel(pages: readonly ShapedPage[]): string {
  const first = pages[0];
  if (!first) return '';
  const uniform = pages.every((p) => p.rows === first.rows && p.cols === first.cols);
  return uniform ? `${first.rows}×${first.cols}` : 'mixed';
}

/**
 * The one meta line every binder tile shares: shape, then page count — "3×4 · 12 pages". The
 * shape leads because it is the thing a collector picks a binder by; the count is the size.
 */
export function binderMetaLine(pages: readonly ShapedPage[]): string {
  const n = pages.length;
  const count = `${n} ${n === 1 ? 'page' : 'pages'}`;
  const shape = binderShapeLabel(pages);
  return shape ? `${shape} · ${count}` : count;
}

/**
 * Which cuts the Slice Studio offers, and in what order.
 *
 * There are more shapes worth having than fit on one line, and the first version put all of them
 * in one wrapping row — which ran off the side of the panel on narrower windows and buried the
 * three people reach for most among seven they rarely touch.
 *
 * So the row is short by default and opens on request. Two rules keep the short row honest:
 *
 *   * the shape you are CURRENTLY cutting into is always shown, or the picker would display no
 *     active chip and look like nothing was selected;
 *   * the shape of the PAGE you came from is always shown, because it is the default and the one
 *     you are most likely to want back.
 *
 * Both are appended rather than substituted, so the common five keep their places.
 */

export interface SliceShape {
  rows: number;
  cols: number;
}

/**
 * The ones people reach for: the standard page, the wide page, a two-pocket vertical panorama, a
 * square block, and a single full-bleed pocket.
 *
 * Labelled ROWS×COLUMNS, which is how REAL_PAGE_SIZES has always spoken — "3×4" is the real
 * 12-pocket side-load page, three rows of four. It used to be labelled columns×rows here and only
 * here, so the same four characters meant a 3-wide, 4-tall cut in the studio and a 4-wide, 3-tall
 * page in the binder: pick "3×4" in both and the pieces did not fit the page they were cut for.
 */
export const COMMON_SLICE_SHAPES: SliceShape[] = [
  { rows: 3, cols: 3 },
  { rows: 3, cols: 4 },
  { rows: 2, cols: 1 },
  { rows: 2, cols: 2 },
  { rows: 1, cols: 1 },
];

/** Everything else worth cutting into, once "more" is open. */
export const OTHER_SLICE_SHAPES: SliceShape[] = [
  { rows: 1, cols: 2 },
  { rows: 1, cols: 3 },
  { rows: 3, cols: 1 },
  { rows: 2, cols: 3 },
  { rows: 3, cols: 2 },
  { rows: 4, cols: 3 },
  { rows: 4, cols: 4 },
];

export const shapeKey = (s: SliceShape) => `${s.rows}x${s.cols}`;
export const shapeLabel = (s: SliceShape) => `${s.rows}×${s.cols}`;
const same = (a: SliceShape, b: SliceShape) => a.rows === b.rows && a.cols === b.cols;

/**
 * The shapes to draw.
 *
 * `expanded` is the "+ more" toggle. Collapsed, it is the common five plus whichever of the current
 * and page shapes are not already among them; expanded, it is every shape there is — still with the
 * page's own appended if it is somehow neither common nor listed, so a page shape the presets do not
 * anticipate is never unreachable.
 */
export function visibleSliceShapes(
  current: SliceShape,
  page: SliceShape,
  expanded: boolean,
): SliceShape[] {
  const base = expanded ? [...COMMON_SLICE_SHAPES, ...OTHER_SLICE_SHAPES] : [...COMMON_SLICE_SHAPES];
  for (const extra of [current, page]) {
    if (!base.some((s) => same(s, extra))) base.push({ ...extra });
  }
  return base;
}

/** Is there anything left to reveal? A "+ more" that opens onto nothing new is a lie. */
export function hasMoreSliceShapes(current: SliceShape, page: SliceShape): boolean {
  const shown = visibleSliceShapes(current, page, false);
  return visibleSliceShapes(current, page, true).some((s) => !shown.some((v) => same(v, s)));
}

/**
 * Snapping the crop window to the page's own grid, and zooming about a point.
 *
 * The Slice Studio frames an image behind a rows×cols grid of pockets and cuts it along the
 * pocket lines. The one thing you almost always want and could not previously get is an EXACT
 * alignment: the left edge of the art flush with the left edge of a pocket, or the middle of the
 * art on the crease between two. By hand that is a pixel hunt you lose — a drag lands one or two
 * pixels off and the slice shows it, because the seam between two pockets magnifies every error.
 *
 * So the window snaps: while you pan or zoom, the image's own edges and centre click onto the
 * pocket boundaries when they come close. It is a pull, never a cage — the window still takes any
 * value, snapping only bends the last few pixels, and the studio's Snap toggle turns it off
 * entirely. Nothing here removes a position that was reachable before.
 *
 * The window is `{x, y, w, h}` in fractions of the (rotated) image, so an image coordinate `u`
 * lands at canvas pixel `((u - x) / w) * canvasPx`. Every function below is that one identity
 * rearranged, which is why they are here as pure functions rather than inline in a gesture
 * handler: this is the arithmetic that is worth being sure about.
 */

export interface Win {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The image features that seek a grid line: its two edges and its middle. */
export const IMAGE_FEATURES = [0, 0.5, 1] as const;

/** Which alignment to keep when a scale cannot keep them all — see `snapAnchor`. */
const ANCHOR_PREFERENCE = [0, 1, 0.5] as const;

/** How close, in canvas pixels, an edge has to come before it clicks into place. */
export const SNAP_TOLERANCE_PX = 7;

/**
 * Every canvas position a slice can fall on, in pixels: both sides of every pocket (a gap has two
 * edges, and art aligned to one is not aligned to the other), plus the canvas centre line.
 *
 * Returned sorted and de-duplicated so the nearest-line search below is honest about ties.
 */
export function gridLines(count: number, cell: number, gap: number): number[] {
  if (!(count > 0) || !(cell > 0)) return [];
  const out = new Set<number>();
  for (let k = 0; k < count; k++) {
    const start = k * (cell + gap);
    out.add(start);
    out.add(start + cell);
  }
  out.add((count * (cell + gap) - gap) / 2);
  return [...out].sort((a, b) => a - b);
}

export interface AxisSnap {
  /** The window origin on this axis, pulled to a line if one was in reach. */
  value: number;
  /** Where to draw the alignment guide, in canvas pixels; null when nothing snapped. */
  guide: number | null;
}

/**
 * Pull one axis of the window onto the nearest grid line, if any line is within tolerance.
 *
 * `pos` is the window origin (x or y) and `size` its extent, both in image fractions; `canvasPx`
 * is that axis's length on screen. Distance is judged in CANVAS pixels, not image fractions —
 * a tolerance in fractions would mean a snap that grabs from a mile away when zoomed in and never
 * fires when zoomed out, which is exactly backwards from how it should feel.
 */
export function snapAxis(
  pos: number,
  size: number,
  canvasPx: number,
  lines: readonly number[],
  tolerancePx: number = SNAP_TOLERANCE_PX,
): AxisSnap {
  if (!(canvasPx > 0) || !(size > 0) || !lines.length) return { value: pos, guide: null };
  let best: AxisSnap = { value: pos, guide: null };
  let bestDist = Infinity;
  for (const u of IMAGE_FEATURES) {
    // Where this feature currently sits on the canvas, and the origin that would put it on a line.
    const at = ((u - pos) / size) * canvasPx;
    for (const line of lines) {
      const dist = Math.abs(at - line);
      if (dist > tolerancePx || dist >= bestDist) continue;
      bestDist = dist;
      best = { value: u - (line * size) / canvasPx, guide: line };
    }
  }
  return best;
}

/**
 * The guides to draw for a window that is ALREADY where it is going to be.
 *
 * Derived rather than remembered: after a snap the feature sits exactly on the line, so asking
 * "is anything exactly aligned right now?" reproduces the answer without a second piece of state
 * that could disagree with the window. Half a pixel of slack absorbs the float arithmetic.
 */
export function activeGuides(
  pos: number,
  size: number,
  canvasPx: number,
  lines: readonly number[],
  slackPx = 0.5,
): number[] {
  if (!(canvasPx > 0) || !(size > 0)) return [];
  const out = new Set<number>();
  for (const u of IMAGE_FEATURES) {
    const at = ((u - pos) / size) * canvasPx;
    for (const line of lines) if (Math.abs(at - line) <= slackPx) out.add(line);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The anchor that keeps this axis lined up with whatever it is lined up with RIGHT NOW.
 *
 * Zooming about the middle is the correct default when nothing is aligned, and exactly wrong when
 * something is: you push the art flush against the left-hand pockets, press +, and the alignment
 * you just made slides away from the edge because both sides grew equally. What you meant was
 * "grow to the right, from that edge".
 *
 * Returned as a fraction of the canvas, ready for `zoomWindow`: an image edge sitting at canvas
 * pixel L stays at L if the zoom is anchored at L / canvasPx. Null when nothing is aligned, which
 * is the caller's cue to zoom about the middle as before.
 *
 * Edges win over the middle, and the left/top edge wins over the right/bottom, because an image
 * aligned on two features at once cannot keep both through a scale — only one point can stay put —
 * and pinning the near edge is what "snapped into the corner" means.
 */
export function snapAnchor(
  pos: number,
  size: number,
  canvasPx: number,
  lines: readonly number[],
  slackPx = 0.5,
): number | null {
  if (!(canvasPx > 0) || !(size > 0)) return null;
  // Deliberately NOT IMAGE_FEATURES order, which puts the middle before the far edge: the search
  // returns the first hit, so the order IS the preference.
  for (const u of ANCHOR_PREFERENCE) {
    const at = ((u - pos) / size) * canvasPx;
    for (const line of lines) {
      if (Math.abs(at - line) <= slackPx) return line / canvasPx;
    }
  }
  return null;
}

/**
 * Zoom by `factor` about an anchor, so the image point under the anchor stays under it.
 *
 * `factor` scales the WINDOW, so it is inverted from how a person thinks about zoom: a factor
 * below 1 shrinks the window, which shows less image, which is zooming IN. The anchor is a
 * fraction of the canvas — 0.5, 0.5 is the middle, which is what a keyboard or button zoom uses;
 * a wheel or a pinch passes the pointer instead, and that is the whole difference between a zoom
 * that feels like a tool and one that shoves your subject off screen every notch.
 */
export function zoomWindow(win: Win, factor: number, anchorX: number, anchorY: number): Win {
  const w = win.w * factor;
  const h = win.h * factor;
  return {
    w,
    h,
    x: win.x + (win.w - w) * anchorX,
    y: win.y + (win.h - h) * anchorY,
  };
}

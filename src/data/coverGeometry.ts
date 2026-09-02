/**
 * THE ARITHMETIC OF A BOX ON A COVER: where it is in pixels, where its handles are, what a drag
 * on a handle does to it, what an angle snaps to, which lines it snaps against, and how a crop
 * composes. Pure, so `npm test` can be sure of it, and every function carries the 'worklet'
 * directive so the canvas layer can call it on the UI thread while a finger is down — node
 * ignores the directive.
 *
 * FRAMES. A Box is in the SURFACE frame: pixels from the surface's top-left, centre-anchored,
 * with `rot` clockwise degrees about that centre. A decoration is in fractions (see binderTypes);
 * decorationBox / boxToDecoration are the two conversions and nothing else here knows about
 * fractions. Both w and h come from the surface WIDTH, on purpose — see the type's doc.
 */

import type { CoverDecoration, CoverImageDecoration } from './binderTypes.ts';

/** Where the shell's raised seam runs, as a fraction of the cover's width. */
export const SEAM_INSET = 0.045;
/** The crop pan leash: a corner may not be dragged past this fraction of the box off the image. */
export const CROP_OVER = 0.85;
/** Pixels within which an edge or a centre is pulled onto a line. */
export const SNAP_TOLERANCE_PX = 7;
/** How far above the top edge the rotation grab sits. */
export const ROTATE_HANDLE_OFFSET = 26;

export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const DEG = Math.PI / 180;

function rotatePoint(x: number, y: number, deg: number): { x: number; y: number } {
  'worklet';
  const r = deg * DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/**
 * The box a decoration occupies on a surface W×H px. A legacy row (no h) is the old w×w square —
 * the picture is letterboxed inside it by the renderer, so this is the box that was always drawn.
 */
export function decorationBox(d: CoverDecoration, W: number, H: number): Box {
  'worklet';
  const w = d.w * W;
  const h = (d.h ?? d.w) * W;
  return { cx: d.x * W, cy: d.y * H, w, h, rot: d.rot ?? 0 };
}

export function boxToDecoration(
  b: Box,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number; rot: number } {
  'worklet';
  const norm = ((b.rot % 360) + 360) % 360;
  return { x: b.cx / W, y: b.cy / H, w: b.w / W, h: b.h / W, rot: norm };
}

/**
 * Handle positions in the surface frame, rotated with the box. 'rotate' sits above the top edge,
 * along the box's own up direction, so it turns with the box as Photoshop's does.
 */
export function handlePoints(b: Box): Record<Handle, { x: number; y: number }> & { rotate: { x: number; y: number } } {
  'worklet';
  const hw = b.w / 2;
  const hh = b.h / 2;
  const at = (lx: number, ly: number) => {
    const p = rotatePoint(lx, ly, b.rot);
    return { x: b.cx + p.x, y: b.cy + p.y };
  };
  return {
    n: at(0, -hh),
    ne: at(hw, -hh),
    e: at(hw, 0),
    se: at(hw, hh),
    s: at(0, hh),
    sw: at(-hw, hh),
    w: at(-hw, 0),
    nw: at(-hw, -hh),
    rotate: at(0, -hh - ROTATE_HANDLE_OFFSET),
  };
}

/**
 * A drag on a handle. The pointer delta is taken into the box's own frame (rotated by -rot), the
 * opposite edge or corner stays where it is, corners keep the aspect unless told otherwise, and
 * `fromCentre` (Alt) grows both sides at once about the centre instead.
 */
export function resizeBox(
  b: Box,
  handle: Handle,
  dx: number,
  dy: number,
  o: { keepAspect: boolean; fromCentre: boolean; minPx: number },
): Box {
  'worklet';
  const local = rotatePoint(dx, dy, -b.rot);
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  const isCorner = sx !== 0 && sy !== 0;
  const mult = o.fromCentre ? 2 : 1;

  let w = b.w + sx * local.x * mult;
  let h = b.h + sy * local.y * mult;

  if (isCorner && o.keepAspect) {
    // Whichever axis the pointer moved MORE along, proportionally, wins; the other follows.
    const aspect = b.w / b.h;
    const byW = Math.abs(w / b.w - 1);
    const byH = Math.abs(h / b.h - 1);
    if (byW >= byH) h = w / aspect;
    else w = h * aspect;
  }
  if (isCorner && o.keepAspect) {
    // The floor applies to the SHORTER side, and the longer follows — flooring both and then
    // re-deriving one from the other would push the derived side back under the floor.
    const aspect = b.w / b.h;
    w = Math.max(w, o.minPx, o.minPx * aspect);
    h = w / aspect;
  } else {
    w = Math.max(o.minPx, w);
    h = Math.max(o.minPx, h);
  }

  if (o.fromCentre) return { ...b, w, h };

  // The far side is anchored: the centre moves by half the growth, along the dragged side, in the
  // box's own frame — then back into the surface frame.
  const shift = rotatePoint((sx * (w - b.w)) / 2, (sy * (h - b.h)) / 2, b.rot);
  return { cx: b.cx + shift.x, cy: b.cy + shift.y, w, h, rot: b.rot };
}

/** 15° steps by default, with a 3° pull — no angle snap existed before; translation-only. */
export function snapAngle(deg: number, step: number = 15, tol: number = 3): number {
  'worklet';
  const nearest = Math.round(deg / step) * step;
  return Math.abs(deg - nearest) <= tol ? nearest : deg;
}

/**
 * Rotation by pointer. `start` is the angle of the pointer from the centre when the grab began and
 * the rotation the box had then; the box turns by however far the pointer has swept since.
 * Constrain (Shift) locks to 15° steps.
 */
export function rotateBox(
  b: Box,
  pointer: { x: number; y: number },
  start: { angle0: number; rot0: number },
  o: { constrain: boolean },
): Box {
  'worklet';
  const angle = Math.atan2(pointer.y - b.cy, pointer.x - b.cx) / DEG;
  let rot = start.rot0 + (angle - start.angle0);
  rot = ((rot % 360) + 360) % 360;
  if (o.constrain) rot = (Math.round(rot / 15) * 15) % 360;
  return { ...b, rot };
}

/** The angle of a pointer from the box's centre, for seeding rotateBox's `angle0`. */
export function pointerAngle(b: Box, pointer: { x: number; y: number }): number {
  'worklet';
  return Math.atan2(pointer.y - b.cy, pointer.x - b.cx) / DEG;
}

/**
 * Everything a box can snap to: the surface's edges, its raised seam, its centre lines, an optional
 * N-division grid, and the edges and centres of every OTHER visible box (smart guides).
 */
export function surfaceLines(
  W: number,
  H: number,
  o: { seam: number; grid: number | null; others: Box[] },
): { x: number[]; y: number[] } {
  'worklet';
  const xs = new Set<number>([0, o.seam, W / 2, W - o.seam, W]);
  const ys = new Set<number>([0, o.seam, H / 2, H - o.seam, H]);
  if (o.grid && o.grid > 1) {
    for (let i = 1; i < o.grid; i += 1) {
      xs.add((W * i) / o.grid);
      ys.add((H * i) / o.grid);
    }
  }
  for (const ob of o.others) {
    // An unrotated neighbour offers its edges; any neighbour offers its centre.
    xs.add(ob.cx);
    ys.add(ob.cy);
    if (ob.rot % 180 === 0) {
      xs.add(ob.cx - ob.w / 2);
      xs.add(ob.cx + ob.w / 2);
      ys.add(ob.cy - ob.h / 2);
      ys.add(ob.cy + ob.h / 2);
    }
  }
  return { x: [...xs].sort((a, b) => a - b), y: [...ys].sort((a, b) => a - b) };
}

function nearestLine(values: number[], lines: number[], tol: number): { delta: number; line: number } | null {
  'worklet';
  let best: { delta: number; line: number } | null = null;
  let bestDist = Infinity;
  for (const v of values) {
    for (const line of lines) {
      const dist = Math.abs(v - line);
      if (dist > tol || dist >= bestDist) continue;
      bestDist = dist;
      best = { delta: line - v, line };
    }
  }
  return best;
}

/**
 * Pull the box onto the nearest lines within tolerance. An UNROTATED box snaps its edges and its
 * centre; a rotated one snaps its centre only — its edges are not axis-aligned, so "edge on a
 * line" would mean nothing you could see. Returns the guides to draw, or null where nothing bit.
 */
export function snapBox(
  b: Box,
  lines: { x: number[]; y: number[] },
  tolPx: number = SNAP_TOLERANCE_PX,
): { box: Box; guideX: number | null; guideY: number | null } {
  'worklet';
  const axisAligned = b.rot % 180 === 0;
  const xs = axisAligned ? [b.cx - b.w / 2, b.cx, b.cx + b.w / 2] : [b.cx];
  const ys = axisAligned ? [b.cy - b.h / 2, b.cy, b.cy + b.h / 2] : [b.cy];
  const sx = nearestLine(xs, lines.x, tolPx);
  const sy = nearestLine(ys, lines.y, tolPx);
  return {
    box: { ...b, cx: b.cx + (sx?.delta ?? 0), cy: b.cy + (sy?.delta ?? 0) },
    guideX: sx ? sx.line : null,
    guideY: sy ? sy.line : null,
  };
}

/**
 * A crop commit. `local` is the kept rectangle as fractions of the CURRENT box. The stored crop
 * window narrows to that sub-rectangle of itself, the box shrinks to match, and the centre moves
 * by the rotated offset of the kept rectangle's centre — so the pixels stay put on the cover and
 * only what is visible changes. Composes: cropping twice is one narrower crop.
 */
export function applyCrop(
  d: CoverImageDecoration,
  local: { l: number; t: number; r: number; b: number },
  /** Surface width ÷ height, so a width-unit offset can be applied to y, which is in height units. */
  surfaceAspect: number,
): CoverImageDecoration {
  'worklet';
  const l = Math.max(0, Math.min(1, local.l));
  const t = Math.max(0, Math.min(1, local.t));
  const r = Math.max(l + 0.02, Math.min(1, local.r));
  const bt = Math.max(t + 0.02, Math.min(1, local.b));
  const crop = d.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const w0 = d.w;
  const h0 = d.h ?? d.w;
  const next = {
    x: crop.x + l * crop.w,
    y: crop.y + t * crop.h,
    w: (r - l) * crop.w,
    h: (bt - t) * crop.h,
  };
  // The kept rectangle's centre, as an offset from the box centre, in width units, then rotated.
  const offX = ((l + r) / 2 - 0.5) * w0;
  const offY = ((t + bt) / 2 - 0.5) * h0;
  const rotated = rotatePoint(offX, offY, d.rot ?? 0);
  return {
    ...d,
    crop: next,
    w: w0 * (r - l),
    h: h0 * (bt - t),
    // x is in width units already; y is in height units, so the width-unit offset scales by W/H.
    x: d.x + rotated.x,
    y: d.y + rotated.y * surfaceAspect,
  };
}

/**
 * The resize cursor for a handle, given the box's rotation. Handles turn with the box, so 'n' on a
 * box at 90° is an east-west drag on screen.
 */
export function cursorFor(h: Handle, rot: number): 'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize' {
  'worklet';
  const base: Record<Handle, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
  const a = (((base[h] + rot) % 360) + 360) % 360;
  const oct = Math.round(a / 45) % 8;
  return oct === 0 || oct === 4
    ? 'ns-resize'
    : oct === 2 || oct === 6
      ? 'ew-resize'
      : oct === 1 || oct === 5
        ? 'nesw-resize'
        : 'nwse-resize';
}

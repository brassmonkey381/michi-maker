/**
 * ONE IMAGE, SHOWN THROUGH A WINDOW, TURNED AND FLIPPED — the arithmetic that puts a sub-rectangle
 * of a picture exactly into a box.
 *
 * This lived inside the Slice Studio's SourceImage and was on its way to a fifth copy (the
 * pocket grid, the tray chip, the share preview and the print sheet each carry their own). A
 * cover decoration is the same picture through the same window in a differently shaped box, so
 * the studio and the cover now call one function and disagree about nothing.
 *
 * Pure and relative-imported, so `npm test` can pin it.
 */

import type { ImageTransform } from './binderTypes.ts';
import type { Win } from './sliceSnap.ts';

export interface WindowedImageStyle {
  position: 'absolute';
  width: number;
  height: number;
  left: number;
  top: number;
  transform: ({ rotate: string } | { scaleX: number } | { scaleY: number })[];
}

/**
 * The style for an <Image> that fills a boxW×boxH box with the `crop` window of its source.
 *
 * `crop` is the shown window as fractions of the (already rotated and flipped) image, the slice
 * convention. The element is laid out at the size the WHOLE image would need for that window to
 * fill the box, offset so the window's corner sits on the box's corner. A quarter turn swaps the
 * element's width and height: it is laid out pre-rotation and the centre-anchored rotate lands it
 * exactly on the intended box — hence the (W − H) / 2 nudges.
 *
 * Absent crop ⇒ the whole image. The window's sides are floored at 2% so a degenerate stored crop
 * cannot ask for an element ten thousand times the box.
 */
export function windowedImageStyle(
  boxW: number,
  boxH: number,
  crop: Win | null | undefined,
  transform?: ImageTransform | null,
): WindowedImageStyle {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cw = Math.max(0.02, c.w);
  const ch = Math.max(0.02, c.h);
  const W = boxW / cw;
  const H = boxH / ch;
  // Written as a subtraction from zero so a window at the origin yields 0, not -0 — the same
  // pixel, but not the same value to a strict comparison.
  const left = 0 - (c.x / cw) * boxW;
  const top = 0 - (c.y / ch) * boxH;
  const rot = transform?.rot ?? 0;
  const quarter = rot === 90 || rot === 270;
  return {
    position: 'absolute',
    width: quarter ? H : W,
    height: quarter ? W : H,
    left: quarter ? left + (W - H) / 2 : left,
    top: quarter ? top + (H - W) / 2 : top,
    transform: [
      { rotate: `${rot}deg` },
      { scaleX: transform?.flipH ? -1 : 1 },
      { scaleY: transform?.flipV ? -1 : 1 },
    ],
  };
}

/**
 * MERGE AND SPLIT SLICED ART ON THE PAGE, without going back to Slice Studio.
 *
 * A sliced pocket is (imageUrl, crop window in fractions of the whole image, transform). Nothing
 * is re-encoded, so two neighbouring pieces of the same picture can become one piece by taking the
 * union of their windows, and one piece can become its cells by dividing its window. The union is
 * exactly what the studio's own Merge produces (see panelCrop there), so a merge made here looks
 * the same as one made there.
 *
 * The guard that matters is CONTINUITY. Two singles cut from the same image in two different
 * studio sessions have windows that do not line up, and a union of those would show a seam. So a
 * merge is only offered when the windows abut: the right edge of one is the left edge of the
 * other, at the same top and height (or the vertical equivalent).
 *
 * Pure, so `node --test` can reach it: no React, no store. The store applies the result.
 */
import type { DemoSlot, ImageTransform } from './binderTypes';

export type CropWindow = { x: number; y: number; w: number; h: number };

/** Why two pockets cannot be merged, for the button's hint. */
export type MergeRefusal =
  | 'not-art'
  | 'different-image'
  | 'different-transform'
  | 'not-adjacent'
  | 'not-continuous';

export type MergeResult =
  | { merged: DemoSlot; removedId: string }
  | { refused: MergeRefusal };

const EPS = 1e-3;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

const WHOLE: CropWindow = { x: 0, y: 0, w: 1, h: 1 };

const cropOf = (s: DemoSlot): CropWindow => s.imageCrop ?? WHOLE;

const transformKey = (t?: ImageTransform) =>
  t ? `${t.rot}|${t.flipH ? 1 : 0}|${t.flipV ? 1 : 0}` : '0|0|0';

/** A custom-art pocket: an artwork slot showing an image, not a catalogue card. */
export const isSlicedArt = (s: DemoSlot) => s.type === 'artwork' && !!s.imageUrl && !s.cardId;

/** What the merge button should say for these two pockets, in the user's words. */
export function mergeRefusalText(r: MergeRefusal): string {
  switch (r) {
    case 'not-art':
      return 'Merging is for two pieces of art.';
    case 'different-image':
      return 'These two come from different pictures.';
    case 'different-transform':
      return 'One of these is rotated or flipped differently.';
    case 'not-adjacent':
      return 'These two are not side by side.';
    case 'not-continuous':
      return 'These two were framed separately, so they would not join up.';
  }
}

/**
 * Join two pockets into one. The result keeps the identity (id, position) of whichever pocket is
 * first in reading order and spans both; its window is the union of the two. Order of arguments
 * does not matter.
 */
export function mergeSlices(a: DemoSlot, b: DemoSlot): MergeResult {
  if (!isSlicedArt(a) || !isSlicedArt(b)) return { refused: 'not-art' };
  if (a.imageUrl !== b.imageUrl) return { refused: 'different-image' };
  if (transformKey(a.imageTransform) !== transformKey(b.imageTransform)) {
    return { refused: 'different-transform' };
  }
  // Put them in reading order so there is one case per axis.
  const [first, second] = a.row < b.row || (a.row === b.row && a.col < b.col) ? [a, b] : [b, a];
  const sideBySide =
    first.row === second.row &&
    first.rowSpan === second.rowSpan &&
    first.col + first.colSpan === second.col;
  const stacked =
    first.col === second.col &&
    first.colSpan === second.colSpan &&
    first.row + first.rowSpan === second.row;
  if (!sideBySide && !stacked) return { refused: 'not-adjacent' };

  const ca = cropOf(first);
  const cb = cropOf(second);
  const continuous = sideBySide
    ? near(ca.y, cb.y) && near(ca.h, cb.h) && near(ca.x + ca.w, cb.x)
    : near(ca.x, cb.x) && near(ca.w, cb.w) && near(ca.y + ca.h, cb.y);
  if (!continuous) return { refused: 'not-continuous' };

  const crop: CropWindow = sideBySide
    ? { x: ca.x, y: ca.y, w: ca.w + cb.w, h: ca.h }
    : { x: ca.x, y: ca.y, w: ca.w, h: ca.h + cb.h };
  const merged: DemoSlot = {
    ...first,
    rowSpan: sideBySide ? first.rowSpan : first.rowSpan + second.rowSpan,
    colSpan: sideBySide ? first.colSpan + second.colSpan : first.colSpan,
    imageCrop: crop,
  };
  return { merged, removedId: second.id };
}

/**
 * Divide one pocket into its cells, each showing its share of the window. The top-left cell keeps
 * the pocket's id; the rest get ids from `newId`. Null when there is nothing to split: not sliced
 * art, or already a single cell.
 */
export function splitSlice(slot: DemoSlot, newId: () => string): DemoSlot[] | null {
  if (!isSlicedArt(slot)) return null;
  const { rowSpan, colSpan } = slot;
  if (rowSpan <= 1 && colSpan <= 1) return null;
  const c = cropOf(slot);
  const pieces: DemoSlot[] = [];
  for (let r = 0; r < rowSpan; r += 1) {
    for (let k = 0; k < colSpan; k += 1) {
      pieces.push({
        ...slot,
        id: r === 0 && k === 0 ? slot.id : newId(),
        row: slot.row + r,
        col: slot.col + k,
        rowSpan: 1,
        colSpan: 1,
        imageCrop: {
          x: c.x + (k / colSpan) * c.w,
          y: c.y + (r / rowSpan) * c.h,
          w: c.w / colSpan,
          h: c.h / rowSpan,
        },
      });
    }
  }
  return pieces;
}

/** Whether the split button should show for this pocket. */
export const canSplitSlice = (slot: DemoSlot) =>
  isSlicedArt(slot) && (slot.rowSpan > 1 || slot.colSpan > 1);

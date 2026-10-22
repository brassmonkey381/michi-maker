/**
 * The content identity of an art piece, shared by the tray (savedSlices) and the pockets that
 * show it (binder slots). Its own module, with no imports but types, so pure logic that compares
 * tray pieces with binder pockets (sliceTidy) runs under `node --test`.
 */
import type { DemoSlot, ImageTransform } from '@/data/binderTypes';

export interface SliceIdentity {
  imageUrl: string;
  /** Sub-rectangle of the image as fractions 0–1 (absent ⇒ whole image). */
  crop?: { x: number; y: number; w: number; h: number } | null;
  fit?: 'cover' | 'contain';
  transform?: ImageTransform;
  rs: number;
  cs: number;
}

/** One insertable art piece: an (imageUrl, crop, transform) window at a 1x1 or folded-1x2 footprint. */
export function sliceSignature(s: SliceIdentity): string {
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  const crop = s.crop ? [r6(s.crop.x), r6(s.crop.y), r6(s.crop.w), r6(s.crop.h)].join(',') : '-';
  const t = s.transform;
  return [
    s.imageUrl,
    crop,
    s.fit ?? 'cover',
    `${t?.rot ?? 0}${t?.flipH ? 'h' : ''}${t?.flipV ? 'v' : ''}`,
    `${s.rs}x${s.cs}`,
  ].join('|');
}

/** The same content identity computed from a PLACED artwork slot, so tray slices and binder
 *  pockets can be matched (used by delete-everywhere, the binder-art import scan, and Tidy up). */
export function slotSignature(slot: DemoSlot): string {
  return sliceSignature({
    imageUrl: slot.imageUrl ?? '',
    crop: slot.imageCrop ?? null,
    fit: (slot.imageFit as 'cover' | 'contain' | undefined) ?? 'cover',
    transform: slot.imageTransform,
    rs: slot.rowSpan,
    cs: slot.colSpan,
  });
}

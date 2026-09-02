/**
 * THE DECORATIONS ON A COVER SURFACE, as pure data: the cap, the normaliser that stands between
 * the database and the renderer, and the handful of list operations every editing path goes
 * through.
 *
 * Pure and relative-imported so `npm test` can reach it: node --test runs these files with no
 * bundler and no `@/` alias, so nothing here may import React, Supabase, or anything that does.
 * The slice type is therefore described structurally rather than imported from savedSlices.ts,
 * which pulls in both.
 */

import type { ArtAttribution } from '@/data/artworkLibrary';
import {
  uuidv4,
  type BinderCover,
  type CoverDecoration,
  type CoverImageDecoration,
  type CoverTextBgShape,
  type CoverTextDecoration,
  type ImageTransform,
} from './binderTypes.ts';

/**
 * TWELVE PER SURFACE, FOR NOW. The number is about the stored payload (the whole cover is one
 * jsonb column, rewritten on every gesture) and about how long the layers tray can be before it
 * stops being a list and starts being a scroll. Hidden layers count: they are stored.
 */
export const MAX_DECORATIONS_PER_SURFACE = 12;

/** Width of a new piece of art, as a fraction of the surface. */
export const NEW_DECORATION_W = 0.34;
/** A new sticker lands smaller — a logo is a badge, not a poster. */
export const NEW_STICKER_W = 0.28;
/**
 * Lowered from 0.06 so a small logo on a big cover is allowed. The cost is a 12px-wide sticker at a
 * 400px cover being hard to grab on the canvas; the layers tray is the selection route then.
 */
export const MIN_W = 0.03;
export const MAX_W = 1.6;
/** Perspective tilt stops here: past 45° a face reads as an edge. */
export const MAX_TILT = 45;

export const TEXT_SIZE_PRESETS = { S: 0.035, M: 0.06, L: 0.09, XL: 0.13 } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Clockwise degrees onto [0, 360). `(rot - 15) % 360` used to go negative; this does not. */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = deg % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r;
}

const FONTS = new Set(['sans', 'serif', 'rounded', 'mono', 'brand', 'marker']);
const BG_SHAPES = new Set(['none', 'rect', 'rounded', 'postit', 'notecard', 'postcard', 'circle', 'tag']);
const MASKS = new Set(['rect', 'rounded', 'ellipse']);

/**
 * One decoration, checked. Anything stored can be stale or hand-edited; a row that is not an
 * object, has no string id, or has a non-finite position is DROPPED rather than guessed at — a
 * cover with eleven good stickers and one broken one should show eleven stickers.
 *
 * Deliberately never adds `h`: that is the editor's decision on the first transform, and a read
 * that changed a picture would be a read that moved someone's cover.
 */
function normalizeOne(raw: unknown): CoverDecoration | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (!finite(r.x) || !finite(r.y) || !finite(r.w)) return null;

  const base = {
    id: r.id,
    x: clamp01(r.x),
    y: clamp01(r.y),
    w: Math.min(MAX_W, Math.max(MIN_W, r.w)),
    ...(finite(r.h) ? { h: Math.min(MAX_W, Math.max(MIN_W, r.h)) } : {}),
    ...(finite(r.rot) && r.rot !== 0 ? { rot: normalizeAngle(r.rot) } : {}),
    ...(finite(r.tiltX) && r.tiltX !== 0 ? { tiltX: Math.max(-MAX_TILT, Math.min(MAX_TILT, r.tiltX)) } : {}),
    ...(finite(r.tiltY) && r.tiltY !== 0 ? { tiltY: Math.max(-MAX_TILT, Math.min(MAX_TILT, r.tiltY)) } : {}),
    ...(r.flipH === true ? { flipH: true } : {}),
    ...(r.flipV === true ? { flipV: true } : {}),
    ...(finite(r.opacity) && r.opacity < 1 ? { opacity: clamp01(r.opacity) } : {}),
    ...(r.hidden === true ? { hidden: true } : {}),
    ...(r.locked === true ? { locked: true } : {}),
    ...(typeof r.name === 'string' && r.name.trim() ? { name: r.name.trim().slice(0, 60) } : {}),
    ...(r.mask && typeof r.mask === 'object' && MASKS.has(String((r.mask as { shape?: unknown }).shape))
      ? {
          mask: {
            shape: (r.mask as { shape: 'rect' | 'rounded' | 'ellipse' }).shape,
            ...(finite((r.mask as { radius?: unknown }).radius)
              ? { radius: clamp01((r.mask as { radius: number }).radius) }
              : {}),
          },
        }
      : {}),
  };

  if (r.kind === 'text') {
    if (typeof r.text !== 'string') return null;
    if (typeof r.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(r.color)) return null;
    const bgRaw = r.bg as Record<string, unknown> | undefined;
    const bg =
      bgRaw && typeof bgRaw === 'object' && BG_SHAPES.has(String(bgRaw.shape)) && bgRaw.shape !== 'none'
        ? {
            shape: bgRaw.shape as Exclude<CoverTextBgShape, 'none'>,
            color: typeof bgRaw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(bgRaw.color) ? bgRaw.color : '#fff3a8',
            ...(finite(bgRaw.opacity) && bgRaw.opacity < 1 ? { opacity: clamp01(bgRaw.opacity) } : {}),
            ...(finite(bgRaw.pad) ? { pad: Math.max(0, Math.min(0.2, bgRaw.pad)) } : {}),
          }
        : undefined;
    const text: CoverTextDecoration = {
      ...base,
      kind: 'text',
      text: r.text.slice(0, 500),
      font: FONTS.has(String(r.font)) ? (r.font as CoverTextDecoration['font']) : 'sans',
      size: finite(r.size) ? Math.max(0.01, Math.min(0.5, r.size)) : TEXT_SIZE_PRESETS.M,
      color: r.color,
      ...(r.weight === 'bold' ? { weight: 'bold' as const } : {}),
      ...(r.italic === true ? { italic: true } : {}),
      ...(r.align === 'left' || r.align === 'right' ? { align: r.align } : {}),
      ...(finite(r.leading) ? { leading: Math.max(0.8, Math.min(2, r.leading)) } : {}),
      ...(bg ? { bg } : {}),
    };
    return text;
  }

  // An image. A row written before `kind` existed is art; nothing else was possible then.
  const imageUrl = typeof r.imageUrl === 'string' && r.imageUrl ? r.imageUrl : undefined;
  const cardId = typeof r.cardId === 'string' && r.cardId ? r.cardId : undefined;
  if (!imageUrl && !cardId) return null;
  const crop = r.crop as Record<string, unknown> | undefined;
  const image: CoverImageDecoration = {
    ...base,
    kind: r.kind === 'sticker' ? 'sticker' : 'art',
    ...(imageUrl ? { imageUrl } : {}),
    ...(cardId ? { cardId } : {}),
    ...(finite(r.aspect) && r.aspect > 0 ? { aspect: r.aspect } : {}),
    ...(crop && typeof crop === 'object' && finite(crop.x) && finite(crop.y) && finite(crop.w) && finite(crop.h) && crop.w > 0 && crop.h > 0
      ? { crop: { x: clamp01(crop.x), y: clamp01(crop.y), w: clamp01(crop.w), h: clamp01(crop.h) } }
      : {}),
    ...(typeof r.stickerId === 'string' && r.stickerId ? { stickerId: r.stickerId } : {}),
    ...(r.attribution && typeof r.attribution === 'object' ? { attribution: r.attribution as ArtAttribution } : {}),
  };
  return image;
}

/**
 * The cover as the renderer may trust it. Applied at the one read site in binderRepo, and
 * defensively at the top of the cover renderer for example binders that never pass through it.
 * A surface with nothing left on it is dropped rather than kept empty.
 */
export function normalizeCover(cover: BinderCover): BinderCover {
  if (!cover.surfaces) return cover;
  const surfaces: NonNullable<BinderCover['surfaces']> = {};
  for (const [key, list] of Object.entries(cover.surfaces)) {
    if (!Array.isArray(list)) continue;
    const kept = list.map(normalizeOne).filter((d): d is CoverDecoration => d !== null).slice(0, MAX_DECORATIONS_PER_SURFACE);
    if (kept.length) surfaces[key as keyof typeof surfaces] = kept;
  }
  return { ...cover, surfaces };
}

/**
 * Add, subject to the cap. Returns the SAME array when full — the shift idiom, so a caller that
 * compares references knows nothing happened and no write goes out. Every add path — text, upload,
 * link, drop, sticker tile, slice, card, duplicate — comes through here.
 */
export function addDecoration(items: CoverDecoration[], d: CoverDecoration): CoverDecoration[] {
  if (items.length >= MAX_DECORATIONS_PER_SURFACE) return items;
  return [...items, d];
}

export function patchDecoration<T extends CoverDecoration>(
  items: CoverDecoration[],
  id: string,
  change: Partial<T>,
): CoverDecoration[] {
  let touched = false;
  const next = items.map((d) => {
    if (d.id !== id) return d;
    touched = true;
    const merged = { ...d, ...change } as CoverDecoration;
    if ('rot' in change && finite(merged.rot)) merged.rot = normalizeAngle(merged.rot);
    return merged;
  });
  return touched ? next : items;
}

export function removeDecoration(items: CoverDecoration[], id: string): CoverDecoration[] {
  const next = items.filter((d) => d.id !== id);
  return next.length === items.length ? items : next;
}

/** New id, nudged +0.02 so it is visibly a second thing, name suffixed. Subject to the cap. */
export function duplicateDecoration(items: CoverDecoration[], id: string): CoverDecoration[] {
  const src = items.find((d) => d.id === id);
  if (!src) return items;
  const copy: CoverDecoration = {
    ...src,
    id: uuidv4(),
    x: clamp01(src.x + 0.02),
    y: clamp01(src.y + 0.02),
    ...(src.name ? { name: `${src.name} copy` } : {}),
  };
  return addDecoration(items, copy);
}

/**
 * Move one decoration to an ARRAY index (bottom first). The tray shows the list top-down, so it
 * converts from its reversed row index before calling this. Same array when nothing moves.
 */
export function moveDecoration(items: CoverDecoration[], id: string, toIndex: number): CoverDecoration[] {
  const from = items.findIndex((d) => d.id === id);
  if (from < 0) return items;
  const to = Math.max(0, Math.min(items.length - 1, toIndex));
  if (to === from) return items;
  const next = [...items];
  const [d] = next.splice(from, 1);
  next.splice(to, 0, d);
  return next;
}

/**
 * The layers tray lists FRONT-MOST FIRST (Photoshop order) while the array is bottom-first, so a
 * tray row maps to an array index through this. Row 0 is the top of the stack.
 */
export function rowToIndex(length: number, row: number): number {
  return length - 1 - row;
}

/** "Art 3" · "Sticker" · "Text · “the first four words”" — what the tray row says when unnamed. */
export function defaultName(d: CoverDecoration, index: number): string {
  if (d.name) return d.name;
  if (d.kind === 'text') {
    const words = d.text.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
    return words ? `Text · “${words}”` : 'Text';
  }
  if (d.kind === 'sticker') return `Sticker ${index + 1}`;
  return `Art ${index + 1}`;
}

/**
 * A LEGACY SQUARE BECOMES A TIGHT BOX once the image's natural size is known. The old renderer drew
 * a w×w square with the picture letterboxed inside; the tight box is the picture's own shape at
 * the same visual size. Landscape keeps w and gets a shorter h; portrait keeps its height (the old
 * w) and narrows. Written together with `aspect` on the first transform, never on select.
 */
export function legacyBox(
  d: CoverImageDecoration,
  natural?: { w: number; h: number },
): Pick<CoverImageDecoration, 'w' | 'h' | 'aspect'> {
  if (d.h != null) return { w: d.w, h: d.h, ...(d.aspect ? { aspect: d.aspect } : {}) };
  const aspect = natural && natural.w > 0 && natural.h > 0 ? natural.w / natural.h : d.aspect;
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return { w: d.w, h: d.w };
  return aspect >= 1 ? { w: d.w, h: d.w / aspect, aspect } : { w: d.w * aspect, h: d.w, aspect };
}

/** Enough of a saved slice to become a decoration, described structurally (see the file header). */
export interface SliceLike {
  imageUrl: string;
  crop?: { x: number; y: number; w: number; h: number } | null;
  transform?: ImageTransform;
  /** Footprint in pockets: rows and columns. */
  rs: number;
  cs: number;
  attribution?: ArtAttribution;
}

/**
 * A tray slice onto a cover. The slice's quarter-turn folds into the free-degree `rot`; its crop
 * and flips carry over; its height comes from the cropped window when the natural size is known,
 * and from the pocket footprint (a card is 63×88) when it is not.
 */
export function sliceToDecoration(slice: SliceLike, natural?: { w: number; h: number }): CoverImageDecoration {
  const crop = slice.crop ?? undefined;
  const cropW = crop?.w ?? 1;
  const cropH = crop?.h ?? 1;
  const naturalAspect = natural && natural.w > 0 && natural.h > 0 ? natural.w / natural.h : null;
  // Height ÷ width of what is shown.
  const shownHoverW =
    naturalAspect != null ? cropH / (cropW * naturalAspect) : (slice.rs * 88) / (slice.cs * 63);
  const rot = normalizeAngle(slice.transform?.rot ?? 0);
  const w = NEW_DECORATION_W;
  return {
    id: uuidv4(),
    kind: 'art',
    imageUrl: slice.imageUrl,
    x: 0.5,
    y: 0.5,
    w,
    h: w * shownHoverW,
    ...(rot ? { rot } : {}),
    ...(crop ? { crop } : {}),
    ...(slice.transform?.flipH ? { flipH: true } : {}),
    ...(slice.transform?.flipV ? { flipV: true } : {}),
    ...(naturalAspect != null ? { aspect: naturalAspect } : {}),
    ...(slice.attribution ? { attribution: slice.attribution } : {}),
  };
}

/** A fresh text box, ready for the inline editor to open on. */
export function defaultText(): CoverTextDecoration {
  return {
    id: uuidv4(),
    kind: 'text',
    text: 'Your text',
    font: 'marker',
    size: TEXT_SIZE_PRESETS.M,
    align: 'center',
    color: '#111111',
    x: 0.5,
    y: 0.5,
    w: 0.4,
    h: 0.12,
  };
}

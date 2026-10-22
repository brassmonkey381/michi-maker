/**
 * TIDYING THE ARTWORK TRAY (owner, 2026-10-22: "sometimes it feels overwhelming and unorganized.
 * How can we clean up unused slices, with previews before deleting?").
 *
 * The one question that matters is whether a piece is IN A BINDER. A placed artwork pocket carries
 * the same image, crop, transform and footprint as the tray piece it came from, so the two match
 * by content signature (savedSlices.slotSignature), across every binder the account owns. Pieces
 * nothing uses are what the Tidy up sheet offers to delete, grouped by the picture they were cut
 * from, every one shown before anything goes.
 *
 * PURE: the signatures are strings, the binders are plain data, so `npm test` covers it.
 */
import type { DemoBinder } from './binderTypes';
import type { SavedSlice } from './savedSlices';
import { sliceSignature, slotSignature } from './sliceSignature.ts';

/** The content signature of every artwork pocket across these binders. */
export function usedSliceSignatures(binders: readonly DemoBinder[]): Set<string> {
  const used = new Set<string>();
  for (const b of binders) {
    for (const p of b.pages) {
      for (const s of p.slots) {
        if (s.type === 'artwork' && s.imageUrl) used.add(slotSignature(s));
      }
    }
  }
  return used;
}

export function isSliceUsed(slice: SavedSlice, used: ReadonlySet<string>): boolean {
  return used.has(sliceSignature(slice));
}

export interface TidyGroup {
  key: string;
  /** The source domain or label, for the heading. */
  name: string;
  /** Pieces of this picture that nothing uses. */
  unused: SavedSlice[];
  /** How many pieces of the same picture ARE placed, so the heading can say "3 of 9 in use". */
  usedCount: number;
}

/** Unused pieces grouped by picture, pictures with the most unused first. */
export function tidyGroups(slices: readonly SavedSlice[], used: ReadonlySet<string>): TidyGroup[] {
  const byKey = new Map<string, TidyGroup>();
  for (const s of slices) {
    const key = s.groupId ?? s.id;
    let g = byKey.get(key);
    if (!g) {
      g = { key, name: s.label ?? domainOfUrl(s.imageUrl) ?? 'Pieces', unused: [], usedCount: 0 };
      byKey.set(key, g);
    }
    if (isSliceUsed(s, used)) g.usedCount += 1;
    else g.unused.push(s);
  }
  return [...byKey.values()]
    .filter((g) => g.unused.length > 0)
    .sort((a, b) => b.unused.length - a.unused.length || a.name.localeCompare(b.name));
}

function domainOfUrl(url: string): string | null {
  const m = /^https?:\/\/([^/]+)/i.exec(url);
  return m ? m[1].replace(/^www\./, '') : null;
}

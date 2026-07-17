/**
 * Public-binder attribution gate. A binder can hold ANY art while it's private — but the moment
 * it goes public, every custom artwork MUST carry a source (the same rule artofpkm.com follows:
 * every piece links back to where it came from). Card images are official art and never need a
 * source; only user-supplied artwork (uploads, pasted URLs, Slice Studio pieces) does.
 *
 * "Has a source" = the slot's stored attribution carries a `sourceUrl` (a link to the original
 * post / shop / artwork page). A bare host domain is NOT enough — we require the specific origin.
 */
import type { ArtAttribution } from '@/data/artworkLibrary';
import type { DemoBinder, DemoSlot } from '@/data/binderTypes';

/** Does this slot hold user-supplied artwork (so it needs a source before going public)? */
export function isCustomArtwork(slot: DemoSlot): boolean {
  return slot.type === 'artwork' && !!slot.imageUrl && !slot.cardId;
}

/** Is a custom artwork slot's source present? Requires a specific origin URL, not just a domain. */
export function hasSource(attribution?: ArtAttribution | null): boolean {
  return !!attribution?.sourceUrl && /^https?:\/\//i.test(attribution.sourceUrl);
}

export interface UnsourcedArt {
  slotId: string;
  /** 1-indexed for human display. */
  page: number;
  row: number;
  col: number;
  imageUrl: string;
}

/**
 * Every custom-artwork slot in the binder that lacks a source, in reading order. Empty ⇒ the
 * binder is clear to go public. Card pockets and inserts are never included.
 */
export function artNeedingSource(binder: DemoBinder): UnsourcedArt[] {
  const out: UnsourcedArt[] = [];
  binder.pages.forEach((page, pageIndex) => {
    for (const slot of page.slots) {
      if (!isCustomArtwork(slot) || hasSource(slot.attribution)) continue;
      out.push({
        slotId: slot.id,
        page: pageIndex + 1,
        row: slot.row + 1,
        col: slot.col + 1,
        imageUrl: slot.imageUrl as string,
      });
    }
  });
  return out;
}

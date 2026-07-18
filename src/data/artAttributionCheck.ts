/**
 * Public-binder PRIVATE-ART gate. A binder can hold ANY art while it's private — but it can only
 * be made public/shared if it contains no PRIVATE art. Art pulled from an outside URL is private
 * (`attribution.origin === 'external'`): we can't verify the user's rights to it, so it never
 * leaves their account. Only art the user UPLOADED from their device (with a rights attestation
 * at share time) is public-eligible. Card images and our own content are never private.
 */
import type { ArtAttribution } from '@/data/artworkLibrary';
import type { DemoBinder, DemoSlot } from '@/data/binderTypes';

/** Does this slot hold user-supplied artwork (vs. a card image / insert)? */
export function isCustomArtwork(slot: DemoSlot): boolean {
  return slot.type === 'artwork' && !!slot.imageUrl && !slot.cardId;
}

/** Is this artwork PRIVATE — pulled from an external URL, so it can't be in a shared binder? */
export function isPrivateArt(attribution?: ArtAttribution | null): boolean {
  return attribution?.origin === 'external';
}

export interface PrivateArtRef {
  slotId: string;
  /** 1-indexed for human display. */
  page: number;
  row: number;
  col: number;
  imageUrl: string;
}

/**
 * Every PRIVATE (external-origin) custom-artwork slot in the binder, in reading order. Empty ⇒ the
 * binder has no private art and is clear to go public (after the rights attestation). Card pockets,
 * inserts, uploads, and our own content are never included.
 */
export function privateArtInBinder(binder: DemoBinder): PrivateArtRef[] {
  const out: PrivateArtRef[] = [];
  binder.pages.forEach((page, pageIndex) => {
    for (const slot of page.slots) {
      if (!isCustomArtwork(slot) || !isPrivateArt(slot.attribution)) continue;
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

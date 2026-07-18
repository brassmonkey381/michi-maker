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

/**
 * Is this image hosted by US — in the user's own `binder-art` bucket, or a local blob/data URI
 * mid-import? Those are the only public-eligible art sources: art the user brought and we host.
 * Anything pointing at an outside origin is a hotlink we can't stand behind.
 */
export function isBucketHostedArt(imageUrl?: string | null): boolean {
  return !!imageUrl && (/^(blob|data):/i.test(imageUrl) || imageUrl.includes('/binder-art/'));
}

/**
 * Is this artwork PRIVATE — so it can't live in a shared binder? Two independent reasons, either
 * one is enough:
 *   1. It's explicitly flagged external (`attribution.origin === 'external'`) — pulled from a URL.
 *   2. Belt-and-suspenders: its image isn't hosted in our bucket. Legacy art predates the `origin`
 *      flag, so a stray hotlink (origin missing) must never read as public. An explicit `upload`
 *      flag is trusted; otherwise a non-bucket URL is private on host alone.
 * Pass `imageUrl` whenever you have it so the host check can run; without it we fall back to the
 * flag only.
 */
export function isPrivateArt(attribution?: ArtAttribution | null, imageUrl?: string | null): boolean {
  if (attribution?.origin === 'external') return true;
  if (attribution?.origin === 'upload') return false;
  // Origin unknown (legacy art): trust where it's hosted. Non-bucket ⇒ hotlink ⇒ private.
  if (imageUrl !== undefined && imageUrl !== null) return !isBucketHostedArt(imageUrl);
  return false;
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
      if (!isCustomArtwork(slot) || !isPrivateArt(slot.attribution, slot.imageUrl)) continue;
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

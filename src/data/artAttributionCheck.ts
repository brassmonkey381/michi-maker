/**
 * Public-binder PRIVATE-ART gate. A binder can hold ANY art while it's private — but it can only
 * be made public/shared if it contains no PRIVATE art. Art pulled from an outside URL is private
 * (`attribution.origin === 'external'`): we can't verify the user's rights to it, so it never
 * leaves their account. Public-eligible sources are art the user UPLOADED from their device (with
 * a rights attestation at share time) and OUR OWN card art (`origin: 'card'`, or an image served
 * from the catalog image base) — the app already displays those same card images publicly, so a
 * crop taken from one in Slice Studio is no different in kind from the whole card.
 */
import type { ArtAttribution } from '@/data/artworkLibrary';
import type { DemoBinder, DemoSlot } from '@/data/binderTypes';

/**
 * Catalog image base, read straight from the env rather than imported from `@/lib/catalogConfig`.
 * That module configures the browse package and pulls in AsyncStorage on import; this one is pure
 * data logic that `npm test` loads directly, so it must stay free of runtime dependencies. Same
 * value, no side effects.
 */
const CARD_IMG_BASE: string = process.env.EXPO_PUBLIC_CATALOG_IMG_BASE ?? '';

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
 * Is this image OUR OWN card art — served from the configured catalog image base (the tcgscan
 * card bucket)? Slice Studio's "Card art" picker crops straight from those URLs, and the app
 * already renders the very same images publicly in every binder and in Browse, so a crop of one
 * carries no rights posture the app hasn't already taken. Keyed off `imgBase` rather than a
 * hardcoded host so it follows the configured catalog.
 */
export function isCardCatalogArt(imageUrl?: string | null): boolean {
  if (!imageUrl) return false;
  if (CARD_IMG_BASE && imageUrl.startsWith(CARD_IMG_BASE)) return true;
  // Host-agnostic fallback: the catalog's storage layout, site-root-relative card paths (imgBase
  // is '' on local web), and the legacy card-imgs layout. Deliberately shaped so the user's own
  // /binder-art/ bucket can never match.
  return /(^\/?cards?\/)|(\/object\/public\/cards?\/)|(\/card-imgs\/)/i.test(imageUrl);
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
  // Our own card catalog is never private — the app already shows these images publicly, so a
  // crop of one is the same posture. Checked BEFORE the flag because art cropped from the card
  // picker was historically stamped 'external' by the generic URL path (it arrived as a URL), and
  // that misfiled provenance shouldn't outrank where the image demonstrably lives.
  if (isCardCatalogArt(imageUrl)) return false;
  if (attribution?.origin === 'card') return false;
  if (attribution?.origin === 'external') return true;
  // Inherited by duplicating another binder — the copier holds no rights to it.
  if (attribution?.origin === 'copied') return true;
  if (attribution?.origin === 'upload') return false;
  // Origin unknown (legacy art): trust where it's hosted. Non-bucket ⇒ hotlink ⇒ private.
  if (imageUrl !== undefined && imageUrl !== null) return !isBucketHostedArt(imageUrl);
  return false;
}

/**
 * Does this copied slot hold CUSTOM art the copier has no rights to reshare? True for hosted custom
 * artwork (the `binder-art` bucket / an outside URL / an `upload`|`external` origin). False for our
 * own card art and for procedural `data:`/`blob:` inserts (the app's colour sheets) — those stay
 * shareable when a binder is duplicated. Used by `markCopiedArtBorrowed`.
 */
function isBorrowableCustomArt(slot: DemoSlot): boolean {
  if (!isCustomArtwork(slot)) return false;
  const url = slot.imageUrl;
  if (isCardCatalogArt(url)) return false; // our card art — always shareable
  if (slot.attribution?.origin === 'card') return false;
  if (url && /^(blob|data):/i.test(url)) return false; // procedural app inserts (themeBackgrounds)
  return true;
}

/**
 * Stamp every copied CUSTOM-artwork slot as `origin: 'copied'` (→ private) when a binder is
 * duplicated, so the copy can't be reshared with art the new owner didn't create. Catalog card art
 * and procedural inserts are left untouched. Original artist/source fields are preserved for
 * attribution; only the provenance CLASS changes. Returns a new binder (pure); call it on the clone
 * BEFORE persisting. Note: `binderSignature` ignores `attribution`, so this never disturbs the
 * pristine-duplicate delete gate.
 */
export function markCopiedArtBorrowed(binder: DemoBinder): DemoBinder {
  return {
    ...binder,
    pages: binder.pages.map((page) => ({
      ...page,
      slots: page.slots.map((slot) => {
        if (!isBorrowableCustomArt(slot)) return slot;
        return {
          ...slot,
          attribution: {
            ...(slot.attribution ?? { sourceName: 'copied from a binder' }),
            origin: 'copied',
          },
        };
      }),
    })),
  };
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

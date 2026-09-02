/**
 * Public-binder PRIVATE-ART gate. A binder can hold ANY art while it's private; this decides what
 * may also appear in a SHARED one.
 *
 * LOOSENED 2026-08-26 (docs/roadmap/ART-RIGHTS.md): imported art (`origin: 'external'`) is now
 * public-eligible, provided we re-hosted it (importArt always does). The user attests, account
 * wide, that they accept responsibility for the rights to what they share
 * (profiles.rights_attested_at), every piece renders with its credit strip, and the takedown
 * path is operational (binders.removed_at + /studio). The STAMPING is deliberately unchanged:
 * every import still records `origin: 'external'`, so re-tightening later is one revert of
 * `isPrivateArt` plus a jsonb query over binder_slots.image_attribution to find the public
 * binders holding external art. Never stop stamping to make a looser rule simpler.
 *
 * WIDENED 2026-08-26, same owner decision: `origin: 'copied'` is public-eligible on the same
 * hosted-bytes condition as 'external'. Today the ONLY source of copied art is duplicating OUR
 * example/demo binders (markCopiedArtBorrowed fires solely on isExample || isDemo), so the art
 * behind the stamp is house-curated content the owner chose to let circulate. THE GUARD THAT
 * MUST HOLD: if duplication ever extends to other USERS' binders, 'copied' goes back to private
 * (or gains per-source consent), because a copier would be republishing another user's uploads
 * without that user's attestation. The stamp itself is unchanged either way.
 *
 * What is STILL private: raw hotlinks, an image we do not host (legacy slots that predate
 * re-hosting). We cannot stand behind bytes we do not serve, and the ShareSheet now offers to
 * convert them: fetch, re-host into the user's bucket, keep the credit (rehostBinderArt).
 *
 * Public-eligible: uploads, imports we host, copies we host, OUR OWN card art (`origin: 'card'`
 * or an image served from the catalog image base; the app already shows those same images
 * publicly), and procedural inserts.
 */
import type { ArtAttribution } from '@/data/artworkLibrary';
import type { CoverSurfaceId } from '@/data/binderModels';
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
  if (attribution?.origin === 'upload') return false;
  // Set and series logos: public by the owner's decision — see ArtAttribution.origin.
  if (attribution?.origin === 'logo') return false;
  // Imported and copied art (loosened 2026-08-26): public-eligible when WE host the bytes.
  // importArt re-uploads every pull into the user's own bucket, and copied slots point at the
  // source binder's bucket art, so both normally pass. A URL we cannot check, or one pointing
  // off-site (a pre-rehosting legacy slot), stays private: the credit is recorded either way,
  // but we only stand behind images we serve. See the header for the copied-art guard.
  if (attribution?.origin === 'external' || attribution?.origin === 'copied') {
    return imageUrl !== undefined && imageUrl !== null ? !isBucketHostedArt(imageUrl) : true;
  }
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
 * Stamp every copied CUSTOM-artwork slot as `origin: 'copied'` when a binder is duplicated.
 * Since 2026-08-26 the stamp no longer BLOCKS sharing (hosted copies are public-eligible); it
 * remains the provenance ledger: it is what makes re-tightening possible, keeps the credit
 * honest, and is the switch that goes back to private if cross-user duplication ever ships.
 * Catalog card art and procedural inserts are left untouched. Original artist/source fields are
 * preserved for attribution; only the provenance CLASS changes. Returns a new binder (pure);
 * call it on the clone BEFORE persisting. Note: `binderSignature` ignores `attribution`, so
 * this never disturbs the pristine-duplicate delete gate.
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
  /** A pocket's slot id, or a cover decoration's id. */
  slotId: string;
  /** 1-indexed for human display; 0 for a cover decoration. */
  page: number;
  row: number;
  col: number;
  imageUrl: string;
  /** Set when the art is on a cover surface rather than in a pocket. */
  surface?: CoverSurfaceId;
}

/**
 * Every PRIVATE custom-artwork slot in the binder (unhosted hotlinks), in reading order. Empty ⇒
 * the binder has no private art and is clear to go public (after the account-level rights
 * attestation). Card pockets, inserts, uploads, hosted imports, hosted copies, and our own
 * content are never included. The ShareSheet offers to convert what this lists (rehostBinderArt).
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
  // THE COVERS COUNT TOO. A hotlinked picture on the front cover is the most visible art in the
  // binder, and until now the gate never looked at it. Text and card-id decorations have no URL
  // to check; everything with an imageUrl goes through the same rule a pocket does.
  for (const [surface, list] of Object.entries(binder.cover?.surfaces ?? {})) {
    for (const d of list ?? []) {
      if (d.kind === 'text' || !d.imageUrl) continue;
      if (!isPrivateArt(d.attribution, d.imageUrl)) continue;
      out.push({ slotId: d.id, page: 0, row: 0, col: 0, imageUrl: d.imageUrl, surface: surface as CoverSurfaceId });
    }
  }
  return out;
}

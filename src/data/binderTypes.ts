/**
 * Local, ergonomic view-models for the binder display/editor.
 *
 * These intentionally mirror the Supabase schema (see supabase/migrations and
 * src/types/domain.ts) but are flattened for convenient in-memory editing. When the
 * backend is wired up, the store in src/store/binders.tsx is the single place that maps
 * between these shapes and the database rows.
 */

import type { ArtAttribution } from '@/data/artworkLibrary';
import type { CoverSurfaceId } from '@/data/binderModels';
import type { BinderSlotType, CardOrientation, MichiLayoutStyle } from '@/types/domain';

export type { BinderSlotType, CardOrientation, MichiLayoutStyle };

/**
 * The real-world size class of a card, which determines its pocket footprint:
 *  - `standard` — a normal 63×88mm card: exactly one pocket (1×1). The default.
 *  - `jumbo`    — an oversized promo card: one card spanning multiple pockets (≈2×2).
 *  - `vunion`   — one of the four pieces of a V-UNION card; each piece is itself a
 *                 standard-size card (1×1), and four of them tile into a 2×2 block.
 */
export type CardKind = 'standard' | 'jumbo' | 'vunion';

/**
 * A lossless orientation transform applied to a custom artwork image at render time —
 * quarter-turn rotation plus mirror flips. The source image is never re-encoded; slices
 * are just (url, crop, transform) triples, so the original stays intact.
 */
export type ImageTransform = {
  /** Clockwise quarter turns. */
  rot: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
};

export interface DemoCard {
  id: string;
  name: string;
  pokemon?: string;
  setName?: string;
  illustrator?: string;
  imageUrl: string;
  /** Hex colour used for color-theme layouts and as the slot backing. */
  dominantColor?: string;
  orientation: CardOrientation;
  /** Real-world size class. Absent ⇒ `standard` (a single pocket). */
  kind?: CardKind;
}

export interface DemoSlot {
  id: string;
  /** Top-left cell of the slot (0-indexed). */
  row: number;
  col: number;
  /** How many cells the slot spans. 1 = a single pocket. */
  rowSpan: number;
  colSpan: number;
  /**
   * 'card' references a `cardId`. 'artwork' is a full-bleed image: either a `cardId` or a
   * custom `imageUrl` (a user-supplied / playground art panel). 'insert' uses `insertColor`.
   */
  type: Exclude<BinderSlotType, 'empty'>;
  cardId?: string;
  insertColor?: string;
  /** Custom artwork image (used by 'artwork' slots that aren't a catalogue card). */
  imageUrl?: string;
  /**
   * For a sliced artwork (a full image spread across several pockets): the sub-rectangle of
   * `imageUrl` this slot shows, as fractions 0–1 of the whole image. Absent ⇒ show the whole.
   */
  imageCrop?: { x: number; y: number; w: number; h: number };
  /**
   * How the artwork fills its pocket footprint. 'cover' (default) fills edge-to-edge, cropping
   * overflow; 'contain' shows the whole image at its original aspect, letterboxed — nothing cropped.
   */
  imageFit?: 'cover' | 'contain';
  /** Rotation / mirror applied to `imageUrl` before the crop window. Absent ⇒ as-is. */
  imageTransform?: ImageTransform;
  /**
   * Provenance captured AT IMPORT for a custom artwork — the illustrator + specific source page
   * a bare URL can't reveal (see ArtAttribution). Authoritative when present; rendering falls
   * back to `deriveAttribution(imageUrl)` when it's absent (slots that predate this field).
   */
  attribution?: ArtAttribution;
  /**
   * The tcgscan `portfolio_entries` row this pocket depicts — WHICH owned copy is in it. Shipped
   * for "Rebuild in michi" (tcgscanBinderImport) and now stamped by every placement path that
   * resolves a copy (useCopyAssigner / CopyPickerSheet); the store's claim budget keeps a lot's
   * pockets from outnumbering its cards. A SOFT POINTER: the entry may be gone (lot removed,
   * collection deleted) and the pointer just dangles — display shows catalog art, locked (see
   * scanFaces). Owner-meaningful only: to anyone else it is an opaque uuid that joins to nothing
   * (RLS).
   */
  sourceEntryId?: string;
  /**
   * The print finish THIS POCKET shows — 'Normal', 'Holofoil', 'Reverse Holofoil', … A finish used
   * to exist only on an owned copy, so the app could not tell whether a card was holo unless you
   * happened to own it, which is most of a binder and exactly what a foil treatment needs to know.
   *
   * The POCKET's answer, not the card's: two pockets holding the same card_id may legitimately
   * differ, which is the entire point of a reverse-holo page. When the pocket claims an owned copy
   * that copy's variant wins, because that one is a fact about a card someone physically has.
   *
   * Free text, matching the column: the vocabulary is unenforced on purpose (see the migration),
   * and constants/printVariant.ts renders an unrecognised string rather than failing on it.
   */
  finish?: string;
  /**
   * True when this pocket was filled FROM the owner's card inventory ("My collection" /
   * fill-from-my-collection) — it consumes one owned copy in the (free/owned) accounting and
   * can be reclaimed. Absent/false ⇒ placed from general browsing (aspirational; doesn't
   * touch the inventory).
   */
  fromCollection?: boolean;
}

/**
 * A DECORATION ON A COVER SURFACE — art, a sticker, or a line of text.
 *
 * Positioned freely rather than in a grid, because a cover is not a pocket page: you put a thing
 * where you want it, at the angle you want it. Everything is a FRACTION of the surface, so a cover
 * survives being drawn at any size, on any screen, and in the share preview.
 *
 * UNITS, in one place, because they are the whole contract:
 *   x, y  — the CENTRE. x is a fraction of surface WIDTH, y of surface HEIGHT. Clamped 0..1.
 *   w, h  — the box. BOTH are fractions of surface WIDTH — not of height — because a surface's
 *           aspect is not one number: the spread draws it to the page's box while the filmstrip,
 *           the shelf thumb and the picker draw it at the model's own aspect. In width units the
 *           box keeps its SHAPE everywhere; only its y lands a few percent differently, the same
 *           stretch the shell itself already absorbs.
 *   h     — ABSENT on every row written before decorations existed. That means LEGACY: draw a
 *           w×w square with the image letterboxed inside it, exactly as before, so nothing already
 *           saved moves at upgrade. The editor writes h on the first transform, never on read.
 *   rot   — clockwise degrees, normalised to [0, 360) on every write.
 *   tiltX, tiltY — perspective tilt about the box's own axes, degrees, ±45. The one non-affine
 *           look every target honours. Skew is deliberately NOT here: Android decomposes a
 *           transform into translate / rotate / scale and drops skew on the floor, so a skewed
 *           sticker would be flat on a phone and slanted on the web.
 */
export type CoverDecorationKind = 'art' | 'sticker' | 'text';
export type CoverMaskShape = 'rect' | 'rounded' | 'ellipse';
export type CoverTextFont = 'sans' | 'serif' | 'rounded' | 'mono' | 'brand' | 'marker';
export type CoverTextBgShape =
  | 'none'
  | 'rect'
  | 'rounded'
  | 'postit'
  | 'notecard'
  | 'postcard'
  | 'circle'
  | 'tag';

interface CoverDecorationBase {
  id: string;
  /** Absent on rows written before decorations existed, which were all art. */
  kind?: CoverDecorationKind;
  x: number;
  y: number;
  w: number;
  h?: number;
  rot?: number;
  tiltX?: number;
  tiltY?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** 0..1, absent ⇒ 1. */
  opacity?: number;
  /** Clip. `radius` is a fraction of the box's shorter side ('rounded' only). */
  mask?: { shape: CoverMaskShape; radius?: number };
  /**
   * Photoshop semantics. Hidden is drawn NOWHERE — spread, strip, thumb, turn copies — but still
   * stored, so it still counts toward the per-surface cap. Locked is selectable but not movable.
   */
  hidden?: boolean;
  locked?: boolean;
  /** The layer row's name. Absent ⇒ defaultName(). */
  name?: string;
}

export interface CoverImageDecoration extends CoverDecorationBase {
  kind?: 'art' | 'sticker';
  /** Custom art, or a catalogue card by id. One or the other. */
  imageUrl?: string;
  cardId?: string;
  /** Natural width ÷ height of the source, captured by the editor the first time it loads. */
  aspect?: number;
  /**
   * The window of the (flipped) source shown in the box, fractions 0..1 — the slice convention.
   * Absent ⇒ the whole image. Only meaningful once `h` is present.
   */
  crop?: { x: number; y: number; w: number; h: number };
  /** The sticker library key ('set:<id>' | 'series:<id>'), so a changed logo URL can be re-resolved. */
  stickerId?: string;
  /** Provenance, exactly as a pocket carries it. */
  attribution?: ArtAttribution;
}

export interface CoverTextDecoration extends CoverDecorationBase {
  kind: 'text';
  text: string;
  font: CoverTextFont;
  /** Font size as a FRACTION OF SURFACE WIDTH. px = size × width. */
  size: number;
  /** Regular or bold only: older Android distinguishes nothing finer. */
  weight?: 'regular' | 'bold';
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Line height as a multiple of size. Absent ⇒ 1.2. */
  leading?: number;
  /** #rrggbb. The colour field is six-digit hex, no alpha. */
  color: string;
  /** Background. Translucency is `opacity`, never an alpha hex. `pad` is a fraction of surface width. */
  bg?: { shape: CoverTextBgShape; color: string; opacity?: number; pad?: number };
}

export type CoverDecoration = CoverImageDecoration | CoverTextDecoration;

/**
 * @deprecated A sticker is one kind of decoration; a surface's list can now hold text too. Kept
 * so existing imports compile, and aliased to the UNION so a list read off a surface is
 * assignable — a renderer that only knows images narrows with `'imageUrl' in d`.
 */
export type CoverSticker = CoverDecoration;

/**
 * WHICH BINDER THIS IS, AND WHAT HAS BEEN DONE TO IT.
 *
 * Absent on a binder nobody has dressed yet: pages in the abstract, drawn the way they always
 * were. Present means the owner has chosen a real binder to keep them in.
 */
export interface BinderCover {
  /** An id from BINDER_MODELS. An unknown one falls back rather than failing (binderModel()). */
  modelId: string;
  /** An id from that model's colourways. */
  colourway: string;
  /**
   * Decorations per surface, BOTTOM FIRST: array order is z-order and later draws on top. A
   * surface with nothing on it may be absent rather than empty. At most MAX_DECORATIONS_PER_SURFACE.
   */
  surfaces?: Partial<Record<CoverSurfaceId, CoverDecoration[]>>;
  /**
   * Show the FRONT COVER as this binder's face wherever a binder is shown small: the shelf, a
   * profile, Discover. Off by default, because a binder people recognise by its first page should
   * not silently start showing a plain shell the moment its owner picks a model.
   */
  showCover?: boolean;
}

export interface DemoPage {
  id: string;
  title?: string;
  /** Free-text page description (persisted to binder_pages.notes). */
  description?: string;
  rows: number;
  cols: number;
  backgroundColor?: string;
  /**
   * Whether the page is visible to public viewers of a public binder. Absent ⇒ public (the DB
   * default). A private page is hidden from everyone but the owner even inside a public binder.
   */
  isPublic?: boolean;
  slots: DemoSlot[];
}

export interface DemoBinder {
  id: string;
  title: string;
  description?: string;
  layoutStyle: MichiLayoutStyle;
  /** Premade, read-only-by-default reference binders ship with the app. */
  isExample: boolean;
  /**
   * The read-only "Try it out!" showcase binder built from the example collection. Persisted and
   * owner-scoped (so it survives reload and can be deleted), but excluded from the binder cap,
   * not editable, and not shareable. At most one per account (see the store's createBinder).
   */
  isDemo?: boolean;
  /**
   * A hard read-only reference binder: view ONLY — it cannot be edited OR duplicated. Ordinary
   * examples (`isExample`) are read-only but still duplicable into an editable copy; a `locked`
   * binder additionally has no Duplicate action (the store's `duplicateBinder` refuses it). Used
   * for the print-feature sampler (see `src/data/exampleFillSheetBinder.ts`).
   */
  locked?: boolean;
  /** A curated community "Featured" binder — shown in the Featured section (still read-only). */
  isFeatured?: boolean;
  /** The author's display name, shown on Featured binders. One day this links to their profile. */
  authorName?: string;
  coverCardId?: string;
  /**
   * The real binder these pages live in: model, colourway, and whatever has been stuck to its four
   * surfaces. Absent means undressed, which is every binder made before covers existed.
   */
  cover?: BinderCover;
  /** When true, anyone with the link can view this binder (see the `/binder/[id]` route). */
  isPublic?: boolean;
  /** Up to 2 page ids to feature in the shared-link OG preview. Absent/empty = auto (fullest pages).
   *  Persisted to binders.share_page_ids; read by api/og-image-binder.js. */
  sharePageIds?: string[];
  /**
   * Cache-busting fingerprint for the share link (`?v=`). Server-owned: a trigger rewrites it when
   * the preview changes. Never written by the client, so it is absent on a local/example binder.
   */
  shareKey?: string;
  /**
   * When this binder was first made public (binders.made_public_at). Server-owned. Used by the
   * "New" badge; absent on a local/example binder and on one that has never been shared.
   */
  madePublicAt?: string;
  /** Total likes this binder has received. Populated for Featured + when viewing a public binder. */
  likeCount?: number;
  /** Whether the current signed-in viewer has liked this binder. */
  likedByMe?: boolean;
  pages: DemoPage[];
}

// --- helpers ---------------------------------------------------------------

/**
 * A short, throwaway 4-letter binder name (pronounceable consonant-vowel-consonant-vowel, e.g.
 * "Miko", "Tavu", "Beno"). Used as the default title for a freshly created or duplicated binder:
 * short enough that the "type the name to delete" gate is trivial to satisfy, and obviously a
 * placeholder so it nudges the owner to give the binder a real name.
 */
export function fillerName(): string {
  const consonants = 'bcdfghjklmnprstvwz';
  const vowels = 'aeiou';
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const raw = pick(consonants) + pick(vowels) + pick(consonants) + pick(vowels);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Generic default titles that `createBinder` replaces with a fresh `fillerName()`. */
export const GENERIC_BINDER_TITLES = new Set(['', 'New binder', 'Untitled binder', 'Untitled']);

/**
 * A stable content fingerprint of a binder — title plus every page/slot, EXCLUDING the (always
 * fresh) ids. Used to tell whether a duplicated binder is still untouched: the store stamps a
 * copy's signature at duplication time, and a later delete compares it against the binder's
 * current signature. Any edit (retitle, add/move/remove a card, re-page) changes the string, so a
 * mismatch means "edited" and the name-to-delete gate stays on.
 */
export function binderSignature(binder: DemoBinder): string {
  return JSON.stringify({
    t: binder.title,
    pages: binder.pages.map((page) => ({
      t: page.title ?? null,
      d: page.description ?? null,
      r: page.rows,
      c: page.cols,
      bg: page.backgroundColor ?? null,
      pub: page.isPublic ?? null,
      slots: [...page.slots]
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .map((slot) => ({
          r: slot.row,
          c: slot.col,
          rs: slot.rowSpan,
          cs: slot.colSpan,
          ty: slot.type,
          cd: slot.cardId ?? null,
          ins: slot.insertColor ?? null,
          im: slot.imageUrl ?? null,
          cr: slot.imageCrop ?? null,
          ft: slot.imageFit ?? null,
          tr: slot.imageTransform ?? null,
          fc: slot.fromCollection ?? null,
        })),
    })),
  });
}

let _counter = 0;

/** A small unique id generator (runtime only — fine for keys and the bundled examples). */
export function uid(prefix = 'id'): string {
  _counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_counter.toString(36)}`;
}

/**
 * RFC4122 v4 UUID. Used for ids that get persisted to Supabase (the `uuid` columns).
 * Math.random is fine here — these are client-generated ids for a personal app, not secrets.
 */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * COPYING A POCKET MUST NOT COPY THE CARD IN IT — the two functions below are that rule.
 *
 * `sourceEntryId` names one physical card (a tcgscan lot), and one physical card is in exactly one
 * pocket. Cloning a slot with the stamp intact makes two pockets claim the same object: the copy
 * wears the owner's photograph of a card it has no claim to, the placed count exceeds what they
 * own, free copies go negative, and reclaim offers copies that are not there. Reported live after
 * duplicating a page — the scans came across with it.
 *
 * `fromCollection` travels with the stamp for the same reason: it means this pocket CONSUMES an
 * owned copy, and copies do not multiply because a page was duplicated.
 */
export function duplicatedSlots(slots: readonly DemoSlot[]): DemoSlot[] {
  return slots.map(({ sourceEntryId: _copy, fromCollection: _owned, ...slot }) => ({
    ...slot,
    id: uuidv4(),
  }));
}

/**
 * The other half of the rule, and the reason this is not one function: a MOVED page is the same
 * pockets in a new home. The cards did not multiply and they did not go anywhere — dropping the
 * stamp here would quietly free copies that are still sitting in a binder, and the pocket would
 * lose the photograph of the very card in it.
 */
export function movedSlots(slots: readonly DemoSlot[]): DemoSlot[] {
  return slots.map((slot) => ({ ...slot, id: uuidv4() }));
}

/** A fresh empty page of the given grid size (persistable — uses a UUID id). */
export function emptyPage(rows = 3, cols = 3, title?: string): DemoPage {
  return { id: uuidv4(), title, rows, cols, slots: [] };
}

/**
 * Lay card ids into fresh 3×3 pages, row-major — an atomic payload for `createBinder({ pages })`
 * (creating a binder then batch-adding races the store snapshot; this doesn't).
 *
 * `entryIds` (parallel to `cardIds`, from useCopyAssigner) names the owned copy each pocket claims.
 * Without it a binder created from a selection placed every card as aspirational no matter how many
 * of them the user owned — the same screen-dependent accounting that ownedCopies.ts exists to end,
 * arriving through the one path that builds its pages before the binder exists.
 */
export function pagesForCards(cardIds: string[], entryIds?: (string | undefined)[]): DemoPage[] {
  const pages: DemoPage[] = [];
  for (let i = 0; i < cardIds.length; i += 9) {
    const chunk = cardIds.slice(i, i + 9);
    const slots: DemoSlot[] = chunk.map((cardId, j) => ({
      id: uuidv4(),
      row: Math.floor(j / 3),
      col: j % 3,
      rowSpan: 1,
      colSpan: 1,
      type: 'card',
      cardId,
      sourceEntryId: entryIds?.[i + j],
      fromCollection: entryIds?.[i + j] ? true : undefined,
    }));
    pages.push({ id: uuidv4(), rows: 3, cols: 3, slots });
  }
  return pages;
}

/**
 * Fill every unoccupied cell of a grid with empty 'artwork' placeholder slots — the binder grid
 * paints these as a dashed "Your Art Here" invitation. Horizontally-adjacent empty pairs merge
 * into a 1×2 panel (so it reads as "mostly 1×2, some 1×1"). Empty (no imageUrl/cardId) so they
 * never trip the private-art gate or consume inventory. Used by the Build-a-binder wizard.
 */
export function artGapSlots(rows: number, cols: number, occupied: Set<string>): DemoSlot[] {
  const slots: DemoSlot[] = [];
  for (let r = 0; r < rows; r += 1) {
    let c = 0;
    while (c < cols) {
      if (occupied.has(`${r},${c}`)) {
        c += 1;
        continue;
      }
      const pair = c + 1 < cols && !occupied.has(`${r},${c + 1}`);
      slots.push({ id: uuidv4(), row: r, col: c, rowSpan: 1, colSpan: pair ? 2 : 1, type: 'artwork' });
      c += pair ? 2 : 1;
    }
  }
  return slots;
}

/** Cells covered by a slot, as "row,col" keys (accounts for spans). */
export function slotCells(slot: DemoSlot): string[] {
  const keys: string[] = [];
  for (let r = slot.row; r < slot.row + slot.rowSpan; r += 1) {
    for (let c = slot.col; c < slot.col + slot.colSpan; c += 1) {
      keys.push(`${r},${c}`);
    }
  }
  return keys;
}

/** The set of every cell on a page already occupied by some slot. */
export function occupiedCells(page: DemoPage): Set<string> {
  const set = new Set<string>();
  for (const slot of page.slots) {
    for (const key of slotCells(slot)) set.add(key);
  }
  return set;
}

/** A candidate placement (position + span) — a slot-shaped object without an id/type. */
export interface SlotCandidate {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

/**
 * Cells a candidate placement would cover, as "row,col" keys (accounts for spans).
 * Mirrors `slotCells` but works on a span-only candidate (no id/type required).
 */
export function candidateCells(candidate: SlotCandidate): string[] {
  const keys: string[] = [];
  for (let r = candidate.row; r < candidate.row + candidate.rowSpan; r += 1) {
    for (let c = candidate.col; c < candidate.col + candidate.colSpan; c += 1) {
      keys.push(`${r},${c}`);
    }
  }
  return keys;
}

/**
 * Whether `candidate` can be placed on `page`:
 *  - it fits within the grid (row/col >= 0, and row+rowSpan <= rows, col+colSpan <= cols), and
 *  - none of its cells overlap an existing slot, ignoring the slot whose id === ignoreId
 *    (so a slot can be re-placed/resized over its own footprint).
 * Pure — does not mutate the page.
 */
export function canPlaceSlot(
  page: DemoPage,
  candidate: SlotCandidate,
  ignoreId?: string,
): boolean {
  // Span must be a positive size and the footprint must sit inside the grid.
  if (candidate.rowSpan < 1 || candidate.colSpan < 1) return false;
  if (candidate.row < 0 || candidate.col < 0) return false;
  if (candidate.row + candidate.rowSpan > page.rows) return false;
  if (candidate.col + candidate.colSpan > page.cols) return false;

  // No overlap with any other slot's cells (the ignored slot's cells are free game).
  const taken = new Set<string>();
  for (const slot of page.slots) {
    if (slot.id === ignoreId) continue;
    for (const key of slotCells(slot)) taken.add(key);
  }
  return candidateCells(candidate).every((key) => !taken.has(key));
}

/**
 * The first cell (reading order, top-left→bottom-right) where a `rowSpan`×`colSpan` footprint
 * fits on the page without overlapping any slot (except `ignoreId`). Returns null if none fits.
 */
export function firstFreePlacement(
  page: DemoPage,
  rowSpan: number,
  colSpan: number,
  ignoreId?: string,
): { row: number; col: number } | null {
  for (let row = 0; row <= page.rows - rowSpan; row += 1) {
    for (let col = 0; col <= page.cols - colSpan; col += 1) {
      if (canPlaceSlot(page, { row, col, rowSpan, colSpan }, ignoreId)) return { row, col };
    }
  }
  return null;
}

/** Deep-clone a binder, assigning fresh (persistable) UUID ids — used to remix an example. */
export function cloneBinder(binder: DemoBinder, overrides?: Partial<DemoBinder>): DemoBinder {
  return {
    ...binder,
    id: uuidv4(),
    isExample: false,
    isDemo: false, // a duplicate of the demo showcase becomes a real, editable, counted binder
    locked: false, // a copy is a real, freely editable binder (locked references can't be copied anyway)
    isPublic: false, // a copy is private until the new owner shares it
    sharePageIds: undefined, // the copy's pages get fresh ids, so the source's featured picks are stale
    pages: binder.pages.map((page) => ({
      ...page,
      id: uuidv4(),
      // A COPY SHOWS CATALOG ART, always. `sourceEntryId` names the specific owned copy a pocket
      // depicts (the real-scan pairing), and it is true of the binder that was BUILT from those
      // cards — not of a duplicate. Carried over, the copy would draw the owner's photographs of
      // cards it has no claim to: a shared or repurposed binder wearing someone's scuffs and
      // sleeve glare. Dropping it falls back to catalog images, which is what a duplicate should
      // look like.
      //
      // `fromCollection` goes with it, for the matching reason on the accounting side: it marks a
      // pocket as CONSUMING one owned copy, and the copies did not multiply because a binder was
      // duplicated. Carried over, a person owning three Pikachu who duplicates the binder holding
      // them reads as having placed six — the placed count exceeds what they own, the free-copy
      // maths that feeds "fill from my collection" goes negative, and the reclaim list offers
      // copies that are not there. A duplicate's pockets are aspirational, which is exactly what
      // an absent `fromCollection` already means (see DemoSlot: "placed from general browsing").
      slots: page.slots.map(({ sourceEntryId: _scan, fromCollection: _owned, ...slot }) => ({
        ...slot,
        id: uuidv4(),
      })),
    })),
    ...overrides,
  };
}

/**
 * Re-mint a binder under brand-new ids (binder, pages, slots) WITHOUT changing what it is — the
 * MOVE twin of cloneBinder, for the in-place guest→account upgrade (see the store's
 * migrateOwnBindersToFreshIds). The same pockets get a new home, so unlike a duplicate:
 *
 *   · Claim stamps and `fromCollection` are KEPT (movedSlots): the upgrade keeps the same uid,
 *     portfolio entries survive it verbatim, and the cards neither multiplied nor went anywhere.
 *     Stripping them here was the defect where converting a guest account silently made every
 *     pocket forget which owned copy it held.
 *   · `isDemo` / `locked` / `isPublic` survive: the binder is still the binder it was.
 *   · `sharePageIds` are remapped onto the new page ids rather than dropped, so the owner's
 *     chosen share-preview pages survive the upgrade too.
 */
export function remintBinderIds(binder: DemoBinder): DemoBinder {
  const newPageIds = new Map(binder.pages.map((page) => [page.id, uuidv4()]));
  const sharePageIds = binder.sharePageIds
    ?.map((id) => newPageIds.get(id))
    .filter((id): id is string => id != null);
  return {
    ...binder,
    id: uuidv4(),
    pages: binder.pages.map((page) => ({
      ...page,
      id: newPageIds.get(page.id) as string,
      slots: movedSlots(page.slots),
    })),
    // Empty stays absent: [] and undefined both mean "auto (fullest pages)".
    sharePageIds: sharePageIds?.length ? sharePageIds : undefined,
  };
}

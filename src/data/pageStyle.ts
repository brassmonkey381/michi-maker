/**
 * HOW A BINDER'S PAGES ARE MADE, AND WHAT THE BINDER ITSELF HAS: the stitching on the page, what
 * the pockets are dressed in, and the hardware of the binder around them.
 *
 * A real collector's binder is not a white rectangle with nine holes in it. The page is a sheet
 * welded to its pockets along stitched seams; the cards sit in coloured sleeves; the printed art
 * has a backing behind it; and the binder around the page has a zip with a coloured pull, and a
 * spine down the middle of the open book. Every one of those is a thing a person chose.
 *
 * ONE OBJECT PER BINDER, like the cover and the soundtrack: a binder is one physical object and
 * its pages do not change material halfway through. Persisted whole in `binders.page_style`
 * (jsonb). Absent means the plain page every binder had before, so nothing is backfilled.
 *
 * TWO KINDS OF CHOICE (owner, 2026-09-14). The page's STITCHING is one of three, so it is a
 * single pick. The binder's DETAILS are hardware a binder can have any combination of, so they
 * are a set: a zipper (with its own pull colour and track shape), a spine style. Adding a detail
 * never touches the stitching and the other way round.
 *
 * PURE, importing nothing from react-native, so `node --test` can reach all of it.
 */

/** The stitching on the page: none, one thread along every seam, or two. */
export type PageMaterial = 'classic' | 'stitch' | 'double';

export const PAGE_MATERIALS: { id: PageMaterial; label: string; blurb: string }[] = [
  { id: 'classic', label: 'Classic', blurb: 'The plain page.' },
  { id: 'stitch', label: 'Stitch', blurb: 'One thread along every seam between the pockets.' },
  { id: 'double', label: 'Double stitch', blurb: 'Two threads along every seam, the weld between them.' },
];

/** How the zip's coil runs: a straight run of teeth, or one that wanders as a coiled zip does. */
export type ZipTrack = 'straight' | 'wavy';
/** What the spine down the middle of the open book looks like. */
export type SpineStyle = 'cross' | 'ribbed';

export interface BinderDetails {
  /** A zip round the cover. `pull` is the slider's colour, #rrggbb; absent is the green the reference had. */
  zip?: { pull?: string; track?: ZipTrack };
  /** The spine between the two pages of the open book. Absent means the plain gap. */
  spine?: SpineStyle;
}

export const ZIP_TRACKS: { id: ZipTrack; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'wavy', label: 'Wavy' },
];
export const SPINE_STYLES: { id: SpineStyle; label: string; blurb: string }[] = [
  { id: 'cross', label: 'Cross-stitch spine', blurb: 'A thick cross-stitched band down the middle of the book.' },
  { id: 'ribbed', label: 'Ribbed spine', blurb: 'A spine of stacked ridges, like a stitched-in gusset.' },
];

/** The green pull of the reference binder: what a zip wears until a colour is chosen. */
export const DEFAULT_ZIP_PULL = '#3fcf5e';

export interface PageStyle {
  /** Absent means classic. */
  material?: PageMaterial;
  /** Every card pocket wears a sleeve of this colour, #rrggbb. Absent means bare pockets. */
  sleeve?: string;
  /** Every art piece sits on a backing of this colour, #rrggbb. Absent means none. */
  artBacking?: string;
  /** The binder's hardware. Absent means a plain binder. */
  details?: BinderDetails;
  /**
   * The thread the seams are sewn with. Absent means a thread cut from the page's lightness (pale
   * on dark, dark on pale) at the default opacity. `opacity` is 0.1 to 1.
   */
  thread?: { color?: string; opacity?: number };
}

/**
 * A page's or a pocket's "none": bare pockets here even though the binder (or the page) wears a
 * sleeve. Stored in the same text column as a colour; a blank column means "inherit" and this
 * means "stop here, nothing". The binder itself has no such value: at the top, absent IS none.
 */
export const WEAR_NONE = 'none';

/**
 * What a pocket wears, resolved pocket -> page -> binder: the first layer that says anything
 * wins, and a layer saying WEAR_NONE wins with "nothing". Returns a #rrggbb or undefined.
 */
export function resolveWear(...layers: (string | null | undefined)[]): string | undefined {
  for (const layer of layers) {
    if (layer === undefined || layer === null || layer === '') continue;
    return layer === WEAR_NONE ? undefined : layer;
  }
  return undefined;
}

/** A page/pocket column as the app should read it: a lower-cased colour, WEAR_NONE, or nothing. */
export function normalizeWear(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === WEAR_NONE) return WEAR_NONE;
  return HEX.test(value) ? value.toLowerCase() : undefined;
}

/** The opacities the thread can be set to. */
export const THREAD_OPACITIES = [0.25, 0.5, 0.75, 1] as const;
export const DEFAULT_THREAD_OPACITY = 0.6;

const HEX = /^#[0-9a-f]{6}$/i;
const MATERIALS = new Set<string>(PAGE_MATERIALS.map((m) => m.id));
const TRACKS = new Set<string>(ZIP_TRACKS.map((t) => t.id));
const SPINES = new Set<string>(SPINE_STYLES.map((s) => s.id));

/**
 * Storage is user-writable and jsonb is whatever was last put there: shape-check, never trust.
 * Returns undefined for anything that is not a usable style, so a bad row reads as the plain page
 * rather than reaching the renderer half-built.
 *
 * TWO OLDER SHAPES ARE READ (2026-09-13): `stitched` was the double-thread page before it was
 * named so, and `zip` was a double-thread page with a zip, before the zip became a detail. Both
 * are mapped, never written back as they were.
 */
export function normalizePageStyle(value: unknown): PageStyle | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as { material?: unknown; sleeve?: unknown; artBacking?: unknown; details?: unknown; thread?: unknown };
  const out: PageStyle = {};
  let material = typeof raw.material === 'string' ? raw.material : undefined;
  let legacyZip = false;
  if (material === 'stitched') material = 'double';
  if (material === 'zip') {
    material = 'double';
    legacyZip = true;
  }
  if (material && MATERIALS.has(material) && material !== 'classic') out.material = material as PageMaterial;
  if (typeof raw.sleeve === 'string' && HEX.test(raw.sleeve)) out.sleeve = raw.sleeve.toLowerCase();
  if (typeof raw.artBacking === 'string' && HEX.test(raw.artBacking)) out.artBacking = raw.artBacking.toLowerCase();
  const details = normalizeDetails(raw.details, legacyZip);
  if (details) out.details = details;
  const thread = normalizeThread(raw.thread);
  if (thread) out.thread = thread;
  return Object.keys(out).length ? out : undefined;
}

function normalizeThread(value: unknown): PageStyle['thread'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as { color?: unknown; opacity?: unknown };
  const out: NonNullable<PageStyle['thread']> = {};
  if (typeof raw.color === 'string' && HEX.test(raw.color)) out.color = raw.color.toLowerCase();
  if (typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)) {
    const o = Math.round(Math.min(1, Math.max(0.1, raw.opacity)) * 100) / 100;
    if (o !== DEFAULT_THREAD_OPACITY) out.opacity = o;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeDetails(value: unknown, legacyZip: boolean): BinderDetails | undefined {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as { zip?: unknown; spine?: unknown }) : {};
  const out: BinderDetails = {};
  const zipRaw = raw.zip;
  if (legacyZip || (zipRaw && typeof zipRaw === 'object' && !Array.isArray(zipRaw))) {
    const z = (zipRaw && typeof zipRaw === 'object' ? zipRaw : {}) as { pull?: unknown; track?: unknown };
    const zip: NonNullable<BinderDetails['zip']> = {};
    if (typeof z.pull === 'string' && HEX.test(z.pull)) zip.pull = z.pull.toLowerCase();
    if (typeof z.track === 'string' && TRACKS.has(z.track) && z.track !== 'straight') zip.track = z.track as ZipTrack;
    out.zip = zip;
  }
  if (typeof raw.spine === 'string' && SPINES.has(raw.spine)) out.spine = raw.spine as SpineStyle;
  return Object.keys(out).length ? out : undefined;
}

/** What a change to a style looks like: each field set, cleared with null, or left alone. */
export interface PageStylePatch {
  material?: PageMaterial | null;
  sleeve?: string | null;
  artBacking?: string | null;
  /** `zip: null` removes the zip; `zip: {}` adds one with the defaults; fields inside merge. */
  zip?: { pull?: string | null; track?: ZipTrack | null } | null;
  spine?: SpineStyle | null;
  /** `thread: null` goes back to the automatic thread; fields inside merge. */
  thread?: { color?: string | null; opacity?: number | null } | null;
}

/**
 * Merge a change into a style. A field set to `null` is cleared; `undefined` is left alone. The
 * result is normalised, so clearing the last field hands back undefined and the column goes null.
 */
export function withPageStyle(current: PageStyle | undefined | null, patch: PageStylePatch): PageStyle | undefined {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const key of ['material', 'sleeve', 'artBacking'] as const) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null) delete next[key];
    else next[key] = patch[key];
  }
  const details: Record<string, unknown> = { ...(current?.details ?? {}) };
  if (patch.zip !== undefined) {
    if (patch.zip === null) delete details.zip;
    else {
      const zip: Record<string, unknown> = { ...((current?.details?.zip as object | undefined) ?? {}) };
      for (const key of ['pull', 'track'] as const) {
        if (patch.zip[key] === undefined) continue;
        if (patch.zip[key] === null) delete zip[key];
        else zip[key] = patch.zip[key];
      }
      details.zip = zip;
    }
  }
  if (patch.spine !== undefined) {
    if (patch.spine === null) delete details.spine;
    else details.spine = patch.spine;
  }
  next.details = details;
  if (patch.thread !== undefined) {
    if (patch.thread === null) delete next.thread;
    else {
      const thread: Record<string, unknown> = { ...(current?.thread ?? {}) };
      for (const key of ['color', 'opacity'] as const) {
        if (patch.thread[key] === undefined) continue;
        if (patch.thread[key] === null) delete thread[key];
        else thread[key] = patch.thread[key];
      }
      next.thread = thread;
    }
  }
  return normalizePageStyle(next);
}

/** Relative luminance of #rrggbb, 0 (black) to 1 (white). WCAG's formula, nothing clever. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 1;
  const ch = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

/**
 * The thread colour for a seam: pale on a dark page, dark on a pale one. Thread is drawn
 * translucent so it sits IN the fabric rather than on top of it; these are the two inks it is cut
 * from. The threshold is where mid-greys tip, chosen by eye against both.
 */
export function stitchInk(matHex: string): string {
  return luminance(matHex) < 0.35 ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.42)';
}

/**
 * The thread as chosen: the binder's own colour and opacity when set, else the automatic ink for
 * the page. An rgba() string, ready to draw with.
 */
export function threadInk(matHex: string, thread: PageStyle['thread'] | undefined): string {
  if (!thread?.color && thread?.opacity === undefined) return stitchInk(matHex);
  const hex = (thread.color ?? (luminance(matHex) < 0.35 ? '#ffffff' : '#000000')).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${thread.opacity ?? DEFAULT_THREAD_OPACITY})`;
}

/*
 * NEXT, in the order they are worth doing:
 *   - A sleeve per POCKET (`DemoSlot.sleeve`), so one chase card can wear a different sleeve.
 *   - Sleeve styles beyond a flat colour: a matte edge, a glossy edge, a pattern.
 *   - A page style on the print sheet: backing behind art pieces prints as a border.
 *   - Rings on the spine, for a ring binder rather than a zip-around.
 */

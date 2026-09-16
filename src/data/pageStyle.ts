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
import { binderPreset } from './binderPresets.ts';

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
  /** The named binder this is (binderPresets), when one was picked. Absent means a custom one. */
  binder?: string;
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

/**
 * A PICTURE INSTEAD OF A COLOUR (owner, 2026-09-15): a sleeve, an art backing or a page background
 * can be a hotlinked image, as the competition allows. Stored in the same text columns as a colour,
 * told apart by shape: an http(s) URL is a picture, #rrggbb is a colour. Nothing is fetched or
 * checked here; the renderer shows what loads and the colour behind it otherwise.
 */
const IMAGE_REF = /^https?:\/\/\S{1,2000}$/i;
export function isImageRef(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_REF.test(value);
}

/** A colour or a picture, as the app should read it; anything else is nothing. */
export function normalizeSurface(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (HEX.test(value)) return value.toLowerCase();
  return isImageRef(value) ? value : undefined;
}

/** A page/pocket column as the app should read it: a colour, a picture, WEAR_NONE, or nothing. */
export function normalizeWear(value: unknown): string | undefined {
  if (value === WEAR_NONE) return WEAR_NONE;
  return normalizeSurface(value);
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
  const raw = value as { binder?: unknown; material?: unknown; sleeve?: unknown; artBacking?: unknown; details?: unknown; thread?: unknown };
  const out: PageStyle = {};
  if (typeof raw.binder === 'string' && binderPreset(raw.binder)) out.binder = raw.binder;
  let material = typeof raw.material === 'string' ? raw.material : undefined;
  let legacyZip = false;
  if (material === 'stitched') material = 'double';
  if (material === 'zip') {
    material = 'double';
    legacyZip = true;
  }
  if (material && MATERIALS.has(material) && material !== 'classic') out.material = material as PageMaterial;
  const sleeve = normalizeSurface(raw.sleeve);
  if (sleeve) out.sleeve = sleeve;
  const artBacking = normalizeSurface(raw.artBacking);
  if (artBacking) out.artBacking = artBacking;
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
  binder?: string | null;
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
  for (const key of ['binder', 'material', 'sleeve', 'artBacking'] as const) {
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

/**
 * WHERE A PAGE'S SEAMS RUN (owner, 2026-09-15, read off the reference binder: a black
 * side-loading 3x3, spine on the right, with a welded seam along every sealed pocket edge).
 *
 * A pocket sheet is welded to its backing along straight lines, and the weld shows as a run of
 * small pale stitches. Every edge of a pocket is sealed except the one you load through, so the
 * stitches say which edge that is. Across the page every row boundary is sealed: top, bottom and
 * between the rows. Down the page the reference reads like this:
 *
 *   - The gap between columns 1 and 2 (from the outer edge) is BARE: column 1 loads through its
 *     spine-side edge and column 2 through its outer edge, both into that one gap.
 *   - The gap between columns 2 and 3 is stitched on column 2's side: column 2's spine-side edge
 *     is sealed, and column 3 loads through its outer edge into that gap.
 *   - Both hems, outer and spine-side, are sealed.
 *
 * So the columns PAIR OFF from the outer edge, each pair loading through the one bare gap between
 * them, and an odd column left over against the spine loads through the gap on its outer side,
 * which stays stitched on its neighbour's account. A 2-wide page has one bare gap; a 4-wide has
 * two (lines 1 and 3 from the outer edge) and a seam down its middle; a 3-wide has one.
 *
 * Lines are numbered like grid lines: vertical 0..cols (0 the hem before the first column, cols
 * the hem after the last), horizontal 0..rows.
 */
export type SeamEdge = 'left' | 'right';

/**
 * The grid lines that carry a seam. `outerEdge` is the page's edge away from the spine; a page
 * drawn alone is a right-hand page (spine on its left, outer edge on its right).
 */
export function seamLines(rows: number, cols: number, outerEdge: SeamEdge | undefined): { v: number[]; h: number[] } {
  const outer: SeamEdge = outerEdge ?? 'right';
  // The pair gaps, counted from the outer edge: lines 1, 3, 5... short of the far hem.
  const bare = new Set<number>();
  for (let k = 1; k < cols; k += 2) bare.add(outer === 'left' ? k : cols - k);
  const v: number[] = [];
  for (let i = 0; i <= cols; i += 1) if (!bare.has(i)) v.push(i);
  const h: number[] = [];
  for (let i = 0; i <= rows; i += 1) h.push(i);
  return { v, h };
}

/**
 * ONE STITCH RUN'S GEOMETRY. The reference's stitches are small rectangles about twice as long
 * as they are wide, a stitch's length apart. Two sizes: the page as edited, and a thumbnail.
 */
export const STITCH = { pitch: 5, dash: 3, thick: 2 } as const;
export const STITCH_TINY = { pitch: 3, dash: 2, thick: 1 } as const;

/**
 * A run of stitches as gradient stops, so a whole seam is ONE drawn thing rather than a view per
 * stitch: the ink on for `dash` of every `pitch`, off between, along a run `length` long. Hard
 * edges come from repeating a location. Both arrays are what a linear gradient takes.
 */
/** Gradient stops as expo-linear-gradient types them: at least two of each. */
export type GradientStops = { colors: [string, string, ...string[]]; locations: [number, number, ...number[]] };
export function stitchStops(length: number, ink: string, geometry: { pitch: number; dash: number } = STITCH): GradientStops {
  const off = 'rgba(0,0,0,0)';
  const colors: string[] = [off];
  const locations: number[] = [0];
  if (length > 0) {
    const n = Math.floor(length / geometry.pitch);
    const lead = (geometry.pitch - geometry.dash) / 2;
    for (let i = 0; i < n; i += 1) {
      const a = (i * geometry.pitch + lead) / length;
      const b = a + geometry.dash / length;
      colors.push(off, ink, ink, off);
      locations.push(a, a, b, b);
    }
  }
  colors.push(off);
  locations.push(1);
  return { colors: colors as GradientStops['colors'], locations: locations as GradientStops['locations'] };
}

/**
 * THE CLOTH'S WEAVE: a nylon binder is a fine grid of threads, and a flat colour with a vignette
 * reads as paint. Two sets of soft ripples, one each way, `pitch` apart, in a translucent thread
 * cut from the cloth's lightness. SOFT (owner, 2026-09-15): a ramp up to the thread and back,
 * never a hard line, so it reads as texture rather than graph paper.
 */
export const WEAVE_PITCH = 5;
export function weaveStops(length: number, dark: boolean, pitch = WEAVE_PITCH): GradientStops {
  const ink = dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.028)';
  const off = 'rgba(0,0,0,0)';
  const colors: string[] = [off];
  const locations: number[] = [0];
  if (length > 0) {
    const n = Math.floor(length / pitch);
    for (let i = 0; i < n; i += 1) {
      colors.push(ink, off);
      locations.push((i * pitch + pitch / 2) / length, ((i + 1) * pitch) / length);
    }
  }
  colors.push(off);
  locations.push(1);
  return { colors: colors as GradientStops['colors'], locations: locations as GradientStops['locations'] };
}

/** `t` of the way from hex `a` to hex `b`, as #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.replace('#', '').slice(i, i + 2), 16);
  const one = (i: number) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0');
  return `#${one(0)}${one(2)}${one(4)}`;
}

/**
 * THE ZIP IS THE CLOTH'S (owner, 2026-09-15, from the white Vault X: a white binder has a white
 * zip). The tape, the coil's teeth, the lit edge of each tooth and the slider are all cut from
 * the page's own colour: a shade or two off it, darker on a pale cloth and paler on a dark one.
 * Only the pull keeps a colour of its own.
 */
export function zipCloth(matHex: string): { tape: string; tooth: string; lit: string; slider: string; sliderEdge: string; pull: string } {
  const mat = /^#[0-9a-f]{6}$/i.test(matHex) ? matHex : '#ffffff';
  const dark = luminance(mat) < 0.35;
  return dark
    ? { tape: mixHex(mat, '#000000', 0.45), tooth: mixHex(mat, '#ffffff', 0.3), lit: mixHex(mat, '#ffffff', 0.55), slider: mixHex(mat, '#ffffff', 0.4), sliderEdge: mixHex(mat, '#000000', 0.5), pull: mixHex(mat, '#ffffff', 0.3) }
    : { tape: mixHex(mat, '#000000', 0.05), tooth: mixHex(mat, '#000000', 0.14), lit: mixHex(mat, '#ffffff', 0.5), slider: mixHex(mat, '#000000', 0.1), sliderEdge: mixHex(mat, '#000000', 0.3), pull: mixHex(mat, '#000000', 0.05) };
}

/** The zip's colours for a binder: the named binder's own when it has some, else cut from the cloth. */
export function binderZip(style: PageStyle | undefined | null, matHex: string): ReturnType<typeof zipCloth> {
  return binderPreset(style?.binder)?.zip ?? zipCloth(matHex);
}

/**
 * THE BINDER DECIDES (owner, 2026-09-15). The stitching, its thread, the zip's colour and the
 * pull's are the binder's, not settings: every page is single-stitched in the automatic thread
 * at this strength, and the zip and pull are the cover colour's (zipCloth). Older rows may still
 * carry a material, a thread or a pull colour; they are read for compatibility and not drawn.
 */
export const BINDER_STITCH_OPACITY = 0.08;

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

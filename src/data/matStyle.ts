/**
 * THE MAT STYLE (owner, 2026-11-03: "a picture picker for art window mats... an entire art mats
 * customizer, with different font families, colors, multi-select data to include").
 *
 * The art view's stock card (ArtViewCard.tsx StockCard) is the MAT: the plain card the art window
 * sits on, with the card's name and references under it. This is everything about that card a
 * person can choose: the paper (a colour, or a picture over it), the ink, the face the text is
 * set in, which lines of the card's data appear, how each section is aligned, and how the ink
 * stays readable over a busy picture (an outline, a scrim, or an ink that follows the picture;
 * owner, 2026-11-03: "ship them all as options for the user to pick from"). Absent means the
 * stock card as it shipped on 2026-10-24: near-black paper, cream ink, the serif, every line.
 *
 * TWO LEVELS, like the art view itself: the binder says what every mat looks like
 * (PageStyle.mat), and a page can say otherwise as a whole (binder_pages.mat, DemoPage.mat).
 * A page's style REPLACES the binder's rather than merging into it, so what a page shows is
 * always one of the two things a person set, never a blend nobody chose.
 *
 * Preview and print: the screen draws all of it; the printed mat (placeholderPdf) still prints
 * the black or white mat with every line, which is noted there as the next step.
 *
 * PURE: no react-native, so `node --test` reaches all of it.
 */

import { speciesOf } from './collectorBinders.ts';

export type MatFont = 'serif' | 'sans' | 'rounded' | 'mono';

export const MAT_FONTS: { id: MatFont; label: string }[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'mono', label: 'Mono' },
];

/**
 * The lines a mat can carry, in the order the stock card draws them. HP and rarity sit on the
 * name line, right side, HP over rarity (owner, 2026-11-03); the rest are the ruled rows under it.
 * The old "No. and type" line was dropped the same day; a stored style naming it reads as not
 * naming it.
 */
export type MatField = 'hp' | 'rarity' | 'dex' | 'series' | 'set' | 'number' | 'illustrator' | 'released';

export const MAT_FIELDS: { id: MatField; label: string; blurb: string }[] = [
  { id: 'hp', label: 'HP', blurb: 'The hit points, top right of the name line.' },
  { id: 'rarity', label: 'Rarity', blurb: 'The rarity, top right, under the HP.' },
  { id: 'dex', label: 'Dex watermark', blurb: 'The dex number, large and faint, in the corner.' },
  { id: 'series', label: 'Series', blurb: 'The series the set belongs to.' },
  { id: 'set', label: 'Set', blurb: 'The set name.' },
  { id: 'number', label: 'Number', blurb: 'The card number in its set.' },
  { id: 'illustrator', label: 'Illustrator', blurb: 'Who drew the card.' },
  { id: 'released', label: 'Released', blurb: 'The month and year the card came out.' },
];

/** How the name is written: as the card prints it, cleaned to the species ("Charizard" for "Mega Charizard X ex"), or left off. */
export type MatName = 'card' | 'clean' | 'none';

/**
 * How the ink stays readable over a picture. 'thin' outlines every line in the ground colour,
 * the way card text sits on holo foil; 'wide' outlines wider and sets the labels, values and
 * rules in the full ink instead of the faded cuts, for the busiest pictures.
 */
export type MatHalo = 'thin' | 'wide';

/**
 * How a section of the text sits. Absent is the stock card's own layout: the name left with HP
 * and rarity in the right corner, each row's label left and value right, the dex watermark in
 * the right corner. A named side packs the section to that side: the name over an "HP · RARITY"
 * line, a row's label beside its value, the watermark at that edge.
 */
export type MatAlign = 'left' | 'center' | 'right';

export const MAT_ALIGNS: { id: MatAlign; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
];

export interface MatAlignment {
  name?: MatAlign;
  rows?: MatAlign;
  dex?: MatAlign;
}

/** The scrim strengths offered: the picture tinted toward the ground under the text block. */
export const MAT_SCRIMS: { id: 'off' | 'light' | 'heavy'; label: string; value: number }[] = [
  { id: 'off', label: 'Off', value: 0 },
  { id: 'light', label: 'Light', value: 0.5 },
  { id: 'heavy', label: 'Heavy', value: 0.75 },
];

/** The two inks "ink follows the picture" chooses between, and the ground each is outlined in. */
export const AUTO_INK_DARK = '#111114';
export const AUTO_INK_LIGHT = '#f6f3ea';

export const ALL_MAT_FIELDS: readonly MatField[] = MAT_FIELDS.map((f) => f.id);

/** The stock card's own colours (ArtViewCard.tsx), what a mat is until someone says otherwise. */
export const DEFAULT_MAT_PAPER = '#111114';
export const DEFAULT_MAT_INK = '#f2efe6';

export interface MatStyle {
  /** The paper, #rrggbb. Absent means the stock card's near-black. */
  paper?: string;
  /** A picture over the paper, an https address; the paper shows while it loads or if it never does. */
  picture?: string;
  /** The ink the name and values are set in, #rrggbb. The labels and rules are cut from it. */
  ink?: string;
  /** The face. Absent means the serif. */
  font?: MatFont;
  /**
   * Which lines appear. Absent means every line. An EMPTY list is the name alone, which is a
   * choice, so it is kept.
   */
  fields?: MatField[];
  /** 'clean' writes the species instead of the printed name (collectorBinders speciesOf); 'none' leaves the name off. Absent means as printed. */
  name?: 'clean' | 'none';
  /** An outline round every line in the ground colour. Absent means none. */
  halo?: MatHalo;
  /**
   * The picture tinted toward the ground under the text block, 0 to 1 (how opaque the tint is at
   * the lines; it fades in from the window). Needs a picture. Absent or 0 means none.
   */
  scrim?: number;
  /**
   * The ink chosen per mat from the picture under its text: dark ink on a bright slice, light
   * on a dark one, the outline and scrim in the other (so a page-wide picture with a dark corner
   * reads everywhere). Needs a picture. Absent means the chosen ink on every mat.
   */
  autoInk?: true;
  /** Where each section sits (MatAlign). Absent means the stock card's own layout. */
  align?: MatAlignment;
  /**
   * 'page' spreads the picture across the page's whole pocket grid as one unified mat: each mat
   * shows its own slice, and an empty pocket shows its slice too (owner, 2026-11-03). Needs a
   * picture, and one big enough for the grid (spreadFits). Absent means every mat wears the
   * whole picture.
   */
  spread?: 'page';
}

/** Each field set, cleared with null, or left alone. */
export interface MatStylePatch {
  paper?: string | null;
  picture?: string | null;
  ink?: string | null;
  font?: MatFont | null;
  fields?: MatField[] | null;
  name?: 'clean' | 'none' | null;
  spread?: 'page' | null;
  halo?: MatHalo | null;
  scrim?: number | null;
  autoInk?: true | null;
  /** Each section set, cleared with null, or left alone; the whole alignment cleared with null. */
  align?: { name?: MatAlign | null; rows?: MatAlign | null; dex?: MatAlign | null } | null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE_REF = /^https?:\/\/\S{1,2000}$/i;
const FONTS = new Set<string>(MAT_FONTS.map((f) => f.id));
const FIELDS = new Set<string>(ALL_MAT_FIELDS);

/**
 * Storage is user-writable and jsonb is whatever was last put there: shape-check, never trust.
 * Returns undefined for anything that is not a usable style, so a bad value reads as the plain
 * stock card. A default said out loud (the serif, the stock paper) is dropped, so a style that
 * says nothing new is no style, and the column goes null.
 */
export function normalizeMatStyle(value: unknown): MatStyle | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as { paper?: unknown; picture?: unknown; ink?: unknown; font?: unknown; fields?: unknown; name?: unknown; spread?: unknown; halo?: unknown; scrim?: unknown; autoInk?: unknown; align?: unknown };
  const out: MatStyle = {};
  if (raw.name === 'clean' || raw.name === 'none') out.name = raw.name;
  if (raw.halo === 'thin' || raw.halo === 'wide') out.halo = raw.halo;
  const align = normalizeAlign(raw.align);
  if (align) out.align = align;
  if (typeof raw.paper === 'string' && HEX.test(raw.paper) && raw.paper.toLowerCase() !== DEFAULT_MAT_PAPER) out.paper = raw.paper.toLowerCase();
  if (typeof raw.picture === 'string' && IMAGE_REF.test(raw.picture)) out.picture = raw.picture;
  // A spread with no picture spreads nothing: dropped, so clearing the picture clears it too.
  if (raw.spread === 'page' && out.picture) out.spread = 'page';
  // A scrim or a following ink reads the picture: without one there is nothing to read, so
  // clearing the picture clears them too.
  if (out.picture && typeof raw.scrim === 'number' && Number.isFinite(raw.scrim) && raw.scrim > 0) out.scrim = Math.min(1, Math.round(raw.scrim * 100) / 100);
  if (out.picture && raw.autoInk === true) out.autoInk = true;
  if (typeof raw.ink === 'string' && HEX.test(raw.ink) && raw.ink.toLowerCase() !== DEFAULT_MAT_INK) out.ink = raw.ink.toLowerCase();
  if (typeof raw.font === 'string' && FONTS.has(raw.font) && raw.font !== 'serif') out.font = raw.font as MatFont;
  if (Array.isArray(raw.fields)) {
    // In the card's order, each once, unknown names dropped. Every line is the default: not stored.
    const given: unknown[] = raw.fields;
    const picked = ALL_MAT_FIELDS.filter((f) => given.includes(f));
    if (picked.length !== ALL_MAT_FIELDS.length) out.fields = picked;
    else if (given.some((f) => typeof f !== 'string' || !FIELDS.has(f))) out.fields = picked;
  }
  return Object.keys(out).length ? out : undefined;
}

const ALIGNS = new Set<string>(MAT_ALIGNS.map((a) => a.id));

/** The alignment, each section a known side; a side that is the default (the dex on the right) is dropped. */
function normalizeAlign(value: unknown): MatAlignment | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as { name?: unknown; rows?: unknown; dex?: unknown };
  const out: MatAlignment = {};
  if (typeof raw.name === 'string' && ALIGNS.has(raw.name)) out.name = raw.name as MatAlign;
  if (typeof raw.rows === 'string' && ALIGNS.has(raw.rows)) out.rows = raw.rows as MatAlign;
  if (typeof raw.dex === 'string' && ALIGNS.has(raw.dex) && raw.dex !== 'right') out.dex = raw.dex as MatAlign;
  return Object.keys(out).length ? out : undefined;
}

/** Merge a change into a style: null clears a field, undefined leaves it. Normalised on the way out. */
export function withMatStyle(current: MatStyle | undefined | null, patch: MatStylePatch): MatStyle | undefined {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const key of ['paper', 'picture', 'ink', 'font', 'fields', 'name', 'spread', 'halo', 'scrim', 'autoInk'] as const) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null) delete next[key];
    else next[key] = patch[key];
  }
  if (patch.align === null) delete next.align;
  else if (patch.align) {
    const merged: Record<string, unknown> = { ...(current?.align ?? {}) };
    for (const key of ['name', 'rows', 'dex'] as const) {
      if (patch.align[key] === undefined) continue;
      if (patch.align[key] === null) delete merged[key];
      else merged[key] = patch.align[key];
    }
    next.align = merged;
  }
  return normalizeMatStyle(next);
}

/**
 * THE SPREAD'S MINIMUM: a picture across a page is cut into one slice per pocket, so it needs
 * this many pixels per pocket to stay sharp at a card's size. 300 by 420 is a card at 120 dpi;
 * a 3×3 page therefore wants 900 by 1260 or more.
 */
export const MAT_SPREAD_MIN_PER_POCKET = { w: 300, h: 420 } as const;

export function spreadMinimum(rows: number, cols: number): { w: number; h: number } {
  return { w: cols * MAT_SPREAD_MIN_PER_POCKET.w, h: rows * MAT_SPREAD_MIN_PER_POCKET.h };
}

/** Whether a picture of this pixel size may spread across a rows × cols page. */
export function spreadFits(width: number, height: number, rows: number, cols: number): boolean {
  const min = spreadMinimum(rows, cols);
  return width >= min.w && height >= min.h;
}

/**
 * One pocket's slice of a page-wide picture: the picture is laid over the whole grid (innerW by
 * innerH, gaps included, so it meets itself across every gap) and this pocket shows the part
 * under it. Returned as the picture's box relative to the pocket's own top-left.
 */
export function spreadSlice(row: number, col: number, colStep: number, rowStep: number, innerW: number, innerH: number): { left: number; top: number; width: number; height: number } {
  return { left: col ? -col * colStep : 0, top: row ? -row * rowStep : 0, width: innerW, height: innerH };
}

/** The page's own mat, else the binder's. A page's style replaces the binder's whole. */
export function resolveMatStyle(...layers: (MatStyle | null | undefined)[]): MatStyle | undefined {
  for (const layer of layers) if (layer) return layer;
  return undefined;
}

/** The lines a mat shows: every line unless the style picked some. */
export function matFields(mat: MatStyle | undefined): readonly MatField[] {
  return mat?.fields ?? ALL_MAT_FIELDS;
}

/** Whether a line shows on this mat. */
export function matShows(mat: MatStyle | undefined, field: MatField): boolean {
  return matFields(mat).includes(field);
}

/**
 * The name as this mat writes it. 'clean' is the app's own name cleaning (collectorBinders
 * speciesOf): the species a card is a card of, so "Mega Charizard X ex" reads "Charizard". A
 * trainer or energy has no species and keeps its printed name.
 */
export function matName(mat: MatStyle | undefined, printed: string): string {
  if (mat?.name === 'none') return '';
  if (mat?.name !== 'clean') return printed;
  return speciesOf(printed) || printed;
}

/**
 * A picture reduced to a small greyscale grid for reading the brightness under a mat's text
 * (lib/pictureLuminance makes one on the web; the share image makes its own with sharp).
 * `pw` by `ph` is the picture's own size, `data` is `lw` by `lh` grey bytes, row-major.
 */
export interface LuminanceSample {
  pw: number;
  ph: number;
  lw: number;
  lh: number;
  data: ArrayLike<number>;
}

/**
 * The mean brightness, 0 to 1, of the picture under `rect`, when the picture is cover-fitted
 * into `box` (centred, the way expo-image and the share image both draw it). `rect` is in the
 * box's coordinates: for a page-wide spread the box is the whole grid and the rect is this
 * pocket's text block within it. Out-of-picture parts of the rect are ignored; a rect that
 * misses the picture reads as middle grey.
 */
export function luminanceUnder(sample: LuminanceSample, box: { width: number; height: number }, rect: { left: number; top: number; width: number; height: number }): number {
  if (!sample.pw || !sample.ph || !sample.lw || !sample.lh || !box.width || !box.height) return 0.5;
  const scale = Math.max(box.width / sample.pw, box.height / sample.ph);
  const ox = (box.width - sample.pw * scale) / 2;
  const oy = (box.height - sample.ph * scale) / 2;
  const toGrid = (x: number, y: number): [number, number] => [((x - ox) / scale) * (sample.lw / sample.pw), ((y - oy) / scale) * (sample.lh / sample.ph)];
  const [x0, y0] = toGrid(rect.left, rect.top);
  const [x1, y1] = toGrid(rect.left + rect.width, rect.top + rect.height);
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(sample.lh, Math.ceil(y1)); y += 1) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(sample.lw, Math.ceil(x1)); x += 1) {
      sum += sample.data[y * sample.lw + x];
      n += 1;
    }
  }
  return n ? sum / n / 255 : 0.5;
}

/** Whether a brightness wants dark ink (the picture under the text is light). */
export const wantsDarkInk = (luminance: number): boolean => luminance > 0.5;

/** The field a stock card row's label maps to (artView.ts stockCardText rows). */
export function matFieldOfRow(label: string): MatField | undefined {
  switch (label) {
    case 'Series':
      return 'series';
    case 'Set':
      return 'set';
    case 'Number':
      return 'number';
    case 'Illustrator':
      return 'illustrator';
    case 'Released':
      return 'released';
    default:
      return undefined;
  }
}

/**
 * A colour blended toward another: `t` of the way from `from` to `to`, #rrggbb. The mat's labels,
 * rules and watermark are the ink faded toward the paper, so one ink and one paper give a whole
 * palette that reads on either.
 */
export function mix(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const k = Math.min(1, Math.max(0, t));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = HEX.test(hex) ? hex.slice(1) : '000000';
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export interface MatPalette {
  paper: string;
  ink: string;
  /**
   * What the ink is read against: the paper, or with a following ink the opposite of the ink it
   * chose. The outline, the scrim and the faded cuts (labels, rules, watermark) use it.
   */
  ground: string;
  sub: string;
  label: string;
  value: string;
  rule: string;
  watermark: string;
  picture?: string;
  font: MatFont;
  halo?: MatHalo;
  /** 0 when there is no scrim. */
  scrim: number;
}

/**
 * Everything the stock card needs to paint itself, with the defaults filled in. `luminance` is
 * the brightness under this mat's text (luminanceUnder) for a style whose ink follows the
 * picture; without it, or without that style, the chosen ink stands.
 */
export function matPalette(mat: MatStyle | undefined, luminance?: number): MatPalette {
  const paper = mat?.paper ?? DEFAULT_MAT_PAPER;
  let ink = mat?.ink ?? DEFAULT_MAT_INK;
  let ground = paper;
  if (mat?.autoInk && mat.picture && luminance !== undefined) {
    const dark = wantsDarkInk(luminance);
    ink = dark ? AUTO_INK_DARK : AUTO_INK_LIGHT;
    ground = dark ? AUTO_INK_LIGHT : AUTO_INK_DARK;
  }
  // The wide outline sets the small lines in the full ink: faded cuts outlined read as grey.
  const full = mat?.halo === 'wide';
  return {
    paper,
    ink,
    ground,
    picture: mat?.picture,
    font: mat?.font ?? 'serif',
    halo: mat?.halo,
    scrim: mat?.picture && mat.scrim ? mat.scrim : 0,
    sub: full ? ink : mix(ink, ground, 0.35),
    label: full ? ink : mix(ink, ground, 0.5),
    value: full ? ink : mix(ink, ground, 0.08),
    rule: full ? ink : mix(ink, ground, 0.8),
    watermark: mix(ink, ground, 0.94),
  };
}

/** A #rrggbb colour with an alpha, as #rrggbbaa. */
export function withAlphaHex(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${HEX.test(hex) ? hex : '#000000'}${a.toString(16).padStart(2, '0')}`;
}

/**
 * THE MAT STYLE (owner, 2026-11-03: "a picture picker for art window mats... an entire art mats
 * customizer, with different font families, colors, multi-select data to include").
 *
 * The art view's stock card (ArtViewCard.tsx StockCard) is the MAT: the plain card the art window
 * sits on, with the card's name and references under it. This is everything about that card a
 * person can choose: the paper (a colour, or a picture over it), the ink, the face the text is
 * set in, and which lines of the card's data appear. Absent means the stock card as it shipped
 * on 2026-10-24: near-black paper, cream ink, the serif, every line.
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

/** How the name is written: as the card prints it, or cleaned to the species ("Charizard" for "Mega Charizard X ex"). */
export type MatName = 'card' | 'clean';

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
  /** 'clean' writes the species instead of the printed name (collectorBinders speciesOf). Absent means as printed. */
  name?: 'clean';
}

/** Each field set, cleared with null, or left alone. */
export interface MatStylePatch {
  paper?: string | null;
  picture?: string | null;
  ink?: string | null;
  font?: MatFont | null;
  fields?: MatField[] | null;
  name?: 'clean' | null;
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
  const raw = value as { paper?: unknown; picture?: unknown; ink?: unknown; font?: unknown; fields?: unknown; name?: unknown };
  const out: MatStyle = {};
  if (raw.name === 'clean') out.name = 'clean';
  if (typeof raw.paper === 'string' && HEX.test(raw.paper) && raw.paper.toLowerCase() !== DEFAULT_MAT_PAPER) out.paper = raw.paper.toLowerCase();
  if (typeof raw.picture === 'string' && IMAGE_REF.test(raw.picture)) out.picture = raw.picture;
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

/** Merge a change into a style: null clears a field, undefined leaves it. Normalised on the way out. */
export function withMatStyle(current: MatStyle | undefined | null, patch: MatStylePatch): MatStyle | undefined {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const key of ['paper', 'picture', 'ink', 'font', 'fields', 'name'] as const) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null) delete next[key];
    else next[key] = patch[key];
  }
  return normalizeMatStyle(next);
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
  if (mat?.name !== 'clean') return printed;
  return speciesOf(printed) || printed;
}

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

/** Everything the stock card needs to paint itself, with the defaults filled in. */
export function matPalette(mat: MatStyle | undefined): { paper: string; ink: string; sub: string; label: string; value: string; rule: string; watermark: string; picture?: string; font: MatFont } {
  const paper = mat?.paper ?? DEFAULT_MAT_PAPER;
  const ink = mat?.ink ?? DEFAULT_MAT_INK;
  return {
    paper,
    ink,
    picture: mat?.picture,
    font: mat?.font ?? 'serif',
    sub: mix(ink, paper, 0.35),
    label: mix(ink, paper, 0.5),
    value: mix(ink, paper, 0.08),
    rule: mix(ink, paper, 0.8),
    watermark: mix(ink, paper, 0.94),
  };
}

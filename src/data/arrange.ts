/**
 * ARRANGE: seat the cards a page already has so the page reads.
 *
 * A page (or a facing spread) holds a set of cards the owner chose. Arrange proposes several
 * finished layouts for exactly those cards, each one a pairing of a TEMPLATE from the michi
 * catalogue (`artTemplates.ts`: which pockets are art) with a MODE (which card sits in which card
 * pocket). The spec and the owner's decisions are in docs/ARRANGE.md; the visual draft that set
 * the rules is linked from there.
 *
 * The four modes:
 *   Strata  rows are depths: sky above, ground, underground. A row owns its depth's words and no
 *           other row may show them (owner, 2026-10-20). The FIRST depth word in a card's caption
 *           decides its band, because it is what the picture is mostly of.
 *   Lines   rows are evolution lines, read left to right in stage order.
 *   Flow    one palette gradient across the whole canvas; a spread crosses the gutter.
 *   Mirror  symmetric weight across the gutter or a single page's centre column.
 *
 * Two rules hold in every mode: connected art stays adjacent in the orientation the art continues
 * (hard, applied last), and no card is ever dropped: what a template cannot seat is HELD, named,
 * and returned to the caller.
 *
 * PURE. No React, no network, no catalog. Everything a card contributes (its depth words in rank
 * order, its line and stage, its palette, its illustrator) arrives in `ArrangeCard`; lib/depth
 * fetches the words and the sheet adapts the catalog. Deterministic: there is no randomness at
 * all, so the same page always gets the same candidates, which is what makes the
 * pick log worth keeping. Exercised by `node --test` (arrange.test.ts), like pageComposer.
 */
import type { ArtRole, ArtTemplate } from '@/data/artTemplates';

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

export type Depth = 'above' | 'surface' | 'below';
export type Leaf = 'left' | 'right' | 'single';
export type ArrangeMode = 'strata' | 'lines' | 'flow' | 'mirror';

/** One dominant colour of a card's art: CIELAB plus coverage weight 0..1 (the kit's `Lab`). */
export interface PaletteColor {
  L: number;
  a: number;
  b: number;
  w: number;
}

export interface ArrangeCard {
  id: string;
  name: string;
  /**
   * The card's depth words in caption rank order, namespaced or bare ("scene:sky", "cave"), as
   * `depthOfCards` returns them. Absent or empty means the card has no depth and is FREE: it may
   * sit in any band and fills whatever the strata leave short.
   */
  depthWords?: readonly string[];
  /** The ordered evolution family (lowercase species), as the catalog carries it. */
  evolutionLine?: readonly string[];
  /** 1-indexed stage (1 = Basic); -1 or absent when unknown. */
  evolutionStage?: number;
  illustrator?: string;
  setId?: string;
  number?: string;
  /** The pipeline's `full_art_kind`. */
  fullArtKind?: string;
  rarity?: string;
  palette?: readonly PaletteColor[];
  /** The card's energy types, e.g. ["Fire"]; empty or absent for a Trainer. The frame's colour. */
  types?: readonly string[];
}

export interface Cell {
  leaf: Leaf;
  row: number;
  col: number;
}

export const cellKey = (c: Cell): string => `${c.leaf}:${c.row},${c.col}`;

/** Two cards whose art is one picture, and which way it continues from `a` to `b`. */
export interface ConnectedPair {
  a: string;
  b: string;
  /** 'vertical': b sits directly under a. 'horizontal': b sits directly right of a. */
  dir: 'vertical' | 'horizontal';
}

export interface ArrangeInput {
  rows: number;
  cols: number;
  /** A facing pair of pages laid out as one canvas. */
  spread: boolean;
  cards: readonly ArrangeCard[];
  /**
   * Cells Arrange must not use when seating WITHOUT a template: art the page already has and
   * keeps. Keys from `cellKey`. A template candidate ignores this and reserves its own panels (the
   * caller only offers templates when the page's art can be replaced).
   */
  reserved?: ReadonlySet<string>;
  /** Where each card sits now, so "as it is now" can be scored and shown first. */
  current?: ReadonlyMap<string, Cell>;
  /** Templates to try, already filtered to this shape. Empty tries only the page as it is. */
  templates?: readonly ArtTemplate[];
  /** Connected pairs the caller knows; `connectedPairs` finds the obvious ones when absent. */
  pairs?: readonly ConnectedPair[];
  /**
   * Offer templates with fewer card pockets than the page has cards, listing the rest as held.
   * Off by default: the editor cannot yet move a held card to the next page, so it only offers
   * layouts that seat everything.
   */
  allowHeld?: boolean;
  /** The soft choices inside each mode. Absent means `DEFAULT_TUNING`, which is what the app ships. */
  tuning?: Partial<Tuning>;
}

/**
 * The choices a mode makes that are taste, not rule. Each one is a knob the Arrange Lab
 * (scripts/arrange-lab) puts in front of the owner blind, so the default can follow what they
 * actually pick rather than what read well in a first draft. The app passes nothing and gets
 * `DEFAULT_TUNING`.
 */
export interface Tuning {
  /** Strata: how a row orders its cards. `hue` by hue angle; `light` dark to bright; `chain` nearest palette neighbour from the darkest. */
  strataOrder: 'hue' | 'light' | 'chain';
  /** Strata: transition cards sit at a row's ends (true) or are sorted in with the clean cards. */
  transitionsAtEnds: boolean;
  /** Flow: how much a vertical neighbour counts against a horizontal one, 0..1. */
  flowVertical: number;
  /** Flow: the gradient's seed card, the darkest or the brightest. */
  flowStart: 'dark' | 'light';
  /** Mirror: a card's twin is one by the same illustrator first, or the closest palette outright. */
  mirrorTwin: 'illustrator' | 'palette';
  /**
   * Flow on an all-WINDOWED page: group by energy type first (the frame is what the eye sees on
   * a windowed card; owner, 2026-10-21: "fires should go in a row or column together, as should
   * waters ... the art comes secondary"), with the art gradient inside each group. A full-art page
   * has no frame to read and keeps the plain gradient whatever this says.
   */
  flowByType: boolean;
}

/**
 * The defaults follow the first Arrange Lab run (2026-10-21, 47 rounds): hue order and the dark
 * seed, half-weight vertical neighbours and the illustrator twin each won or tied their rounds;
 * transition cards mixed in with the row won the one round the owner could tell apart (the other
 * two were "about equal"), so they are no longer forced to the ends.
 */
export const DEFAULT_TUNING: Tuning = {
  strataOrder: 'hue',
  transitionsAtEnds: false,
  flowVertical: 0.5,
  flowStart: 'dark',
  mirrorTwin: 'illustrator',
  flowByType: true,
};

// ---------------------------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------------------------

/**
 * The stratum table (docs/ARRANGE.md). Bare words; the server query sends them namespaced and the
 * classifier strips the namespace back off. Deliberately absent: rocks (in every band) and smoke
 * (it rises), which mis-sorted real cards in the first draft; and weather and light (storm,
 * lightning, sunset, sunrise) and tunnel, which the owner clicked as wrong in the first Arrange
 * Lab run (2026-10-21): a storm over a city is a city card, a sunset on a beach is a beach card, a
 * mouse in a road tunnel is not underground.
 */
export const DEPTH_WORDS: Record<Depth, readonly string[]> = {
  above: ['sky', 'clouds', 'stars', 'moon', 'space', 'rainbow', 'aurora', 'airborne', 'flying'],
  surface: [
    'grass', 'field', 'meadow', 'forest', 'trees', 'jungle', 'beach', 'shore', 'desert', 'city', 'town', 'road', 'garden', 'arena',
    'mountain', 'volcano', 'canyon', 'cliff', 'lake', 'river', 'ocean', 'waves', 'swamp', 'snow', 'ice', 'ruins',
  ],
  below: ['underwater', 'seaweed', 'coral', 'cave', 'underground', 'mine', 'sewer', 'dungeon', 'deep sea'],
};

/** The namespaced forms the tag data actually uses for the table's words, for `score_cards_by_theme`. */
export function depthTagQuery(): string[] {
  const out: string[] = [];
  for (const words of Object.values(DEPTH_WORDS)) {
    for (const w of words) {
      out.push(`scene:${w}`);
      if (w === 'flying' || w === 'airborne') out.push(`action:${w}`);
      if (w === 'seaweed' || w === 'coral' || w === 'clouds' || w === 'stars') out.push(`object:${w}`);
    }
  }
  return out;
}

const BAND_OF: ReadonlyMap<string, Depth> = new Map(
  (Object.keys(DEPTH_WORDS) as Depth[]).flatMap((d) => DEPTH_WORDS[d].map((w) => [w, d] as [string, Depth])),
);

const bare = (tag: string): string => (tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag);

export interface DepthRead {
  /** The band of the first depth word; null when the card has none (free). */
  depth: Depth | null;
  /** A later word names another band: the card is a TRANSITION, mostly `depth`, partly this. */
  partly: Depth | null;
}

export function depthOf(card: Pick<ArrangeCard, 'depthWords'>): DepthRead {
  let depth: Depth | null = null;
  let partly: Depth | null = null;
  for (const t of card.depthWords ?? []) {
    const band = BAND_OF.get(bare(t));
    if (!band) continue;
    if (!depth) depth = band;
    else if (band !== depth && !partly) partly = band;
  }
  return { depth, partly };
}

export const DEPTH_LABEL: Record<Depth, string> = { above: 'sky', surface: 'ground', below: 'underground' };

// ---------------------------------------------------------------------------------------------
// Card facts the modes read
// ---------------------------------------------------------------------------------------------

/**
 * The pipeline's full-art kinds whose picture is the whole card. Everything else (scene_tagged,
 * measured, double_rare, unknown) is a WINDOWED card: the picture sits in a frame.
 */
export const FULL_ART_KINDS: ReadonlySet<string> = new Set(['special_illustration_rare', 'illustration_rare', 'named_full_art']);

export type ArtClass = 'full' | 'windowed';

export const artClassOf = (fullArtKind: string | undefined): ArtClass => (FULL_ART_KINDS.has(fullArtKind ?? '') ? 'full' : 'windowed');

/**
 * A page Arrange seats is all full arts or all windowed cards (owner, 2026-10-21: "either the
 * entire page is full arts, or the entire page is windowed arts"; a product rule, not only a lab
 * one). A page that mixes the two is not offered. This counts both, so the sheet can say which.
 */
export function pageArtMix(cards: readonly Pick<ArrangeCard, 'fullArtKind'>[]): { full: number; windowed: number; mixed: boolean } {
  let full = 0;
  let windowed = 0;
  for (const c of cards) if (artClassOf(c.fullArtKind) === 'full') full += 1; else windowed += 1;
  return { full, windowed, mixed: full > 0 && windowed > 0 };
}

/** How much a card carries a page: full-art kind first, then a picture rarity. */
export function strength(card: ArrangeCard): number {
  const kind: Record<string, number> = { special_illustration_rare: 4, illustration_rare: 3, named_full_art: 3, double_rare: 1 };
  const base = kind[card.fullArtKind ?? ''] ?? 0;
  const rare = /rare|ultra|secret|hyper/i.test(card.rarity ?? '') ? 1 : 0;
  return base + rare;
}

/** The dominant colour, or a mid grey for a card with no palette. */
export function dominant(card: ArrangeCard): PaletteColor {
  let best: PaletteColor | null = null;
  for (const c of card.palette ?? []) if (!best || c.w > best.w) best = c;
  return best ?? { L: 50, a: 0, b: 0, w: 1 };
}

/** Symmetric weighted palette distance: each colour to its nearest in the other card, by coverage. */
export function paletteDist(a: ArrangeCard, b: ArrangeCard): number {
  const pa = a.palette?.length ? a.palette : [dominant(a)];
  const pb = b.palette?.length ? b.palette : [dominant(b)];
  const one = (xs: readonly PaletteColor[], ys: readonly PaletteColor[]): number => {
    let sum = 0;
    let wsum = 0;
    for (const x of xs) {
      let d = Infinity;
      for (const y of ys) d = Math.min(d, Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b));
      sum += x.w * d;
      wsum += x.w;
    }
    return wsum ? sum / wsum : 0;
  };
  return (one(pa, pb) + one(pb, pa)) / 2;
}

/** Hue angle of the dominant colour, for a left-to-right flow inside a row. */
export function hue(card: ArrangeCard): number {
  const d = dominant(card);
  return (Math.atan2(d.b, d.a) * 180) / Math.PI;
}

const lineKey = (c: ArrangeCard): string => (c.evolutionLine?.length ? c.evolutionLine.join('>') : '');

/**
 * Connected art has no flag anywhere. The proxy: the two halves of a Legend ("(Top)" / "(Bottom)")
 * or any "(Left)" / "(Right)" pair; else two cards from one set by one illustrator with consecutive
 * numbers. It will catch most and miss some; the caller may pass better pairs in.
 */
export function connectedPairs(cards: readonly ArrangeCard[]): ConnectedPair[] {
  const out: ConnectedPair[] = [];
  const taken = new Set<string>();
  const half = /^(.*)\s\((Top|Bottom|Left|Right)\)$/;
  const byBase = new Map<string, ArrangeCard[]>();
  for (const c of cards) {
    const m = half.exec(c.name);
    if (!m) continue;
    const base = m[1];
    const arr = byBase.get(base) ?? [];
    arr.push(c);
    byBase.set(base, arr);
  }
  for (const group of byBase.values()) {
    const find = (side: string) => group.find((c) => c.name.endsWith(`(${side})`));
    const top = find('Top');
    const bottom = find('Bottom');
    const left = find('Left');
    const right = find('Right');
    if (top && bottom) { out.push({ a: top.id, b: bottom.id, dir: 'vertical' }); taken.add(top.id); taken.add(bottom.id); }
    if (left && right) { out.push({ a: left.id, b: right.id, dir: 'horizontal' }); taken.add(left.id); taken.add(right.id); }
  }
  const rest = cards.filter((c) => !taken.has(c.id) && c.setId && c.illustrator && c.number && /^\d+/.test(c.number));
  const sorted = [...rest].sort((x, y) => (x.setId! < y.setId! ? -1 : x.setId! > y.setId! ? 1 : parseInt(x.number!, 10) - parseInt(y.number!, 10)));
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const x = sorted[i];
    const y = sorted[i + 1];
    if (taken.has(x.id) || taken.has(y.id)) continue;
    if (x.setId === y.setId && x.illustrator === y.illustrator && parseInt(y.number!, 10) === parseInt(x.number!, 10) + 1) {
      out.push({ a: x.id, b: y.id, dir: 'horizontal' });
      taken.add(x.id);
      taken.add(y.id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

/** Every pocket of the canvas in reading order: row by row, left leaf then right. */
export function allCells(rows: number, cols: number, spread: boolean): Cell[] {
  const leaves: Leaf[] = spread ? ['left', 'right'] : ['single'];
  const out: Cell[] = [];
  for (let r = 0; r < rows; r += 1) for (const leaf of leaves) for (let c = 0; c < cols; c += 1) out.push({ leaf, row: r, col: c });
  return out;
}

/** The cells a template's panels cover, keyed like `cellKey`, on this canvas. */
export function templateCells(t: ArtTemplate, spread: boolean): Set<string> {
  const out = new Set<string>();
  for (const p of t.panels) {
    const leaf: Leaf = spread ? (p.page ?? 'left') : 'single';
    for (let r = p.row; r < p.row + p.rowSpan; r += 1) for (let c = p.col; c < p.col + p.colSpan; c += 1) out.add(cellKey({ leaf, row: r, col: c }));
  }
  return out;
}

/** The card pockets left once `reserved` is taken out, in reading order. */
export function cardCells(rows: number, cols: number, spread: boolean, reserved: ReadonlySet<string>): Cell[] {
  return allCells(rows, cols, spread).filter((c) => !reserved.has(cellKey(c)));
}

function findCell(cells: readonly Cell[], leaf: Leaf, row: number, col: number): number {
  return cells.findIndex((c) => c.leaf === leaf && c.row === row && c.col === col);
}

/** Are these two cells horizontal neighbours, counting across the gutter of a spread? */
function besideOf(a: Cell, b: Cell, cols: number): boolean {
  if (a.row !== b.row) return false;
  if (a.leaf === b.leaf) return Math.abs(a.col - b.col) === 1;
  return (a.leaf === 'left' && b.leaf === 'right' && a.col === cols - 1 && b.col === 0) || (b.leaf === 'left' && a.leaf === 'right' && b.col === cols - 1 && a.col === 0);
}

function belowOf(a: Cell, b: Cell): boolean {
  return a.leaf === b.leaf && a.col === b.col && Math.abs(a.row - b.row) === 1;
}

// ---------------------------------------------------------------------------------------------
// Seatings
// ---------------------------------------------------------------------------------------------

/** `seating[i]` is the card in `cells[i]`, or null for an open pocket. */
export type Seating = (ArrangeCard | null)[];

/** The canvas a mode seats onto: its card pockets, its shape, the connected pairs, the tuning. */
export interface SeatCtx {
  cells: readonly Cell[];
  cols: number;
  rows: number;
  spread: boolean;
  pairs: readonly ConnectedPair[];
  /** Absent means `DEFAULT_TUNING`. */
  tuning?: Partial<Tuning>;
}
type Ctx = SeatCtx;

const tuningOf = (ctx: Ctx): Tuning => ({ ...DEFAULT_TUNING, ...(ctx.tuning ?? {}) });

/** Nearest palette neighbour chain from the darkest card: the order the eye reads as one gradient. */
function paletteChain(cards: readonly ArrangeCard[], start: 'dark' | 'light'): ArrangeCard[] {
  const rest = [...cards].sort((x, y) => (start === 'dark' ? dominant(x).L - dominant(y).L : dominant(y).L - dominant(x).L));
  if (rest.length < 2) return rest;
  const chain: ArrangeCard[] = [rest.shift()!];
  while (rest.length) {
    const last = chain[chain.length - 1];
    rest.sort((x, y) => paletteDist(last, x) - paletteDist(last, y));
    chain.push(rest.shift()!);
  }
  return chain;
}

/**
 * Pairwise-swap hill climb: try every pair of cells, keep a swap that raises the score, repeat
 * until none does. `allowed` says which cells may trade (a Strata row, the whole canvas for Flow).
 */
function improve(seating: Seating, score: (s: Seating) => number, allowed: (i: number, j: number) => boolean): Seating {
  const s = [...seating];
  let best = score(s);
  let moved = true;
  let guard = 0;
  while (moved && guard < 50) {
    moved = false;
    guard += 1;
    for (let i = 0; i < s.length; i += 1) {
      for (let j = i + 1; j < s.length; j += 1) {
        if (!allowed(i, j) || (!s[i] && !s[j])) continue;
        [s[i], s[j]] = [s[j], s[i]];
        const v = score(s);
        if (v > best + 1e-9) {
          best = v;
          moved = true;
        } else {
          [s[i], s[j]] = [s[j], s[i]];
        }
      }
    }
  }
  return s;
}

/**
 * Connected art is adjacent, hard, applied after a mode has seated. If one half is held, its
 * partner is seated next to it by displacing the occupant (who becomes held instead); if both are
 * seated apart, the second half swaps into the cell next to the first.
 */
export function fixConnected(seating: Seating, ctx: Ctx, held: ArrangeCard[], byId: ReadonlyMap<string, ArrangeCard>): Seating {
  const s = [...seating];
  for (const pair of ctx.pairs) {
    const a = byId.get(pair.a);
    const b = byId.get(pair.b);
    if (!a || !b) continue;
    const at = (id: string) => s.findIndex((x) => x?.id === id);
    const ai = at(a.id);
    const bi = at(b.id);
    if (ai < 0 && bi < 0) continue;
    const anchor = ai >= 0 ? ai : bi;
    const other = ai >= 0 ? b : a;
    const dir = ai >= 0 ? 1 : -1;
    const c = ctx.cells[anchor];
    const want = pair.dir === 'vertical'
      ? findCell(ctx.cells, c.leaf, c.row + dir, c.col)
      : (() => {
          const same = findCell(ctx.cells, c.leaf, c.row, c.col + dir);
          if (same >= 0) return same;
          // Across the gutter.
          if (ctx.spread && dir > 0 && c.leaf === 'left' && c.col === ctx.cols - 1) return findCell(ctx.cells, 'right', c.row, 0);
          if (ctx.spread && dir < 0 && c.leaf === 'right' && c.col === 0) return findCell(ctx.cells, 'left', c.row, ctx.cols - 1);
          return -1;
        })();
    if (want < 0) {
      // The anchor sits where its partner cannot follow (an edge). Try anchoring on the other end.
      const alt = pair.dir === 'vertical' ? findCell(ctx.cells, c.leaf, c.row - dir, c.col) : findCell(ctx.cells, c.leaf, c.row, c.col - dir);
      if (alt >= 0) {
        // Read where the partner is BEFORE moving anything, or the anchor's new occupant is found first.
        const oi = at(other.id);
        const displaced = s[alt];
        s[alt] = s[anchor];
        s[anchor] = other;
        if (oi >= 0) s[oi] = displaced;
        else {
          const hi = held.findIndex((h) => h.id === other.id);
          if (hi >= 0) held.splice(hi, 1);
          if (displaced) held.push(displaced);
        }
      }
      continue;
    }
    const oi = at(other.id);
    if (oi === want) continue;
    const displaced = s[want];
    s[want] = other;
    if (oi >= 0) s[oi] = displaced;
    else {
      const hi = held.findIndex((h) => h.id === other.id);
      if (hi >= 0) held.splice(hi, 1);
      if (displaced) held.push(displaced);
    }
  }
  return s;
}

export interface ModeResult {
  seating: Seating;
  /** Cards the layout could not seat, never dropped. */
  held: ArrangeCard[];
  /** 0..1: how well the cards suit this mode on this geometry. */
  fit: number;
  /** One line the user can check against the picture. */
  note: string;
  /** What one more card would complete, for the sparing suggestion. Absent when nothing is short. */
  ask?: Ask;
}

export type Ask =
  | { kind: 'band'; depth: Depth; open: number }
  | { kind: 'stage'; line: readonly string[]; stage: number; species: string };

/** Which row a band owns on a canvas of `rows` rows. Three rows is the natural case. */
export function bandRows(rows: number): Record<Depth, number[]> {
  if (rows >= 3) {
    const top = Math.floor(rows / 3);
    const bottom = Math.floor(rows / 3);
    const above = Array.from({ length: top }, (_, i) => i);
    const below = Array.from({ length: bottom }, (_, i) => rows - bottom + i);
    const surface = Array.from({ length: rows - top - bottom }, (_, i) => top + i);
    return { above, surface, below };
  }
  if (rows === 2) return { above: [0], surface: [1], below: [] };
  return { above: [], surface: [0], below: [] };
}

/**
 * STRATA. Rows are depths. Purity is enforced by construction: a band's cards only ever go to the
 * band's rows, transition cards to the rows' ends, free cards to whatever is short, and nothing is
 * borrowed. A pocket left open is the ask.
 */
export function seatStrata(cards: readonly ArrangeCard[], ctx: Ctx): ModeResult | null {
  const tune = tuningOf(ctx);
  const bands: Record<Depth, ArrangeCard[]> = { above: [], surface: [], below: [] };
  const free: ArrangeCard[] = [];
  for (const c of cards) {
    const d = depthOf(c);
    if (d.depth) bands[d.depth].push(c);
    else free.push(c);
  }
  const owned = bandRows(ctx.rows);
  const withCards = (Object.keys(bands) as Depth[]).filter((d) => bands[d].length > 0);
  // Two-band version when one band is empty on a three-row canvas: the middle rows join the band
  // that is present on that side. Not offered at all when only one band has cards.
  if (withCards.length < 2) return null;
  if (ctx.rows >= 3 && withCards.length === 2) {
    const missing = (Object.keys(bands) as Depth[]).find((d) => bands[d].length === 0)!;
    if (missing === 'above') owned.surface = [...owned.above, ...owned.surface];
    else if (missing === 'below') owned.surface = [...owned.surface, ...owned.below];
    else {
      // No ground: sky over underground. The middle rows go to whichever has more cards.
      const mid = owned.surface;
      if (bands.above.length >= bands.below.length) owned.above = [...owned.above, ...mid];
      else owned.below = [...mid, ...owned.below];
    }
    owned[missing] = [];
  }
  // Clean before transition, so when a band has more cards than pockets the transition cards are
  // the ones held; a card with a free connected partner first of all, so the pair can use it.
  const partnerFree = new Set<string>();
  for (const p of ctx.pairs) {
    const fa = free.some((f) => f.id === p.a);
    const fb = free.some((f) => f.id === p.b);
    if (fa) partnerFree.add(p.b);
    if (fb) partnerFree.add(p.a);
  }
  const rank = (c: ArrangeCard) => (partnerFree.has(c.id) ? -1 : depthOf(c).partly ? 1 : 0);
  for (const d of Object.keys(bands) as Depth[]) bands[d].sort((x, y) => rank(x) - rank(y));

  const seating: Seating = new Array(ctx.cells.length).fill(null);
  const held: ArrangeCard[] = [];
  const rowCells = (r: number) => ctx.cells.map((c, i) => (c.row === r ? i : -1)).filter((i) => i >= 0);
  for (const d of Object.keys(bands) as Depth[]) {
    const idx = owned[d].flatMap(rowCells);
    const take = bands[d].slice(0, idx.length);
    held.push(...bands[d].slice(idx.length));
    // Palette flows left to right; transition cards sit at the ends, where the eye expects an edge.
    const order = (xs: ArrangeCard[]): ArrangeCard[] =>
      tune.strataOrder === 'hue' ? [...xs].sort((x, y) => hue(x) - hue(y))
        : tune.strataOrder === 'light' ? [...xs].sort((x, y) => dominant(x).L - dominant(y).L)
          : paletteChain(xs, 'dark');
    const clean = order(take.filter((c) => !depthOf(c).partly));
    const trans = order(take.filter((c) => depthOf(c).partly));
    const half = Math.ceil(trans.length / 2);
    const ordered = tune.transitionsAtEnds ? [...trans.slice(0, half), ...clean, ...trans.slice(half)] : order(take);
    idx.forEach((i, k) => {
      seating[i] = ordered[k] ?? null;
    });
  }
  // Free cards: a connected partner goes under or over its seated half; the rest fill the shortest band.
  const byId = new Map(cards.map((c) => [c.id, c]));
  const partnerOf = (c: ArrangeCard) => {
    const p = ctx.pairs.find((x) => x.a === c.id || x.b === c.id);
    return p ? (p.a === c.id ? byId.get(p.b) : byId.get(p.a)) : undefined;
  };
  for (const f of free) {
    const partner = partnerOf(f);
    const pi = partner ? seating.findIndex((x) => x?.id === partner.id) : -1;
    if (pi >= 0) {
      const pair = ctx.pairs.find((x) => x.a === f.id || x.b === f.id)!;
      const c = ctx.cells[pi];
      const isB = pair.b === f.id;
      const want = pair.dir === 'vertical' ? findCell(ctx.cells, c.leaf, c.row + (isB ? 1 : -1), c.col) : findCell(ctx.cells, c.leaf, c.row, c.col + (isB ? 1 : -1));
      if (want >= 0) {
        if (seating[want]) {
          const hole = ctx.cells.findIndex((x, i) => x.row === ctx.cells[want].row && !seating[i]);
          if (hole >= 0) seating[hole] = seating[want];
          else {
            held.push(f);
            continue;
          }
        }
        seating[want] = f;
        continue;
      }
    }
    const open = ctx.cells.map((_, i) => i).filter((i) => !seating[i]);
    if (open.length) seating[open[0]] = f;
    else held.push(f);
  }
  const fixed = fixConnected(seating, ctx, held, byId);
  const open = fixed.filter((x) => !x).length;
  const seated = fixed.filter(Boolean).length;
  const fit = ctx.cells.length ? seated / ctx.cells.length : 0;
  let ask: Ask | undefined;
  if (open === 1) {
    const i = fixed.findIndex((x) => !x);
    const r = ctx.cells[i].row;
    const depth = (Object.keys(owned) as Depth[]).find((d) => owned[d].includes(r));
    if (depth) ask = { kind: 'band', depth, open };
  }
  const present = withCards.map((d) => DEPTH_LABEL[d]);
  return { seating: fixed, held, fit, ask, note: `rows are depths: ${present.join(', ')}; no row shows another row's depth` };
}

/**
 * LINES. Each row segment (a leaf's row) takes one evolution line in stage order, longest lines
 * first; left-over pockets go to the strongest single cards.
 */
export function seatLines(cards: readonly ArrangeCard[], ctx: Ctx): ModeResult | null {
  const groups = new Map<string, ArrangeCard[]>();
  for (const c of cards) {
    const k = lineKey(c) || `solo:${c.id}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const runs = [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => [...g].sort((x, y) => (x.evolutionStage ?? 0) - (y.evolutionStage ?? 0)))
    .sort((x, y) => y.length - x.length);
  if (runs.length < 2) return null;
  const singles = [...groups.values()].filter((g) => g.length === 1).flat().sort((x, y) => strength(y) - strength(x));
  const leaves: Leaf[] = ctx.spread ? ['left', 'right'] : ['single'];
  const segs: number[][] = [];
  for (let r = 0; r < ctx.rows; r += 1) for (const leaf of leaves) {
    const idx = ctx.cells.map((c, i) => (c.row === r && c.leaf === leaf ? i : -1)).filter((i) => i >= 0);
    if (idx.length) segs.push(idx);
  }
  const seating: Seating = new Array(ctx.cells.length).fill(null);
  const used = new Set<ArrangeCard[]>();
  let complete = 0;
  for (const seg of segs) {
    const run = runs.find((g) => !used.has(g) && g.length <= seg.length);
    const fill: ArrangeCard[] = run ? [...run] : [];
    if (run) {
      used.add(run);
      complete += 1;
    }
    while (fill.length < seg.length && singles.length) fill.push(singles.shift()!);
    seg.forEach((i, k) => {
      seating[i] = fill[k] ?? null;
    });
  }
  // Lines that found no row and singles that found no pocket are held.
  const held: ArrangeCard[] = [...runs.filter((g) => !used.has(g)).flat(), ...singles];
  // Any open pockets left take held cards (a line too long for every segment breaks up rather than
  // being dropped), so no card is lost to geometry.
  for (let i = 0; i < seating.length && held.length; i += 1) if (!seating[i]) seating[i] = held.shift()!;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const fixed = fixConnected(seating, ctx, held, byId);
  const fit = segs.length ? complete / segs.length : 0;
  // The ask: a line on the page that is missing a middle stage.
  let ask: Ask | undefined;
  for (const run of runs) {
    const line = run[0].evolutionLine ?? [];
    const stages = new Set(run.map((c) => c.evolutionStage ?? -1));
    for (let st = 2; st < line.length; st += 1) {
      if (!stages.has(st) && stages.has(st - 1) && stages.has(st + 1)) {
        ask = { kind: 'stage', line, stage: st, species: line[st - 1] };
        break;
      }
    }
    if (ask) break;
  }
  return { seating: fixed, held, fit, ask, note: 'each row is an evolution line read left to right; spare pockets go to the strongest single cards' };
}

/** FLOW. Nearest-neighbour chain from the darkest card, then swaps until no swap shortens the gradient. */
export function seatFlow(cards: readonly ArrangeCard[], ctx: Ctx): ModeResult | null {
  if (cards.length < 2) return null;
  const tune = tuningOf(ctx);
  if (tune.flowByType && pageArtMix(cards).full === 0 && new Set(cards.map(typeOf)).size >= 2) return seatFlowTyped(cards, ctx, tune);
  const whole = paletteChain(cards, tuningOf(ctx).flowStart);
  const chain = whole.slice(0, ctx.cells.length);
  const held = whole.slice(ctx.cells.length);
  const seating: Seating = ctx.cells.map((_, i) => chain[i] ?? null);
  const score = (s: Seating) => -flowRoughness(s, ctx);
  const improved = improve(seating, score, () => true);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const fixed = fixConnected(improved, ctx, held, byId);
  // Fit: the mean palette step between neighbours against a step the eye reads as a jump (40 Lab
  // units is a different colour, not a shade). A page of near-identical cards scores 1.
  const rough = flowRoughness(fixed, ctx);
  const steps = neighbourCount(fixed, ctx);
  const fit = steps ? Math.max(0, Math.min(1, 1 - rough / steps / 40)) : 1;
  const first = fixed.find(Boolean);
  const last = [...fixed].reverse().find(Boolean);
  const note = first && last ? `one palette gradient across the ${ctx.spread ? 'spread' : 'page'}, ${first.name} to ${last.name}` : 'one palette gradient';
  return { seating: fixed, held, fit, note };
}

/**
 * The energy types in the order their frames sit round the colour wheel, so neighbouring groups
 * read as one gradient: red, brown, gold, yellow, green, blue, steel, purple, pink, dark, grey.
 * A card with no type (a Trainer) is its own white group at the end.
 */
export const TYPE_WHEEL: readonly string[] = ['Fire', 'Fighting', 'Dragon', 'Lightning', 'Grass', 'Water', 'Metal', 'Psychic', 'Fairy', 'Darkness', 'Colorless', 'Trainer'];

export const typeOf = (card: Pick<ArrangeCard, 'types'>): string => card.types?.[0] ?? 'Trainer';

const wheelIndex = (t: string): number => {
  const i = TYPE_WHEEL.indexOf(t);
  return i < 0 ? TYPE_WHEEL.length : i;
};

/**
 * FLOW BY TYPE, for a windowed page. Each type's cards are one group, ordered inside by the art
 * gradient; the groups run round the wheel; the sequence is cut into the page's rows, or its
 * columns, whichever leaves more lines of one type, trying every group as the starting point.
 * A group the size of a line gets a line to itself; a smaller one shares a line with its wheel
 * neighbour, which is the next-best thing the eye can read.
 */
function seatFlowTyped(cards: readonly ArrangeCard[], ctx: Ctx, tune: Tuning): ModeResult {
  const byType = new Map<string, ArrangeCard[]>();
  for (const c of cards) {
    const t = typeOf(c);
    byType.set(t, [...(byType.get(t) ?? []), c]);
  }
  const groups = [...byType.entries()]
    .sort((a, b) => wheelIndex(a[0]) - wheelIndex(b[0]) || a[0].localeCompare(b[0]))
    .map(([type, xs]) => ({ type, cards: paletteChain(xs, tune.flowStart) }));
  // The page's lines, as cell indices into ctx.cells: its rows, or its columns.
  const linesOf = (byRow: boolean): number[][] => {
    const keyed = new Map<string, number[]>();
    ctx.cells.forEach((c, i) => {
      const k = byRow ? `${c.leaf}:${c.row}` : `${c.leaf}:${c.col}`;
      keyed.set(k, [...(keyed.get(k) ?? []), i]);
    });
    const lines = [...keyed.values()];
    for (const line of lines) line.sort((p, q) => (byRow ? ctx.cells[p].col - ctx.cells[q].col : ctx.cells[p].row - ctx.cells[q].row));
    return lines;
  };
  let best: { seating: Seating; pure: number; lines: number; byRow: boolean } | null = null;
  for (const byRow of [true, false]) {
    const lines = linesOf(byRow);
    if (!byRow && lines.length === ctx.cells.length) continue; // a one-row page has no columns to speak of
    for (let start = 0; start < groups.length; start += 1) {
      const seq = [...groups.slice(start), ...groups.slice(0, start)].flatMap((g) => g.cards);
      const seating: Seating = new Array(ctx.cells.length).fill(null);
      let k = 0;
      for (const line of lines) for (const i of line) if (k < seq.length) seating[i] = seq[k++];
      let pure = 0;
      let counted = 0;
      for (const line of lines) {
        const held = line.map((i) => seating[i]).filter((x): x is ArrangeCard => !!x);
        if (held.length < 2) continue;
        counted += 1;
        if (new Set(held.map(typeOf)).size === 1) pure += 1;
      }
      if (!best || pure > best.pure || (pure === best.pure && byRow && !best.byRow)) best = { seating, pure, lines: counted, byRow };
    }
  }
  const chosen = best!;
  const seated = new Set(chosen.seating.filter(Boolean).map((c) => c!.id));
  const held = cards.filter((c) => !seated.has(c.id));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const fixed = fixConnected(chosen.seating, ctx, held, byId);
  const fit = chosen.lines ? chosen.pure / chosen.lines : 1;
  const names = groups.map((g) => g.type.toLowerCase());
  return {
    seating: fixed,
    held,
    fit,
    note: `${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and more' : ''}: each type together in its own ${chosen.byRow ? 'row' : 'column'}, the art flowing inside it`,
  };
}

/** How many neighbour pairs the roughness summed over, weighted the same way. */
function neighbourCount(s: Seating, ctx: Ctx): number {
  const v = tuningOf(ctx).flowVertical;
  let n = 0;
  for (let i = 0; i < ctx.cells.length; i += 1) {
    for (let j = i + 1; j < ctx.cells.length; j += 1) {
      if (!s[i] || !s[j]) continue;
      if (besideOf(ctx.cells[i], ctx.cells[j], ctx.cols)) n += 1;
      else if (belowOf(ctx.cells[i], ctx.cells[j])) n += v;
    }
  }
  return n;
}

/** Total palette distance between neighbours: horizontal at full weight, vertical at `flowVertical` (half by default). */
export function flowRoughness(s: Seating, ctx: Ctx): number {
  const v = tuningOf(ctx).flowVertical;
  let d = 0;
  for (let i = 0; i < ctx.cells.length; i += 1) {
    for (let j = i + 1; j < ctx.cells.length; j += 1) {
      const a = s[i];
      const b = s[j];
      if (!a || !b) continue;
      if (besideOf(ctx.cells[i], ctx.cells[j], ctx.cols)) d += paletteDist(a, b);
      else if (belowOf(ctx.cells[i], ctx.cells[j])) d += v * paletteDist(a, b);
    }
  }
  return d;
}

/** The cell that mirrors `c` across the gutter, or across a single page's centre column. */
export function mirrorCell(c: Cell, ctx: Ctx): number {
  if (ctx.spread) return findCell(ctx.cells, c.leaf === 'left' ? 'right' : 'left', c.row, ctx.cols - 1 - c.col);
  return findCell(ctx.cells, c.leaf, c.row, ctx.cols - 1 - c.col);
}

/**
 * MIRROR. The strongest cards take the outer corners; every card's mirror is one by the same
 * illustrator, else the closest palette. Offered on spreads and on single pages with an odd column
 * count (a centre column to mirror around).
 */
export function seatMirror(cards: readonly ArrangeCard[], ctx: Ctx): ModeResult | null {
  if (!ctx.spread && ctx.cols % 2 === 0) return null;
  if (cards.length < 4) return null;
  const byStrength = [...cards].sort((x, y) => strength(y) - strength(x) || x.id.localeCompare(y.id));
  const seating: Seating = new Array(ctx.cells.length).fill(null);
  const taken = new Set<string>();
  // Mirror-pair every cell once: the cell and its mirror, outer corners first.
  const order = ctx.cells
    .map((c, i) => ({ i, c, m: mirrorCell(c, ctx) }))
    .filter((x) => x.m >= 0 && x.i < x.m)
    .sort((p, q) => {
      const edge = (x: Cell) => (ctx.spread ? (x.leaf === 'left' ? x.col : ctx.cols - 1 - x.col) : Math.min(x.col, ctx.cols - 1 - x.col)) + Math.min(x.row, ctx.rows - 1 - x.row);
      return edge(p.c) - edge(q.c) || p.i - q.i;
    });
  const pool = byStrength.filter((c) => !taken.has(c.id));
  const byIllustrator = tuningOf(ctx).mirrorTwin === 'illustrator';
  const twin = (a: ArrangeCard) => {
    const rest = pool.filter((c) => !taken.has(c.id) && c.id !== a.id);
    const same = byIllustrator ? rest.filter((c) => c.illustrator && c.illustrator === a.illustrator).sort((x, y) => paletteDist(a, x) - paletteDist(a, y)) : [];
    if (same.length) return same[0];
    return rest.sort((x, y) => paletteDist(a, x) - paletteDist(a, y))[0];
  };
  let matched = 0;
  let pairs = 0;
  for (const { i, m } of order) {
    const a = pool.find((c) => !taken.has(c.id));
    if (!a) break;
    taken.add(a.id);
    const b = twin(a);
    seating[i] = a;
    if (b) {
      taken.add(b.id);
      seating[m] = b;
      pairs += 1;
      if (b.illustrator && b.illustrator === a.illustrator) matched += 1;
    }
  }
  // Unpaired cells (a centre column) take what is left, strongest first.
  for (let i = 0; i < seating.length; i += 1) {
    if (seating[i]) continue;
    const c = pool.find((x) => !taken.has(x.id));
    if (!c) break;
    taken.add(c.id);
    seating[i] = c;
  }
  const held = cards.filter((c) => !taken.has(c.id));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const fixed = fixConnected(seating, ctx, held, byId);
  const fit = pairs ? 0.5 + 0.5 * (matched / pairs) : 0.5;
  const corners = fixed.filter((c, i) => c && order.length && (i === order[0].i || i === order[0].m)).map((c) => c!.name);
  return { seating: fixed, held, fit, note: corners.length === 2 ? `${corners[0]} and ${corners[1]} in the outer corners; every card mirrored across the ${ctx.spread ? 'gutter' : 'centre'}` : 'the strongest cards in the outer corners, each mirrored' };
}

// ---------------------------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------------------------

/**
 * Some panel roles make a mode read better; some fight it (docs/ARRANGE.md). Added to the
 * ranking, so a fighting pair is ranked down rather than banned. +1 strong, -1 weak.
 */
export const PAIRING: Record<ArtRole, Partial<Record<ArrangeMode, number>>> = {
  title: { strata: 1 },
  band: { strata: 1, lines: -1, flow: -1 },
  footer: { flow: 1 },
  rail: { lines: 1, mirror: 1 },
  anchor: { strata: -1, lines: -1, flow: -1, mirror: 1 },
  post: { mirror: 1 },
  plate: {},
  accent: {},
};

export function pairingScore(t: ArtTemplate | null, mode: ArrangeMode): number {
  if (!t) return 0;
  const roles = new Set(t.panels.map((p) => p.role));
  let s = 0;
  for (const r of roles) s += PAIRING[r]?.[mode] ?? 0;
  return s;
}

export const MODE_LABEL: Record<ArrangeMode, string> = { strata: 'Strata', lines: 'Lines', flow: 'Flow', mirror: 'Mirror' };

/**
 * What a mode is worth before its fit, from the first Arrange Lab run (2026-10-21). Shown the
 * same cards seated several ways, the owner picked the app's first-ranked candidate 3 times in 10
 * and its second 7 times: Flow's fit runs high (a smooth gradient is easy to make) while the owner
 * reads structure first. Flow won 5 of its 22 columns, Mirror 8 of 13, Strata 7 of 16, Lines 2 of
 * 3. With these added to the score the picked candidate ranks first in 17 of the 22 decided
 * rounds (8 before). Flow stays offered: it is the fallback that needs nothing from the cards.
 */
export const MODE_PRIOR: Record<ArrangeMode, number> = { strata: 0, lines: 1, flow: -1.5, mirror: -0.25 };

export interface Placement {
  cardId: string;
  cell: Cell;
}

export interface Candidate {
  /** Stable within one run: `${templateId|page}:${mode}`, or 'current'. */
  id: string;
  template: ArtTemplate | null;
  mode: ArrangeMode | 'current';
  name: string;
  /** One line the user can check against the picture. */
  reason: string;
  placements: Placement[];
  /** Pockets the layout leaves open. */
  open: Cell[];
  /** Cards it could not seat, never dropped. */
  held: ArrangeCard[];
  /** Pockets the template spends on art. */
  artCells: number;
  /** 0..1 mode fit, before pairing and art bonuses. */
  fit: number;
  /** The ranking score; higher first. */
  score: number;
  ask?: Ask;
}

const MODES: { mode: ArrangeMode; seat: (cards: readonly ArrangeCard[], ctx: Ctx) => ModeResult | null }[] = [
  { mode: 'strata', seat: seatStrata },
  { mode: 'lines', seat: seatLines },
  { mode: 'flow', seat: seatFlow },
  { mode: 'mirror', seat: seatMirror },
];

/** One mode on one canvas, or null when the mode is not offered for these cards. */
export function seatWith(mode: ArrangeMode, cards: readonly ArrangeCard[], ctx: SeatCtx): ModeResult | null {
  return MODES.find((m) => m.mode === mode)!.seat(cards, ctx);
}

/** A mode's result as the sheet would show it: placements, open pockets, held cards, score. */
export function toCandidate(res: ModeResult, mode: ArrangeMode, t: ArtTemplate | null, ctx: SeatCtx, total: number): Candidate {
  const placements: Placement[] = [];
  const open: Cell[] = [];
  res.seating.forEach((c, i) => {
    if (c) placements.push({ cardId: c.id, cell: ctx.cells[i] });
    else open.push(ctx.cells[i]);
  });
  const artCells = total - ctx.cells.length;
  const score = MODE_PRIOR[mode] + res.fit * 3 + pairingScore(t, mode) * 0.5 + (artCells / Math.max(1, total)) * 1 - res.held.length * 0.5 - open.length * 0.25;
  return {
    id: `${t?.id ?? 'page'}:${mode}`,
    template: t,
    mode,
    name: `${t?.name ?? 'This page'} · ${MODE_LABEL[mode]}`,
    reason: res.note,
    placements,
    open,
    held: res.held,
    artCells,
    fit: res.fit,
    score,
    ask: res.ask,
  };
}

/**
 * Every (template, mode) pairing that fits, scored, then the sheet's list: the page as it is now
 * first, then four to six candidates ranked by score but DIVERSE: never two of the same mode in
 * the top three, and at least one that spends more pockets on art than the page does now.
 */
export function arrangeCandidates(input: ArrangeInput): Candidate[] {
  const total = input.rows * input.cols * (input.spread ? 2 : 1);
  const pairs = input.pairs ?? connectedPairs(input.cards);
  const reserved = input.reserved ?? new Set<string>();
  const geometries: { t: ArtTemplate | null; cells: Cell[] }[] = [{ t: null, cells: cardCells(input.rows, input.cols, input.spread, reserved) }];
  for (const t of input.templates ?? []) {
    if (t.rows !== input.rows || t.cols !== input.cols || t.spread !== input.spread) continue;
    const cells = cardCells(input.rows, input.cols, input.spread, templateCells(t, input.spread));
    if (!input.allowHeld && cells.length < input.cards.length) continue;
    geometries.push({ t, cells });
  }
  const all: Candidate[] = [];
  for (const g of geometries) {
    const ctx: Ctx = { cells: g.cells, cols: input.cols, rows: input.rows, spread: input.spread, pairs, tuning: input.tuning };
    if (!ctx.cells.length) continue;
    for (const m of MODES) {
      const res = m.seat(input.cards, ctx);
      if (!res) continue;
      all.push(toCandidate(res, m.mode, g.t, ctx, total));
    }
  }
  all.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
  // The same seating under two names (a template with no panels is the page as it is) shows once.
  const signature = (c: Candidate) => c.placements.map((p) => `${p.cardId}@${cellKey(p.cell)}`).sort().join('|');
  const seen = new Set<string>();
  const distinct = all.filter((c) => {
    const k = signature(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Diversity: never two of one mode in the top three, and no mode more than twice in the sheet.
  const picked: Candidate[] = [];
  const rest = [...distinct];
  while (picked.length < 6 && rest.length) {
    const count = (m: Candidate['mode']) => picked.filter((c) => c.mode === m).length;
    const topModes = picked.slice(0, 3).map((c) => c.mode);
    const idx = rest.findIndex((c) => count(c.mode) < 2 && (picked.length >= 3 || !topModes.includes(c.mode)));
    if (idx < 0) break;
    picked.push(rest.splice(idx, 1)[0]);
  }
  const currentArt = total - (total - reserved.size);
  if (!picked.some((c) => c.artCells > currentArt)) {
    const richer = rest.find((c) => c.artCells > currentArt);
    if (richer) {
      if (picked.length >= 6) picked.pop();
      picked.push(richer);
    }
  }
  const out = picked.slice(0, 6);
  // The page as it is now, always first.
  if (input.current) {
    const placements: Placement[] = [];
    for (const c of input.cards) {
      const cell = input.current.get(c.id);
      if (cell) placements.push({ cardId: c.id, cell });
    }
    const cells = cardCells(input.rows, input.cols, input.spread, reserved);
    const usedKeys = new Set(placements.map((p) => cellKey(p.cell)));
    out.unshift({
      id: 'current',
      template: null,
      mode: 'current',
      name: 'As it is now',
      reason: 'No change',
      placements,
      open: cells.filter((c) => !usedKeys.has(cellKey(c))),
      held: [],
      artCells: reserved.size,
      fit: 0,
      score: 0,
    });
  }
  return out;
}

/**
 * The moves that turn the page into `candidate`, as (cardId → cell), skipping cards already where
 * the candidate wants them. The store applies them in one commit.
 */
export function movesFor(candidate: Candidate, current: ReadonlyMap<string, Cell>): Placement[] {
  return candidate.placements.filter((p) => {
    const now = current.get(p.cardId);
    return !now || cellKey(now) !== cellKey(p.cell);
  });
}

/**
 * THE ARRANGER: one optimal seating for a page, tuned iteratively by the owner's eye.
 *
 * Owner, 2026-10-22: "What if we just had one optimal arranger, and we just worked iteratively on
 * tuning it? Kind of like an AI, arrange this page." So there is ONE score, made of terms a
 * collector reads a page by, and ONE weight set (`ARRANGER_WEIGHTS`) that the Arrange Lab moves
 * toward the owner's picks, champion against challenger. The old modes (data/arrange) survive as
 * the seatings the search starts from.
 *
 * The terms, each 0..1 where it applies and absent where it does not (a page with no evolution
 * line has no lines term, a full-art page no type term), so a weight never rewards a page for a
 * thing it cannot show:
 *
 *   palette     neighbours close in colour: a gradient the eye can follow
 *   similar     neighbours that look alike (Find Similar's art likeness: colour, geometry, style)
 *   rowSimilar  each row one family of lookalikes
 *   depth       rows by depth, pure, sky above ground above underground
 *   lines       an evolution line's stages adjacent and in order
 *   type        on a WINDOWED page, lines (rows or columns) of one frame colour
 *   art         pockets the template spends on art
 *   held, open  cards sent to the tray, pockets left empty (costs)
 *
 * Connected art is adjacent, hard, applied last as everywhere. Nothing is ever dropped.
 * PURE and deterministic, like data/arrange.
 */
import type { ArtTemplate } from './artTemplates.ts';
import {
  type ArrangeCard,
  type ArrangeInput,
  type Candidate,
  type Cell,
  type ConnectedPair,
  type Depth,
  type Placement,
  type SeatCtx,
  type Seating,
  belowOf,
  besideOf,
  cardCells,
  cellKey,
  connectedPairs,
  depthOf,
  fixConnected,
  improve,
  lineKey,
  paletteDist,
  readsWindowed,
  seatFlow,
  seatLines,
  seatStrata,
  templateCells,
  typeOf,
} from './arrange.ts';
import type { Similarity } from '../lib/similarity.ts';

export interface ArrangerWeights {
  palette: number;
  similar: number;
  rowSimilar: number;
  depth: number;
  lines: number;
  type: number;
  art: number;
  held: number;
  open: number;
}

/**
 * The champion. Starting values followed the two lab runs before the arranger; every change
 * since comes from a lab duel the owner decided (docs/ARRANGE.md, "Lab run 3" onward). Run 3
 * (2026-10-22): depth x2, type x2, lines x0.5, similar x0.5, held x0.5. Run 4 (2026-10-22): held
 * x2 and similar x2 back, rowSimilar x2, palette x0.5, open x2; thirteen nudges tied, which is
 * the champion settling. Two-round records swing; a weight that flips twice is left alone next time.
 * A card to the tray is cheap but not free: templates must seat half the cards (arrangePage).
 */
export const ARRANGER_WEIGHTS: ArrangerWeights = {
  palette: 0.5,
  similar: 1.5,
  rowSimilar: 1,
  depth: 4,
  lines: 1,
  type: 3,
  art: 1,
  held: 0.25,
  open: 0.6,
};

export interface Terms {
  palette: number;
  similar: number | null;
  rowSimilar: number | null;
  depth: number | null;
  lines: number | null;
  type: number | null;
  art: number;
  held: number;
  open: number;
}

const DEPTH_RANK: Record<Depth, number> = { above: 0, surface: 1, below: 2 };

/** Every term of one seating on one canvas. `total` is the page's pocket count (art included). */
export function scoreTerms(seating: Seating, ctx: SeatCtx, total: number, sim?: Similarity, cardsOnPage?: readonly ArrangeCard[]): Terms {
  const cells = ctx.cells;
  const seated = seating.filter((c): c is ArrangeCard => !!c);
  // Neighbour pairs, horizontal at full weight and vertical at half: the eye reads along a row.
  let pal = 0;
  let palW = 0;
  let simSum = 0;
  let simW = 0;
  let simPairs = 0;
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const a = seating[i];
      const b = seating[j];
      if (!a || !b) continue;
      const w = besideOf(cells[i], cells[j], ctx.cols) ? 1 : belowOf(cells[i], cells[j]) ? 0.5 : 0;
      if (!w) continue;
      pal += w * paletteDist(a, b);
      palW += w;
      if (sim?.size) {
        simSum += w * (sim.get(a.id)?.get(b.id) ?? 0);
        simW += w;
        simPairs += 1;
      }
    }
  }
  const palette = palW ? Math.max(0, Math.min(1, 1 - pal / palW / 40)) : 1;
  const similar = simPairs ? simSum / simW : null;

  // Rows as families: the mean pairwise likeness inside each row that holds two or more cards.
  let rowSimilar: number | null = null;
  if (sim?.size) {
    const rows = new Map<string, ArrangeCard[]>();
    cells.forEach((c, i) => {
      const card = seating[i];
      if (card) rows.set(`${c.leaf}:${c.row}`, [...(rows.get(`${c.leaf}:${c.row}`) ?? []), card]);
    });
    const means: number[] = [];
    for (const xs of rows.values()) {
      if (xs.length < 2) continue;
      let s = 0;
      let n = 0;
      for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) {
        s += sim.get(xs[i].id)?.get(xs[j].id) ?? 0;
        n += 1;
      }
      means.push(s / n);
    }
    rowSimilar = means.length ? means.reduce((a, b) => a + b, 0) / means.length : null;
  }

  // Depth: each row's dominant band, the share of depth cards sitting in a row of their band, and
  // the bands running sky, ground, underground from the top.
  let depth: number | null = null;
  {
    const withDepth = seated.filter((c) => depthOf(c).depth);
    const bands = new Set(withDepth.map((c) => depthOf(c).depth));
    if (withDepth.length >= 2 && bands.size >= 2) {
      const rowBands = new Map<number, Depth[]>();
      cells.forEach((c, i) => {
        const d = seating[i] ? depthOf(seating[i]!).depth : null;
        if (d) rowBands.set(c.row, [...(rowBands.get(c.row) ?? []), d]);
      });
      const dominant = new Map<number, Depth>();
      for (const [r, ds] of rowBands) {
        const count = new Map<Depth, number>();
        for (const d of ds) count.set(d, (count.get(d) ?? 0) + 1);
        dominant.set(r, [...count.entries()].sort((a, b) => b[1] - a[1] || DEPTH_RANK[a[0]] - DEPTH_RANK[b[0]])[0][0]);
      }
      let matching = 0;
      for (const [r, ds] of rowBands) for (const d of ds) if (d === dominant.get(r)) matching += 1;
      const purity = matching / withDepth.length;
      const order = [...dominant.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => DEPTH_RANK[d]);
      let inversions = 0;
      for (let i = 1; i < order.length; i += 1) if (order[i] < order[i - 1]) inversions += 1;
      const orderFactor = order.length > 1 ? 1 - inversions / (order.length - 1) : 1;
      depth = purity * (0.5 + 0.5 * orderFactor);
    }
  }

  // Lines: for each line with two or more stages seated, the share of consecutive stages that sit
  // next to each other in order (the next stage to the right, or directly below).
  let lines: number | null = null;
  {
    const byLine = new Map<string, { card: ArrangeCard; i: number }[]>();
    seating.forEach((c, i) => {
      if (!c) return;
      const k = lineKey(c);
      if (k) byLine.set(k, [...(byLine.get(k) ?? []), { card: c, i }]);
    });
    let pairs = 0;
    let adjacent = 0;
    for (const run of byLine.values()) {
      if (run.length < 2) continue;
      run.sort((a, b) => (a.card.evolutionStage ?? 0) - (b.card.evolutionStage ?? 0));
      for (let k = 1; k < run.length; k += 1) {
        pairs += 1;
        const a = cells[run[k - 1].i];
        const b = cells[run[k].i];
        const right = a.leaf === b.leaf && a.row === b.row && b.col === a.col + 1;
        const below = a.leaf === b.leaf && a.col === b.col && b.row === a.row + 1;
        if (right || below) adjacent += 1;
      }
    }
    lines = pairs ? adjacent / pairs : null;
  }

  // Type: on a windowed page, the share of rows (or columns, whichever is better) of one frame colour.
  let type: number | null = null;
  {
    const all = cardsOnPage ?? seated;
    if (all.length && readsWindowed(all) && new Set(seated.map(typeOf)).size >= 2) {
      const share = (byRow: boolean) => {
        const groups = new Map<string, string[]>();
        cells.forEach((c, i) => {
          const card = seating[i];
          if (!card) return;
          const k = byRow ? `${c.leaf}:${c.row}` : `${c.leaf}:${c.col}`;
          groups.set(k, [...(groups.get(k) ?? []), typeOf(card)]);
        });
        let counted = 0;
        let pure = 0;
        for (const ts of groups.values()) {
          if (ts.length < 2) continue;
          counted += 1;
          if (new Set(ts).size === 1) pure += 1;
        }
        return counted ? pure / counted : 1;
      };
      type = Math.max(share(true), share(false));
    }
  }

  const art = total ? (total - cells.length) / total : 0;
  const open = seating.filter((c) => !c).length;
  const held = Math.max(0, (cardsOnPage?.length ?? seated.length) - seated.length);
  return { palette, similar, rowSimilar, depth, lines, type, art, held, open };
}

/** The weighted sum over the terms that apply; costs subtracted. */
export function totalScore(t: Terms, w: ArrangerWeights): number {
  let s = t.palette * w.palette + t.art * w.art - t.held * w.held - t.open * w.open;
  if (t.similar !== null) s += t.similar * w.similar;
  if (t.rowSimilar !== null) s += t.rowSimilar * w.rowSimilar;
  if (t.depth !== null) s += t.depth * w.depth;
  if (t.lines !== null) s += t.lines * w.lines;
  if (t.type !== null) s += t.type * w.type;
  return s;
}

export interface Arrangement extends Candidate {
  terms: Terms;
}

export interface ArrangerAnswer {
  /** The one answer: the best seating over every layout the page's shape allows. */
  best: Arrangement;
  /** Up to two other seatings that differ, next best first ("another take"). */
  alternates: Arrangement[];
}

export interface ArrangerInput extends Omit<ArrangeInput, 'tuning' | 'allowHeld'> {
  similarity?: Similarity;
  weights?: Partial<ArrangerWeights>;
}

const signature = (seating: Seating, cells: readonly Cell[]): string =>
  seating.map((c, i) => (c ? `${c.id}@${cellKey(cells[i])}` : '')).filter(Boolean).sort().join('|');

/** Seatings to start the climb from: each mode's answer, the page as it is, and a plain fill. */
function seeds(cards: readonly ArrangeCard[], ctx: SeatCtx, current: ReadonlyMap<string, Cell> | undefined): { seating: Seating; held: ArrangeCard[] }[] {
  const out: { seating: Seating; held: ArrangeCard[] }[] = [];
  for (const res of [seatStrata(cards, ctx), seatLines(cards, ctx), seatFlow(cards, ctx)]) if (res) out.push({ seating: res.seating, held: [...res.held] });
  if (current) {
    const seating: Seating = ctx.cells.map((cell) => cards.find((c) => current.get(c.id) && cellKey(current.get(c.id)!) === cellKey(cell)) ?? null);
    const seated = new Set(seating.filter(Boolean).map((c) => c!.id));
    const held = cards.filter((c) => !seated.has(c.id));
    // The page as it is, with any card that has no pocket here (a template took it) held.
    for (let i = 0; i < seating.length && held.length; i += 1) if (!seating[i]) seating[i] = held.shift()!;
    out.push({ seating, held });
  }
  const fill: Seating = ctx.cells.map((_, i) => cards[i] ?? null);
  out.push({ seating: fill, held: cards.slice(ctx.cells.length) });
  return out;
}

/**
 * The best seating for one canvas: climb from every seed, then let a held card trade places
 * with a seated one when that reads better (so the tray gets the cards the page needs least).
 */
function bestOnCanvas(cards: readonly ArrangeCard[], ctx: SeatCtx, total: number, w: ArrangerWeights, sim: Similarity | undefined, current: ReadonlyMap<string, Cell> | undefined): { seating: Seating; held: ArrangeCard[]; terms: Terms; score: number } | null {
  let best: { seating: Seating; held: ArrangeCard[]; terms: Terms; score: number } | null = null;
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const seed of seeds(cards, ctx, current)) {
    const held = [...seed.held];
    const score = (s: Seating) => totalScore(scoreTerms(s, ctx, total, sim, cards), w);
    let seating = improve(seed.seating, score, () => true);
    // Trade a held card in for a seated one while that raises the score.
    if (held.length) {
      let moved = true;
      let guard = 0;
      while (moved && guard < 20) {
        moved = false;
        guard += 1;
        let cur = score(seating);
        for (let h = 0; h < held.length; h += 1) {
          for (let i = 0; i < seating.length; i += 1) {
            if (!seating[i]) continue;
            const trial = [...seating];
            const out = trial[i]!;
            trial[i] = held[h];
            const v = score(trial);
            if (v > cur + 1e-9) {
              seating = trial;
              held[h] = out;
              cur = v;
              moved = true;
            }
          }
        }
      }
    }
    const fixed = fixConnected(seating, ctx, held, byId);
    const terms = scoreTerms(fixed, ctx, total, sim, cards);
    const sc = totalScore(terms, w);
    if (!best || sc > best.score + 1e-9) best = { seating: fixed, held, terms, score: sc };
  }
  return best;
}

/** One line a collector can check against the picture, from the terms that carry the seating. */
export function describe(t: Terms, template: ArtTemplate | null, held: number): string {
  const bits: string[] = [];
  if (t.depth !== null && t.depth >= 0.75) bits.push('rows by depth');
  if (t.lines !== null && t.lines >= 0.75) bits.push('evolution lines in order');
  if (t.type !== null && t.type >= 0.6) bits.push('frame colours grouped');
  if (t.similar !== null && t.similar >= 0.5) bits.push('lookalikes side by side');
  else if (t.palette >= 0.6) bits.push('palette flowing');
  if (template) bits.push(`${template.name}${held ? `, ${held} to the tray` : ''}`);
  if (!bits.length) bits.push(held ? `${held} to the tray` : 'the cards as they read best');
  return bits.join('; ');
}

function toArrangement(id: string, name: string, r: { seating: Seating; held: ArrangeCard[]; terms: Terms; score: number }, t: ArtTemplate | null, ctx: SeatCtx, total: number): Arrangement {
  const placements: Placement[] = [];
  const open: Cell[] = [];
  r.seating.forEach((c, i) => {
    if (c) placements.push({ cardId: c.id, cell: ctx.cells[i] });
    else open.push(ctx.cells[i]);
  });
  return {
    id,
    template: t,
    mode: 'arranged',
    name,
    reason: describe(r.terms, t, r.held.length),
    placements,
    open,
    held: r.held,
    artCells: total - ctx.cells.length,
    fit: r.score,
    score: r.score,
    terms: r.terms,
  };
}

/**
 * Arrange the page: every layout its shape allows (the page as it is, then each template), the
 * best seating on each, the best of those as the answer and the next two that differ as takes.
 */
export function arrangePage(input: ArrangerInput): ArrangerAnswer | null {
  const w: ArrangerWeights = { ...ARRANGER_WEIGHTS, ...(input.weights ?? {}) };
  const total = input.rows * input.cols * (input.spread ? 2 : 1);
  const pairs: readonly ConnectedPair[] = input.pairs ?? connectedPairs(input.cards);
  const reserved = input.reserved ?? new Set<string>();
  const geometries: { t: ArtTemplate | null; cells: Cell[] }[] = [{ t: null, cells: cardCells(input.rows, input.cols, input.spread, reserved) }];
  for (const t of input.templates ?? []) {
    if (t.rows !== input.rows || t.cols !== input.cols || t.spread !== input.spread) continue;
    const cells = cardCells(input.rows, input.cols, input.spread, templateCells(t, input.spread));
    // A template must seat at least half the page's cards: a page is cards with art between them,
    // not art with a card or two left over.
    if (cells.length >= 2 && cells.length * 2 >= input.cards.length) geometries.push({ t, cells });
  }
  const results: Arrangement[] = [];
  const seen = new Set<string>();
  geometries.forEach((g, gi) => {
    const ctx: SeatCtx = { cells: g.cells, cols: input.cols, rows: input.rows, spread: input.spread, pairs };
    const r = bestOnCanvas(input.cards, ctx, total, w, input.similarity, input.current);
    if (!r) return;
    const sig = `${g.t?.id ?? 'page'}:${signature(r.seating, ctx.cells)}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    results.push(toArrangement(`arranged:${g.t?.id ?? 'page'}:${gi}`, '', r, g.t, ctx, total));
  });
  if (!results.length) return null;
  results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // Two takes are the same page when the cards sit in the same cells, template aside.
  const placed = (a: Arrangement) => a.placements.map((p) => `${p.cardId}@${cellKey(p.cell)}`).sort().join('|');
  const distinct: Arrangement[] = [];
  for (const r of results) if (!distinct.some((d) => placed(d) === placed(r))) distinct.push(r);
  const [best, ...rest] = distinct;
  best.id = 'arranged';
  best.name = 'Arranged';
  const alternates = rest.slice(0, 2).map((r, i) => ({ ...r, id: `alt-${i + 1}`, name: i === 0 ? 'Another take' : 'A third take' }));
  return { best, alternates };
}

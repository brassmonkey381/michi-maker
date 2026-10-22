/**
 * CURATED PAGES: a story binder built one identity at a time (owner, 2026-10-21).
 *
 * The owner built three theme binders with the arranger and said of the first attempt (a theme's
 * cards dealt onto pages, each page arranged): "the cards on a page did not belong together ...
 * half the page is clearly one theme, and then the others seem random." Of the second: "that was
 * better ... one of the best so far for binder building (could be a story binder type feature)."
 * This is the second attempt as a feature. The rule the owner gave: "a clear identity to each page,
 * decided first by loading 25-50% of the page's cards with intentionality, and then filled by
 * similarity, color, or theme (or multiple if it fits a single coherent page idea)".
 *
 * So, per theme of the story:
 *   1. POOL      the theme's scored cards (lib/themeScores), strongest first.
 *   2. IDENTITY  tight groups in the pool, each one page's reason: an evolution family, one
 *                illustrator, one palette family (a hue, the darks, the pales), or a clique whose
 *                art reads alike. Three to six SEED cards per identity, placed first.
 *   3. FILL      the rest of the page from the pool by the identity's own method (same family or
 *                same hand first, then likeness to the seeds' centre, or palette distance to the
 *                seeds), and ONLY while the candidate still holds the identity: a card that reads
 *                less like the seeds than the seeds do to each other is not placed. A page stops
 *                short rather than take a random card.
 *   4. TRIM      to a template size, so the page fits exactly: no hole, nothing to the tray.
 *   5. ARRANGE   the shipped arranger (data/arranger), exact-fit templates only.
 *   6. ORDER     pages by hue, so the binder flows.
 *
 * One art class per page (docs/ARRANGE.md scope): the seeds' majority class, and the fill keeps it.
 *
 * PURE apart from the providers: likeness comes from the data server (Find Similar's cosine, never
 * a vector) and is injected, so `node --test` runs this against synthetic numbers. Palette colours
 * come in on the cards (the sheet reads the on-device colour index).
 */
import { ART_TEMPLATES, templateArtSlots, type ArtRole, type ArtTemplate } from './artTemplates.ts';
import { type ArrangeCard, type PaletteColor, artClassOf, dominant, hue, paletteDist } from './arrange.ts';
import { arrangePage, type Arrangement } from './arranger.ts';
import type { DemoPage, DemoSlot } from './binderTypes.ts';
import type { ArtJob, PageShape } from './storyBinder.ts';
import type { ArtKind } from './storyThemes.ts';
import type { Similarity } from '../lib/similarity.ts';

/** A pool card: the arranger's view of it plus how strongly it is the theme. */
export interface PoolCard extends ArrangeCard {
  /** The theme score (lib/themeScores), higher is more the theme. */
  strength: number;
  /** A Trainer or other non-Pokémon card: only an illustrator page takes one. */
  trainer?: boolean;
}

export interface PagesProviders {
  /** Likeness of each of `poolIds` to the centre of `seedIds` (the server averages the vectors), 0..1. */
  likenessToCentre: (seedIds: readonly string[], poolIds: readonly string[]) => Promise<ReadonlyMap<string, number>>;
  /** Pairwise likeness among a few ids, for the arranger and for cliques. */
  pairwise: (ids: readonly string[]) => Promise<Similarity>;
  /** Depth words per card (lib/depth), for the arranger's strata; optional, fails soft to none. */
  depthWords?: (ids: readonly string[]) => Promise<ReadonlyMap<string, readonly string[]>>;
}

export type IdentityKind = 'lines' | 'artist' | 'palette' | 'alike';
export type FillMethod = 'lines' | 'artist' | 'palette' | 'similar';

export interface Identity {
  kind: IdentityKind;
  /** The page title: "The Eevee family", "By Mitsuhiro Arita", "Sea blues", "Alike: Lunala". */
  name: string;
  seeds: PoolCard[];
  fill: FillMethod;
  quality: number;
}

export interface PagesOptions {
  shape: PageShape;
  /** Pages to build from this pool, at most. */
  maxPages?: number;
  /**
   * The likeness floor for a fill card, 0..1 cosine. A fill card must also read at least as alike
   * to the seeds' centre as the seeds do to each other. 0.68 is where the owner's inspection
   * binders read as "one idea per page"; lower gives fuller pages at some cost in coherence.
   */
  fillFloor?: number;
  /** Fewest cards a page may have; below it the identity is skipped. */
  minPage?: number;
  /** Templates to seat with; defaults to the catalogue for the shape. */
  templates?: readonly ArtTemplate[];
  mkId?: () => string;
  /** Stock-art searches for the pages' panels, from the theme. */
  art?: { queries: string[]; kind: ArtKind; label: string };
  fromCollection?: boolean;
}

export interface PlannedPage {
  identity: Identity;
  cards: PoolCard[];
  /** Why the fill stopped: "full", "likeness stopped at 0.64 < 0.68", "pool ran out". */
  why: string;
  arrangement: Arrangement;
  page: DemoPage;
}

export interface PagesPlan {
  pages: PlannedPage[];
  /** Identities the pool offered but that did not make a page, with the reason. */
  skipped: { name: string; why: string }[];
  artJobs: ArtJob[];
}

const SIM_CLIQUE = 0.74;
const KIN_SLACK = 0.08;
const PAL_FILL_SLACK = 6;
const PAL_CEIL = 28;
const NAME_DECORATIONS = new Set(['ex', 'gx', 'v', 'vmax', 'vstar', 'v-union', 'break', 'prime', 'radiant', 'shining', 'dark', 'light', 'delta', 'star', 'lv.x', 'mega', 'm', 'x', 'y']);

/** The species a card is of (pageCompleter's rule): its line member named in it, else the name without decorations. */
export function speciesOf(card: Pick<ArrangeCard, 'name' | 'evolutionLine'>): string {
  const n = card.name.toLowerCase();
  if (card.evolutionLine?.length) {
    const hit = [...card.evolutionLine].sort((a, b) => b.length - a.length).find((s) => n.includes(s.toLowerCase()));
    if (hit) return hit.toLowerCase();
  }
  return n.split(/\s+/).filter((t) => !NAME_DECORATIONS.has(t) && !/['’]s$/.test(t)).join(' ').trim();
}

const simOf = (sim: Similarity, a: string, b: string): number => sim.get(a)?.get(b) ?? 0;
const meanPairSim = (sim: Similarity, ids: readonly string[]): number => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
    s += simOf(sim, ids[i], ids[j]);
    n += 1;
  }
  return n ? s / n : 0;
};
const meanPalDist = (card: ArrangeCard, to: readonly ArrangeCard[]): number => (to.length ? to.reduce((s, c) => s + paletteDist(card, c), 0) / to.length : 0);
const meanPairPal = (cards: readonly ArrangeCard[]): number => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < cards.length; i += 1) for (let j = i + 1; j < cards.length; j += 1) {
    s += paletteDist(cards[i], cards[j]);
    n += 1;
  }
  return n ? s / n : 0;
};
const lineKeyOf = (c: ArrangeCard): string => (c.evolutionLine?.length ? c.evolutionLine.join('>') : '');
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Hue family of a card's dominant colour: a 30-degree bin for a saturated card, else the darks, the pales, or none. */
export function hueFamily(card: ArrangeCard): string | null {
  if (!card.palette?.length) return null;
  const d: PaletteColor = dominant(card);
  const chroma = Math.hypot(d.a, d.b);
  if (chroma < 16) return d.L < 32 ? 'darks' : d.L > 72 ? 'pales' : null;
  const h = ((Math.atan2(d.b, d.a) * 180) / Math.PI + 360) % 360;
  return `hue${Math.floor(h / 30) * 30}`;
}

export const HUE_FAMILY_NAMES: Record<string, string> = {
  hue0: 'Pinks and reds',
  hue30: 'Reds and oranges',
  hue60: 'Oranges and golds',
  hue90: 'Golds and yellows',
  hue120: 'Yellow greens',
  hue150: 'Greens',
  hue180: 'Teals',
  hue210: 'Sea blues',
  hue240: 'Blues',
  hue270: 'Blues and violets',
  hue300: 'Violets',
  hue330: 'Magentas',
  darks: 'After dark',
  pales: 'Pale and soft',
};

/**
 * Every identity the pool offers, best first. `sim` holds the pairwise likeness among the pool's
 * strongest cards (as much of it as the caller fetched); cliques are read off it.
 */
export function findIdentities(pool: readonly PoolCard[], sim: Similarity): Identity[] {
  const out: Identity[] = [];
  const byId = new Map(pool.map((c) => [c.id, c]));
  const sumSim = (x: PoolCard, among: readonly PoolCard[]): number => among.reduce((s, o) => s + simOf(sim, x.id, o.id), 0);

  // Evolution families: a line with two or more species present; one print per species seeds first.
  const lines = new Map<string, PoolCard[]>();
  for (const c of pool) {
    const k = lineKeyOf(c);
    if (c.evolutionLine && c.evolutionLine.length >= 2 && !c.trainer) lines.set(k, [...(lines.get(k) ?? []), c]);
  }
  for (const [key, cards] of lines) {
    const bySpecies = new Map<string, PoolCard[]>();
    for (const c of cards) bySpecies.set(speciesOf(c), [...(bySpecies.get(speciesOf(c)) ?? []), c]);
    if (bySpecies.size < 2 || cards.length < 3) continue;
    const seeds: PoolCard[] = [];
    for (const prints of bySpecies.values()) seeds.push([...prints].sort((x, y) => sumSim(y, cards) - sumSim(x, cards) || y.strength - x.strength)[0]);
    const rest = cards.filter((c) => !seeds.includes(c)).sort((x, y) => y.strength - x.strength);
    while (seeds.length < 6 && rest.length) seeds.push(rest.shift()!);
    out.push({ kind: 'lines', name: `The ${cap(key.split('>')[0])} family`, seeds, fill: 'lines', quality: bySpecies.size * 2 + cards.length * 0.25 });
  }

  // One hand: an illustrator with four or more cards here.
  const hands = new Map<string, PoolCard[]>();
  for (const c of pool) if (c.illustrator) hands.set(c.illustrator, [...(hands.get(c.illustrator) ?? []), c]);
  for (const [who, cards] of hands) {
    if (cards.length < 4) continue;
    const ranked = [...cards].sort((x, y) => sumSim(y, cards) - sumSim(x, cards) || y.strength - x.strength);
    out.push({ kind: 'artist', name: `By ${who}`, seeds: ranked.slice(0, Math.min(6, Math.max(3, Math.floor(cards.length / 2)))), fill: 'artist', quality: Math.min(cards.length, 12) * 0.6 + 1 });
  }

  // One palette: a hue family with six or more cards; the seeds are its medoids.
  const families = new Map<string, PoolCard[]>();
  for (const c of pool) {
    const f = hueFamily(c);
    if (f && !c.trainer) families.set(f, [...(families.get(f) ?? []), c]);
  }
  for (const [f, cards] of families) {
    if (cards.length < 6) continue;
    const ranked = [...cards].sort((x, y) => meanPalDist(x, cards) - meanPalDist(y, cards));
    const seeds = ranked.slice(0, 4);
    out.push({ kind: 'palette', name: HUE_FAMILY_NAMES[f] ?? f, seeds, fill: 'palette', quality: 2 + Math.min(cards.length, 24) / 6 - meanPairPal(seeds) / 10 });
  }

  // A clique: cards whose art reads alike, grown greedily from the best-connected card.
  const taken = new Set<string>();
  const degree = (id: string): number => [...(sim.get(id)?.values() ?? [])].filter((v) => v >= SIM_CLIQUE).length;
  const ranked = pool.filter((c) => !c.trainer && degree(c.id) >= 2).sort((x, y) => degree(y.id) - degree(x.id));
  for (const c of ranked) {
    if (taken.has(c.id)) continue;
    const clique = [c.id];
    const cand = [...(sim.get(c.id)?.entries() ?? [])]
      .filter(([id, v]) => v >= SIM_CLIQUE && !taken.has(id) && byId.has(id))
      .sort((x, y) => y[1] - x[1])
      .map(([id]) => id);
    for (const id of cand) {
      if (clique.length >= 6) break;
      if (clique.every((m) => simOf(sim, m, id) >= SIM_CLIQUE - 0.04)) clique.push(id);
    }
    if (clique.length < 3) continue;
    clique.forEach((id) => taken.add(id));
    const seeds = clique.map((id) => byId.get(id)!);
    out.push({ kind: 'alike', name: `Alike: ${seeds[0].name.replace(/\s*\(.*$/, '')}`, seeds, fill: 'similar', quality: 3 + clique.length * 0.5 + (meanPairSim(sim, clique) - SIM_CLIQUE) * 20 });
  }
  return out.sort((x, y) => y.quality - x.quality);
}

/** The page's other pockets, each card only while it still holds the identity. */
export async function fillIdentity(
  ident: Identity,
  pool: readonly PoolCard[],
  used: ReadonlySet<string>,
  sim: Similarity,
  size: number,
  fillFloor: number,
  providers: Pick<PagesProviders, 'likenessToCentre'>,
): Promise<{ cards: PoolCard[]; why: string }> {
  const seeds = ident.seeds.filter((c) => !used.has(c.id));
  const page: PoolCard[] = [...seeds];
  const species = new Set(page.map(speciesOf));
  // One art class per page: the seeds' majority, kept by the fill.
  const isFull = (c: ArrangeCard) => artClassOf(c.fullArtKind, c.fullArt) === 'full';
  const full = seeds.filter(isFull).length * 2 >= seeds.length;
  const ok = (c: PoolCard): boolean => {
    if (used.has(c.id) || page.includes(c) || isFull(c) !== full) return false;
    if (c.trainer) return ident.kind === 'artist';
    return !species.has(speciesOf(c));
  };
  const add = (c: PoolCard) => {
    page.push(c);
    species.add(speciesOf(c));
  };
  const seedIds = seeds.map((c) => c.id);
  const centre = await providers.likenessToCentre(seedIds, pool.map((c) => c.id));
  // A fill card must read at least as alike to the seeds' centre as the seeds do to each other.
  const simFloor = Math.max(fillFloor, meanPairSim(sim, seedIds));
  const palCeil = Math.min(PAL_CEIL, meanPairPal(seeds) + PAL_FILL_SLACK);
  let why = '';

  // First the identity's own kin (same line, same hand), still gated by likeness.
  if (ident.fill === 'lines' || ident.fill === 'artist') {
    const kin = pool
      .filter((c) => ok(c) && (ident.fill === 'lines' ? lineKeyOf(c) === lineKeyOf(seeds[0]) : c.illustrator === seeds[0].illustrator))
      .sort((x, y) => (centre.get(y.id) ?? 0) - (centre.get(x.id) ?? 0));
    for (const c of kin) {
      if (page.length >= size) break;
      if ((centre.get(c.id) ?? 0) >= simFloor - KIN_SLACK) add(c);
    }
  }
  if (ident.fill === 'palette') {
    const cand = pool.filter(ok).map((c) => ({ c, d: meanPalDist(c, seeds) })).sort((x, y) => x.d - y.d);
    for (const { c, d } of cand) {
      if (page.length >= size) break;
      if (d > palCeil) {
        why = `palette stopped at ${d.toFixed(0)} > ${palCeil.toFixed(0)}`;
        break;
      }
      add(c);
    }
  } else {
    const cand = pool.filter(ok).map((c) => ({ c, s: centre.get(c.id) ?? 0, d: meanPalDist(c, seeds) })).sort((x, y) => y.s - x.s);
    for (const { c, s, d } of cand) {
      if (page.length >= size) break;
      if (s < simFloor) {
        why = `likeness stopped at ${s.toFixed(2)} < ${simFloor.toFixed(2)}`;
        break;
      }
      // Like the seeds, but a palette far from everything else on the page is still a sore thumb.
      if (d > PAL_CEIL + 10) continue;
      add(c);
    }
  }
  return { cards: page, why: why || (page.length >= size ? 'full' : 'pool ran out') };
}

const ROUND_ROBIN: IdentityKind[] = ['alike', 'lines', 'palette', 'artist'];

/** Mean hue of a page's cards, 0..360, for the binder's order. */
function meanHue(cards: readonly ArrangeCard[]): number {
  let x = 0;
  let y = 0;
  for (const c of cards) {
    const h = (hue(c) * Math.PI) / 180;
    x += Math.cos(h);
    y += Math.sin(h);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

let n = 0;
const defaultId = (): string => `sp-${(n += 1)}`;

/**
 * Plan the pages one pool gives: identities round-robin over kinds (so a binder is not six
 * palettes), each seeded, filled while coherent, trimmed to a template size and arranged.
 */
export async function planPages(pool: readonly PoolCard[], providers: PagesProviders, opts: PagesOptions): Promise<PagesPlan> {
  const { rows, cols } = opts.shape;
  const size = rows * cols;
  const maxPages = opts.maxPages ?? 4;
  const fillFloor = opts.fillFloor ?? 0.68;
  const minPage = opts.minPage ?? 6;
  const mkId = opts.mkId ?? defaultId;
  const templates = (opts.templates ?? ART_TEMPLATES).filter((t) => t.rows === rows && t.cols === cols && !t.spread);
  const sizes = [...new Set([...templates.map((t) => t.cardPockets), size])].filter((k) => k >= minPage).sort((a, b) => a - b);
  const skipped: { name: string; why: string }[] = [];
  if (!pool.length || !sizes.length) return { pages: [], skipped, artJobs: [] };

  // Likeness among the pool's strongest cards, for cliques and seed ranking.
  const strongest = [...pool].sort((a, b) => b.strength - a.strength).slice(0, 40).map((c) => c.id);
  const sim = await providers.pairwise(strongest);
  const idents = findIdentities(pool, sim);
  const queues = new Map<IdentityKind, Identity[]>();
  for (const i of idents) queues.set(i.kind, [...(queues.get(i.kind) ?? []), i]);

  const used = new Set<string>();
  const built: { identity: Identity; cards: PoolCard[]; why: string }[] = [];
  let idle = 0;
  while (built.length < maxPages && idle < ROUND_ROBIN.length) {
    const kind = ROUND_ROBIN[(built.length + idle) % ROUND_ROBIN.length];
    const queue = queues.get(kind) ?? [];
    let ident: Identity | null = null;
    while (queue.length) {
      const cand = queue.shift()!;
      if (cand.seeds.filter((c) => !used.has(c.id)).length >= 3) {
        ident = cand;
        break;
      }
    }
    if (!ident) {
      idle += 1;
      continue;
    }
    const filled = await fillIdentity(ident, pool, used, sim, size, fillFloor, providers);
    // Trim to a template size (the last cards added were the weakest fits), so Arrange has a page
    // that fits exactly: no hole, nothing to the tray.
    const fit = sizes.filter((k) => k <= filled.cards.length).pop();
    if (!fit) {
      skipped.push({ name: ident.name, why: `${filled.cards.length} cards (${filled.why})` });
      continue;
    }
    idle = 0;
    let why = filled.why;
    if (fit < filled.cards.length) {
      why += `; trimmed ${filled.cards.length} to ${fit}`;
      filled.cards = filled.cards.slice(0, fit);
    }
    filled.cards.forEach((c) => used.add(c.id));
    built.push({ identity: ident, cards: filled.cards, why });
  }
  built.sort((x, y) => meanHue(x.cards) - meanHue(y.cards));

  const pages: PlannedPage[] = [];
  const artJobs: ArtJob[] = [];
  for (const b of built) {
    const ids = b.cards.map((c) => c.id);
    const [pageSim, depth] = await Promise.all([providers.pairwise(ids), providers.depthWords ? providers.depthWords(ids) : Promise.resolve(null)]);
    const cards = depth ? b.cards.map((c) => ({ ...c, depthWords: depth.get(c.id) ?? c.depthWords })) : b.cards;
    const fitting = templates.filter((t) => t.cardPockets === b.cards.length);
    const answer = arrangePage({ rows, cols, spread: false, cards, templates: fitting, similarity: pageSim });
    if (!answer) continue;
    const a = answer.best;
    const slots: DemoSlot[] = a.placements.map((p) => ({
      id: mkId(),
      row: p.cell.row,
      col: p.cell.col,
      rowSpan: 1,
      colSpan: 1,
      type: 'card' as const,
      cardId: p.cardId,
      ...(opts.fromCollection ? { fromCollection: true } : {}),
    }));
    const artSlots = a.template ? templateArtSlots(a.template, mkId) : [];
    const pageIndex = pages.length;
    if (opts.art) {
      for (const s of artSlots) {
        artJobs.push({
          pageIndex,
          slotId: s.id,
          row: s.row,
          col: s.col,
          rowSpan: s.rowSpan,
          colSpan: s.colSpan,
          role: (s.artRole as ArtRole | undefined) ?? 'accent',
          queries: opts.art.queries,
          kind: opts.art.kind,
          label: `${b.identity.name} · ${s.artRole ?? 'art'}`,
        });
      }
    }
    const page: DemoPage = {
      id: mkId(),
      title: b.identity.name,
      // What the page IS, never how it was chosen (docs/STORY-BINDERS.md: descriptions say what a
      // binder is, not how it was made).
      description: describeIdentity(b.identity, b.cards.length),
      rows,
      cols,
      slots: [...slots, ...artSlots],
    };
    pages.push({ identity: b.identity, cards: b.cards, why: b.why, arrangement: a, page });
  }
  return { pages, skipped, artJobs };
}

function describeIdentity(ident: Identity, count: number): string {
  const n = `${count} cards`;
  if (ident.kind === 'lines') return `${ident.name.replace(/^The /, 'The ')}, ${n} that belong together.`;
  if (ident.kind === 'artist') return `${n} from one hand.`;
  if (ident.kind === 'palette') return `${n} in one palette.`;
  return `${n} whose pictures read alike.`;
}

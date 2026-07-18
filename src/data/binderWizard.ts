/**
 * Build-a-binder wizard — turns the FREE copies in the user's collection (owned minus
 * collection-placed) into a draft binder of michi-method pages.
 *
 * Clustering: every card is considered for an evolution-line page, a single-species page, an
 * artist page, a same-set page, and a colour(type) page. Clusters are ranked (story-ish kinds
 * first, then size) and cards are assigned greedily so no card appears twice. Whatever no
 * strong cluster claims is swept into colour-blocked bulk pages. The result is a plain page
 * list the store persists atomically via `createBinder({ pages })`; every pocket carries
 * `fromCollection` provenance so the (free/owned) accounting and Reclaim see it.
 */
import type { Catalog, CatalogCard } from '@/lib/catalog';
import { artGapSlots, uuidv4, type DemoPage, type DemoSlot } from '@/data/binderTypes';
import { speciesOf } from '@/data/pageComposer';
import { formatUsd, type PriceSummary } from '@/lib/prices';

export interface WizardProposal {
  key: string;
  kind: 'chase' | 'evolution' | 'species' | 'artist' | 'set' | 'type';
  /** Page title (also the picker row's headline). */
  title: string;
  /** One-line description for the picker row. */
  blurb: string;
  /** Placement order, capped at one 3×3 page. */
  cardIds: string[];
}

const PAGE_ROWS = 3;
const PAGE_COLS = 3;
const PAGE_CELLS = PAGE_ROWS * PAGE_COLS;
/** Minimum cluster size per kind — below this a "page" reads as an accident, not a theme. */
const MIN_SIZE: Record<WizardProposal['kind'], number> = {
  chase: 3,
  evolution: 4,
  species: 4,
  artist: 5,
  set: 6,
  type: 6,
};
/** Story-ish kinds outrank generic groupings when clusters compete for the same cards. */
const KIND_PRIORITY: Record<WizardProposal['kind'], number> = {
  chase: 6,
  evolution: 5,
  species: 4,
  artist: 3,
  set: 2,
  type: 1,
};
const MAX_THEME_PAGES = 12;
/** A card this valuable is a "hit" — the chase board claims hits before any theme cluster. */
const CHASE_MIN_VALUE = 10;

const cap = (s: string) => s.replace(/(^|\s)\w/g, (m) => m.toUpperCase());

const byRelease = (a: CatalogCard, b: CatalogCard) =>
  (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999');

interface Cluster {
  kind: WizardProposal['kind'];
  key: string;
  title: string;
  blurb: string;
  cards: CatalogCard[];
  order: (cards: CatalogCard[]) => CatalogCard[];
}

/**
 * Propose theme pages + a bulk sweep from the free inventory. `freeIds` are card ids with at
 * least one unplaced copy (one page pocket per distinct print, extra copies stay available).
 * `prices` (the shared price summary) unlocks the CHASE BOARD: the most valuable hits claim
 * page one before any theme cluster can bury them in bulk.
 */
export function proposePages(
  freeIds: string[],
  catalog: Catalog,
  prices?: PriceSummary | null,
): { proposals: WizardProposal[]; bulk: WizardProposal[] } {
  const cards = freeIds
    .map((id) => catalog.getCard(id))
    .filter((c): c is CatalogCard => !!c && c.kind === 'standard');

  // Chase board first: every hit above the value floor, most valuable in the CENTRE pocket
  // (the anchor-page crown), the rest ringed around it by value. Claimed cards are off the
  // table for the theme clusters below — a $200 pull must never end up in "bulk".
  const used = new Set<string>();
  const chaseProposals: WizardProposal[] = [];
  if (prices) {
    const hits = cards
      .map((c) => ({ c, v: prices[c.id]?.cur ?? 0 }))
      .filter((x) => x.v >= CHASE_MIN_VALUE)
      .sort((a, b) => b.v - a.v);
    if (hits.length >= MIN_SIZE.chase) {
      const top = hits.slice(0, PAGE_CELLS);
      const ids = top.map((x) => x.c.id);
      // Row-major cells; index 4 is the centre of a 3×3 — give it the crown when it exists.
      const ordered =
        ids.length >= 5 ? [...ids.slice(1, 5), ids[0], ...ids.slice(5)] : ids;
      for (const id of ids) used.add(id);
      const total = top.reduce((n, x) => n + x.v, 0);
      chaseProposals.push({
        key: 'chase',
        kind: 'chase',
        title: 'Chase board',
        blurb: `Your ${ids.length} most valuable cards · ${formatUsd(total)} · crown in the centre.`,
        cardIds: ordered,
      });
    }
  }

  const clusters = new Map<string, Cluster>();
  const put = (c: CatalogCard, cluster: Omit<Cluster, 'cards'>) => {
    const existing = clusters.get(cluster.key);
    if (existing) existing.cards.push(c);
    else clusters.set(cluster.key, { ...cluster, cards: [c] });
  };

  for (const c of cards) {
    if (c.evolutionLine.length > 1) {
      put(c, {
        kind: 'evolution',
        key: `evo|${c.evolutionLine.join('>')}`,
        title: `${cap(c.evolutionLine[0])} line`,
        blurb: `The ${cap(c.evolutionLine[0])} evolution family, Basic → final stage.`,
        order: (cs) => [...cs].sort((a, b) => a.evolutionStage - b.evolutionStage || byRelease(a, b)),
      });
    }
    const species = speciesOf(c);
    if (species) {
      put(c, {
        kind: 'species',
        key: `sp|${species}`,
        title: cap(species),
        blurb: `${cap(species)} across sets and art styles.`,
        order: (cs) => [...cs].sort(byRelease),
      });
    }
    if (c.illustrator.trim()) {
      put(c, {
        kind: 'artist',
        key: `art|${c.illustrator.trim().toLowerCase()}`,
        title: `Art by ${c.illustrator.trim()}`,
        blurb: `A gallery page for illustrator ${c.illustrator.trim()}.`,
        order: (cs) => [...cs].sort(byRelease),
      });
    }
    if (c.setName) {
      put(c, {
        kind: 'set',
        key: `set|${c.setId}`,
        title: c.setName,
        blurb: `Your ${c.setName} pulls on one page.`,
        order: (cs) => [...cs].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
      });
    }
    if (c.types[0]) {
      put(c, {
        kind: 'type',
        key: `type|${c.types[0]}`,
        title: `${c.types[0]} colors`,
        blurb: `A ${c.types[0].toLowerCase()}-toned colour page.`,
        order: (cs) => [...cs].sort(byRelease),
      });
    }
  }

  // Greedy assignment: strongest clusters claim their cards first; a card never repeats.
  const ranked = [...clusters.values()].sort(
    (a, b) =>
      KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] ||
      b.cards.length - a.cards.length ||
      a.key.localeCompare(b.key),
  );
  const proposals: WizardProposal[] = [...chaseProposals];
  for (const cluster of ranked) {
    if (proposals.length >= MAX_THEME_PAGES) break;
    const available = cluster.cards.filter((c) => !used.has(c.id));
    if (available.length < MIN_SIZE[cluster.kind]) continue;
    const chosen = cluster.order(available).slice(0, PAGE_CELLS);
    for (const c of chosen) used.add(c.id);
    proposals.push({
      key: cluster.key,
      kind: cluster.kind,
      title: cluster.title,
      blurb: cluster.blurb,
      cardIds: chosen.map((c) => c.id),
    });
  }

  // Bulk sweep: everything unclaimed, colour-blocked by energy type, 9 to a page.
  const leftovers = cards.filter((c) => !used.has(c.id));
  const byType = new Map<string, CatalogCard[]>();
  for (const c of leftovers) {
    const t = c.types[0] ?? 'Colorless';
    const list = byType.get(t) ?? [];
    list.push(c);
    byType.set(t, list);
  }
  const bulk: WizardProposal[] = [];
  for (const [type, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const ordered = [...list].sort(byRelease);
    for (let i = 0; i < ordered.length; i += PAGE_CELLS) {
      const chunk = ordered.slice(i, i + PAGE_CELLS);
      bulk.push({
        key: `bulk|${type}|${i}`,
        kind: 'type',
        title: `${type} bulk`,
        blurb: `Colour-blocked ${type.toLowerCase()} sweep.`,
        cardIds: chunk.map((c) => c.id),
      });
    }
  }

  return { proposals, bulk };
}

/** Default page ceiling for a wizard build — matches the free tier's per-binder page cap
 *  (see TIER_LIMITS.free.pagesPerBinder). A build shouldn't dump dozens of pages on a new user;
 *  they can always add more by hand. */
export const WIZARD_MAX_PAGES = 16;

/**
 * Trim a chosen page set down to `max` pages. Drop order matches the owner's intent for a
 * free-tier build: **grass bulk pages first**, then the rest of the colour-blocked bulk, then
 * evolution pages — the chase board and the single-species / set / artist gallery pages are the
 * keepers. Original page order is preserved in the result.
 */
export function capProposals(chosen: WizardProposal[], max = WIZARD_MAX_PAGES): WizardProposal[] {
  if (chosen.length <= max) return chosen;
  const isBulk = (p: WizardProposal) => p.key.startsWith('bulk|');
  const isGrassBulk = (p: WizardProposal) => /^bulk\|grass\b/i.test(p.key);
  // Lower rank = kept first. Highest ranks are dropped when we slice to `max`.
  const keepRank = (p: WizardProposal): number => {
    if (p.kind === 'chase') return 0;
    if (p.kind === 'species' || p.kind === 'set' || p.kind === 'artist') return 1;
    if (p.kind === 'type' && !isBulk(p)) return 2;
    if (p.kind === 'evolution') return 3;
    if (isBulk(p)) return isGrassBulk(p) ? 6 : 5;
    return 4;
  };
  return chosen
    .map((p, i) => ({ p, i }))
    .sort((a, b) => keepRank(a.p) - keepRank(b.p) || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.p);
}

// Reading orders for a 3×3 page. Row-major for most pages; column-major for evolution pages so
// the stages read top→bottom down each column.
const ROW_MAJOR: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2],
];
const COL_MAJOR: [number, number][] = [
  [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2],
];

/**
 * Turn chosen proposals into persistable pages. Cards keep their collection provenance and fill
 * the page in reading order (evolution pages read down the columns); EVERY remaining open pocket
 * becomes an empty 'artwork' slot the grid paints as "Your Art Here" (see artGapSlots) — so the
 * built binder is everywhere ready for the owner to drop in their own art.
 */
export function buildPages(chosen: WizardProposal[]): DemoPage[] {
  return chosen.map((p) => {
    const order = p.kind === 'evolution' ? COL_MAJOR : ROW_MAJOR;
    const cardSlots: DemoSlot[] = p.cardIds.slice(0, PAGE_CELLS).map((cardId, i) => ({
      id: uuidv4(),
      row: order[i][0],
      col: order[i][1],
      rowSpan: 1,
      colSpan: 1,
      type: 'card' as const,
      cardId,
      fromCollection: true,
    }));
    const occupied = new Set(cardSlots.map((s) => `${s.row},${s.col}`));
    const artSlots = artGapSlots(PAGE_ROWS, PAGE_COLS, occupied);
    return { id: uuidv4(), title: p.title, rows: PAGE_ROWS, cols: PAGE_COLS, slots: [...cardSlots, ...artSlots] };
  });
}

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
import { uuidv4, type DemoPage, type DemoSlot } from '@/data/binderTypes';
import { speciesOf } from '@/data/pageComposer';

export interface WizardProposal {
  key: string;
  kind: 'evolution' | 'species' | 'artist' | 'set' | 'type';
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
  evolution: 4,
  species: 4,
  artist: 5,
  set: 6,
  type: 6,
};
/** Story-ish kinds outrank generic groupings when clusters compete for the same cards. */
const KIND_PRIORITY: Record<WizardProposal['kind'], number> = {
  evolution: 5,
  species: 4,
  artist: 3,
  set: 2,
  type: 1,
};
const MAX_THEME_PAGES = 12;

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
 */
export function proposePages(
  freeIds: string[],
  catalog: Catalog,
): { proposals: WizardProposal[]; bulk: WizardProposal[] } {
  const cards = freeIds
    .map((id) => catalog.getCard(id))
    .filter((c): c is CatalogCard => !!c && c.kind === 'standard');

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
  const used = new Set<string>();
  const proposals: WizardProposal[] = [];
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

/** Turn chosen proposals into persistable pages — every pocket collection-sourced. */
export function buildPages(chosen: WizardProposal[]): DemoPage[] {
  return chosen.map((p) => {
    const colMajor = p.kind === 'evolution'; // stages read left → right down the columns
    const slots: DemoSlot[] = p.cardIds.slice(0, PAGE_CELLS).map((cardId, i) => ({
      id: uuidv4(),
      row: colMajor ? i % PAGE_ROWS : Math.floor(i / PAGE_COLS),
      col: colMajor ? Math.floor(i / PAGE_ROWS) : i % PAGE_COLS,
      rowSpan: 1,
      colSpan: 1,
      type: 'card' as const,
      cardId,
      fromCollection: true,
    }));
    return { id: uuidv4(), title: p.title, rows: PAGE_ROWS, cols: PAGE_COLS, slots };
  });
}

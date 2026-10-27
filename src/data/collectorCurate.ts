/**
 * CURATED COLLECTOR PAGES (owner, 2026-10-26): "organize a complete binder we generate using any of
 * these, with each page intentionally curated ... like creating a story binder from my collection,
 * but my collection is instead just this subset of cards we've selected."
 *
 * The Story Binder page planner (data/storyPages → planPages) already does the curating: it finds
 * identities in a pool (an evolution family, one illustrator, one palette, a clique that reads
 * alike), seeds a page with three to six of them, fills while the page stays one idea, and
 * arranges into the michi layouts. This module only turns a collector result into that planner's
 * pool and takes the leftovers back:
 *
 *   POOL       one entry per card (a master set's reverse pocket is the same picture, so it is not a
 *              second candidate), with STRENGTH from the rarity ladder plus a full-art bonus, so the
 *              planner seeds pages with the nicest prints. The evolution family comes from the card
 *              when the catalogue carries it, else from "evolves from" across the whole catalogue
 *              (the gated catalogue ships no lines; collectorBinders → evolutionFamilies).
 *   LEFTOVERS  the pockets no curated page took, in the result's own order, for the plain or michi
 *              pages that follow. A collector binder drops nothing: a set stays complete.
 *
 * Pure. The planner's likeness and palette providers are the page's business (app/collect.tsx).
 */
import type { PaletteColor } from './arrange.ts';
import type { DemoPage } from './binderTypes.ts';
import { type CollectorCard, type CollectorKind, type CollectorPocket, type CollectorResult, type CollectorSort, dexNumber, isFullArt, isPokemonCard, RARITY_RANK, rarityRank, speciesOf } from './collectorBinders.ts';
import type { PoolCard } from './storyPages.ts';

/** How strongly a card deserves to seed a page: its rung on the rarity ladder, 0..1, plus 0.25 for full art. */
export function collectorStrength(card: CollectorCard): number {
  return rarityRank(card.rarity) / (RARITY_RANK.length - 1) + (isFullArt(card) ? 0.25 : 0);
}

export interface PoolSources {
  /** The ordered family (lowercase species, root first) a card belongs to; [] or undefined for a line of one. */
  familyOf?: (card: CollectorCard) => readonly string[] | undefined;
  /** The card's art palette from the colour index, when known. */
  paletteOf?: (cardId: string) => readonly PaletteColor[] | undefined;
}

/** The planner's pool for a collector result: one candidate per card, strongest prints marked. */
export function collectorPool(result: CollectorResult, cardOf: (id: string) => CollectorCard | undefined, sources: PoolSources = {}): PoolCard[] {
  const seen = new Set<string>();
  const pool: PoolCard[] = [];
  for (const p of result.pockets) {
    if (seen.has(p.cardId)) continue;
    const c = cardOf(p.cardId);
    if (!c) continue;
    seen.add(p.cardId);
    const line = c.evolutionLine.length >= 2 ? c.evolutionLine.map((s) => s.toLowerCase()) : sources.familyOf?.(c);
    pool.push({
      id: c.id,
      name: c.name,
      evolutionLine: line && line.length >= 2 ? line : undefined,
      illustrator: c.illustrator || undefined,
      setId: c.setId,
      number: c.number,
      fullArtKind: c.fullArtKind || undefined,
      fullArt: c.fullArt,
      rarity: c.rarity,
      types: c.types,
      palette: sources.paletteOf?.(c.id),
      strength: collectorStrength(c),
      trainer: !isPokemonCard(c),
    });
  }
  return pool;
}

/**
 * The pockets a curated plan did not seat, in the result's order. Each placed card takes one plain
 * pocket (no finish) with it; a reverse holo of a placed card, a cameo and every unplaced card stay.
 */
export function leftoverPockets(result: CollectorResult, placedIds: ReadonlySet<string>): CollectorPocket[] {
  const taken = new Set<string>();
  const out: CollectorPocket[] = [];
  for (const p of result.pockets) {
    if (!p.finish && placedIds.has(p.cardId) && !taken.has(p.cardId)) {
      taken.add(p.cardId);
      continue;
    }
    out.push(p);
  }
  return out;
}

/** How the pages after the curated ones are ordered: the shape, its sort, and the binder's title as the subject. */
export interface TailOrder {
  kind: CollectorKind;
  sort: CollectorSort;
  /** The binder title: "Every Eevee", "Prismatic Evolutions: complete set". */
  subject: string;
}

/**
 * TITLES FOR THE PAGES IN ORDER (owner, 2026-10-26: the pages after the curated ones "dont have
 * their titles set or mention why the page of cards was chosen this way"). A page that holds the
 * result in its own order is named by the span it covers under that order (set numbers 010 to
 * 018, dex numbers, years, rarities, illustrators, names), and its description says what the
 * page is: the subject in that order. Pages that already carry a title (the curated ones) are left
 * alone. A page with no known card is left alone too.
 */
export function titleTailPages(pages: readonly DemoPage[], cardOf: (id: string) => CollectorCard | undefined, order: TailOrder): DemoPage[] {
  return pages.map((p) => {
    if (p.title) return p;
    const cards = p.slots
      .filter((s) => s.type === 'card' && s.cardId)
      .map((s) => cardOf(s.cardId!))
      .filter((c): c is CollectorCard => !!c);
    if (!cards.length) return p;
    return { ...p, ...tailTitle(cards, order) };
  });
}

/** The title and description for one in-order page from the cards on it, in the page's order. */
export function tailTitle(cards: readonly CollectorCard[], order: TailOrder): { title: string; description: string } {
  const first = cards[0];
  const last = cards[cards.length - 1];
  const span = (a: string, b: string) => (a === b ? a : `${a} to ${b}`);
  const who = order.subject.trim() || 'The cards';
  const desc = order.sort.dir === 'desc';
  switch (order.sort.key) {
    case 'number': {
      const num = (c: CollectorCard) => c.number.split('/')[0].trim() || '?';
      const a = num(first);
      const b = num(last);
      return { title: a === b ? `No. ${a}` : `Nos. ${a} to ${b}`, description: `${who} in number order${desc ? ', last first' : ''}.` };
    }
    case 'dex': {
      const dex = (c: CollectorCard) => {
        const n = dexNumber(speciesOf(c.name));
        return n ? `#${String(n).padStart(3, '0')}` : '#?';
      };
      return { title: span(dex(first), dex(last)), description: `${who} in Pokédex order${desc ? ', last first' : ''}.` };
    }
    case 'release': {
      const year = (c: CollectorCard) => (c.releaseDate || '').slice(0, 4) || 'undated';
      return { title: span(year(first), year(last)), description: `${who} by release, ${desc ? 'newest' : 'oldest'} first.` };
    }
    case 'rarity':
      return { title: span(first.rarity || 'Rare', last.rarity || 'Rare'), description: `${who} by rarity, ${desc ? 'rarest' : 'plainest'} first.` };
    case 'value':
      return { title: 'By value', description: `${who} by market value, ${desc ? 'priciest' : 'cheapest'} first.` };
    case 'artist':
      return { title: span(first.illustrator || 'Unknown', last.illustrator || 'Unknown'), description: `${who} by illustrator, ${desc ? 'Z to A' : 'A to Z'}.` };
    default:
      return { title: span(first.name, last.name), description: `${who} by card name, ${desc ? 'Z to A' : 'A to Z'}.` };
  }
}

/** Most curated pages to plan for a pool: one per five cards, forty at the outside (each page is server likeness calls). */
export function curateMaxPages(poolSize: number): number {
  return Math.max(1, Math.min(40, Math.ceil(poolSize / 5)));
}

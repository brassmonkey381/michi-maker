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
import { type CollectorCard, type CollectorPocket, type CollectorResult, isFullArt, isPokemonCard, RARITY_RANK, rarityRank } from './collectorBinders.ts';
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

/** Most curated pages to plan for a pool: one per five cards, forty at the outside (each page is server likeness calls). */
export function curateMaxPages(poolSize: number): number {
  return Math.max(1, Math.min(40, Math.ceil(poolSize / 5)));
}

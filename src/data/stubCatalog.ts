/**
 * A CATALOG MADE OF A FEW HUNDRED CARDS (docs/GUEST-FILL-PLAN.md, 2026-10-30).
 *
 * The page composer and the page completer read a Catalog through two calls, `getCard` and
 * `listAll`, and never ask for sets or series. A guest never receives the 25 MB catalogue, but the
 * data server lets anyone fetch cards by id and by a filter on the public columns, so a guest fill
 * runs the UNCHANGED composer over this: the seed, the cards on the page, and the candidates one
 * server call found for the method. Every other Catalog method answers empty, truthfully.
 *
 * `add` exists for Complete page, whose ranked fills learn their candidates from a server answer
 * mid-run and need somewhere to put them before the completer asks for them by id.
 *
 * Pure: type-only imports, so `node --test` can load it.
 */
import type { Catalog, CatalogCard, CatalogSeries, CatalogSet, VUnionGroup } from 'tcgscan-browse';

export interface CardStore extends Catalog {
  /** More cards into the store; a card already held keeps its first record. */
  add(cards: readonly CatalogCard[]): void;
  /** Every id the store holds. */
  ids(): string[];
}

export function catalogFromCards(cards: readonly CatalogCard[] = []): CardStore {
  const byId = new Map<string, CatalogCard>();
  const add = (more: readonly CatalogCard[]) => {
    for (const c of more) if (c && c.id && !byId.has(c.id)) byId.set(c.id, c);
  };
  add(cards);
  const none = <T>(): T[] => [];
  return {
    add,
    ids: () => [...byId.keys()],
    getCard: (id: string) => byId.get(id),
    listAll: () => [...byId.values()],
    listSeries: none<CatalogSeries>,
    getSeries: () => undefined,
    listSets: none<CatalogSet>,
    getSet: () => undefined,
    listCards: none<CatalogCard>,
    allSets: none<CatalogSet>,
    recentCards: none<CatalogCard>,
    upcomingCards: none<CatalogCard>,
    releasedCards: none<CatalogCard>,
    listJumbo: none<CatalogCard>,
    vunionGroups: none<VUnionGroup>,
    search: none<CatalogCard>,
    searchSeries: none<CatalogSeries>,
    searchSets: none<CatalogSet>,
    get cardCount() {
      return byId.size;
    },
  };
}

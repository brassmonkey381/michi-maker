/**
 * GUEST FILL (docs/GUEST-FILL-PLAN.md, owner 2026-10-30: "Guest fill could honestly be a game
 * changer"). A guest has no catalogue, so Fill page and Complete page used to stop at the account
 * wall. The data server already answers two anonymous questions that are enough to run the same
 * composers: cards BY ID (the kit's fetchCardsByIds) and cards BY A FILTER on the public columns
 * (data/guestFillQuery). This module asks them and hands back CatalogCards; data/stubCatalog turns
 * those into the Catalog the unchanged composers read.
 *
 * Two round trips per fill: the filter returns ids only, then fetchCardsByIds maps and caches them
 * exactly as every other cold-mode surface does, so the kit keeps the one row mapper. Fails soft:
 * a refused or failed call is an empty list, which the sheets show as "nothing found".
 */
import { fetchCardsByIds, findSimilar, getApiKey, getApiUrl, type CardLanguage, type CatalogCard } from 'tcgscan-browse';

import { similarByTags } from '@/lib/themeScores';
import type { DemoPage } from './binderTypes';
import { cardsQuery, idsOnPage, where, WINDOWS } from './guestFillQuery';
import type { ComposeMethod } from './pageComposer';
import { type CompleteMethod, missingStages, speciesOf } from './pageCompleter';
import { trainerFor } from './trainerPartners';

/** The ids one filter finds, both windows, deduped, newest window first. */
async function fetchIdsWhere(filters: readonly string[], languages?: readonly CardLanguage[]): Promise<string[]> {
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key || !filters.length) return [];
  const lists = await Promise.all(
    WINDOWS.map(async (w) => {
      try {
        const res = await fetch(`${url}${cardsQuery(filters, w, languages)}`, { headers: { apikey: key } });
        if (!res.ok) return [];
        const rows = (await res.json()) as { id: string | number }[] | null;
        return Array.isArray(rows) ? rows.map((r) => String(r.id)) : [];
      } catch {
        return [];
      }
    }),
  );
  return [...new Set(lists.flat())];
}

/** The cards one filter finds, as CatalogCards. */
export async function fetchCardsWhere(filters: readonly string[], languages?: readonly CardLanguage[]): Promise<CatalogCard[]> {
  const ids = await fetchIdsWhere(filters, languages);
  return ids.length ? fetchCardsByIds(ids) : [];
}

/** Several filters, one deduped list. */
async function fetchCardsWhereAny(filterSets: readonly (readonly string[])[], languages?: readonly CardLanguage[]): Promise<CatalogCard[]> {
  const lists = await Promise.all(filterSets.filter((f) => f.length).map((f) => fetchCardsWhere(f, languages)));
  const seen = new Set<string>();
  return lists.flat().filter((c) => !seen.has(c.id) && !!seen.add(c.id));
}

/** The cards a page holds plus `extra` ids (the seed), by id. */
export async function fetchPageCards(page: DemoPage, extra: readonly string[] = []): Promise<CatalogCard[]> {
  const ids = [...new Set([...extra, ...idsOnPage(page)])];
  return ids.length ? fetchCardsByIds(ids) : [];
}

/** Cards by id from a ranked server answer, order kept. */
const cardsForHits = (hits: readonly { id: string }[]) => (hits.length ? fetchCardsByIds(hits.map((h) => h.id)) : Promise.resolve([] as CatalogCard[]));

/**
 * The candidates one Fill page method will consider, for a guest. The same question each method
 * asks `catalog.listAll()` for, asked of the server instead; the ranked methods are asked the same
 * RPC the composer will ask (the kit caches the answer), so their hits resolve to cards.
 */
export async function fetchFillCandidates(
  method: ComposeMethod,
  seed: CatalogCard,
  page: DemoPage,
  languages?: readonly CardLanguage[],
): Promise<CatalogCard[]> {
  const empty = page.rows * page.cols - page.slots.length;
  const want = Math.max(1, empty) * 3 + 8;
  switch (method) {
    case 'samePokemon':
      return fetchCardsWhere(where.nameHas(speciesOf(seed)), languages);
    case 'evolutionLine':
      return fetchCardsWhere(where.nameHasAny(seed.evolutionLine), languages);
    case 'sameArtist':
      return fetchCardsWhere(where.artist(seed.illustrator), languages);
    case 'colorType':
      return fetchCardsWhere(where.type(seed.types[0] ?? ''), languages);
    case 'trainerPage': {
      const t = trainerFor(seed.name);
      if (!t) return [];
      return fetchCardsWhere(where.nameHasAny([...(t.tokens ?? [t.name]), ...t.signature, ...t.pokemon]), languages);
    }
    case 'moreLikeThis':
      return cardsForHits(await findSimilar(seed.id, want, { languages: languages ? [...languages] : undefined }));
    case 'sameScene':
      return cardsForHits(await similarByTags(seed.id, { languages: languages ? [...languages] : undefined, limit: want * 2 + 16 }));
    default:
      return [];
  }
}

/**
 * The candidates a Complete page fill scans the catalogue for, for a guest: the page's dominant
 * type or illustrator, or the prints of each species its lines are missing. The ranked fills
 * (theme, similar) learn theirs from their provider's answer instead; see `guestProviders`.
 */
export async function fetchCompleteCandidates(method: CompleteMethod, onPage: readonly CatalogCard[], languages?: readonly CardLanguage[]): Promise<CatalogCard[]> {
  const mode = (xs: string[]): string => {
    const n = new Map<string, number>();
    for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
    let best = '';
    for (const [k, v] of n) if (!best || v > (n.get(best) ?? 0)) best = k;
    return best;
  };
  switch (method) {
    case 'type':
      return fetchCardsWhere(where.type(mode(onPage.map((c) => c.types[0] ?? ''))), languages);
    case 'artist':
      return fetchCardsWhere(where.artist(mode(onPage.map((c) => c.illustrator.trim()))), languages);
    case 'lines':
      return fetchCardsWhereAny(missingStages(onPage).map((m) => where.nameHas(m.species)), languages);
    default:
      return [];
  }
}

/**
 * Wrap Complete page's ranked providers so the cards their hits name are fetched and `learn`ed
 * (into the stub catalogue) before the completer looks them up by id.
 */
export function guestProviders<P extends { similar?: (ids: string[], limit: number) => Promise<{ id: string }[]>; theme?: (ids: string[], limit: number, fullArt: boolean | undefined) => Promise<{ id: string }[]> }>(
  providers: P,
  learn: (cards: readonly CatalogCard[]) => void,
): P {
  const wrap = <A extends unknown[]>(f?: (...a: A) => Promise<{ id: string }[]>) =>
    f
      ? async (...a: A) => {
          const hits = await f(...a);
          learn(await cardsForHits(hits));
          return hits;
        }
      : undefined;
  return { ...providers, similar: wrap(providers.similar), theme: wrap(providers.theme) };
}

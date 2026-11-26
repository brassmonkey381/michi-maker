/**
 * DISCOVER'S SEARCH LANES (MIC-080). One typed query on /discover runs several searches at once:
 *
 *   card words   the card server answers the query (names, card text, the full grammar) and the
 *                public binders those cards fill most come back ranked (discover-search function)
 *   art          plain words only: the same words asked as themes (every word in the art)
 *   card fallback when neither server lane answers: the kit's card search, then binders by cards
 *   title        search_binders: title, description, @owner, page titles and page tags (MIC-068)
 *   colour word  a typed colour ("green", "pastel pink") runs the swatch search over page palettes
 *
 * app/discover.tsx and the owner's search lab (app/lab/search.tsx) both call these functions, and
 * both join them with data/discoverMerge, so the lab can never drift from what Discover shows.
 * The lab passes `onError` to see a lane's failure; Discover does not, and nothing else differs.
 */
import { expandThemeFields, parseQuery, searchCards, srgbToLab } from 'tcgscan-browse';

import {
  discoverByQuery,
  searchBinderPagesByShares,
  searchBindersByCardsRows,
  type RankedBinderRow,
} from '@/data/binderRepo';
import { cardsInFamily, PAGE_MATCH_BAR, PAGE_MATCH_MIN_CARDS, PAGE_SHARE_FLOOR, type ColourFamily } from '@/data/colourFamilies';
import { isPlainWords, mergeRows } from '@/data/discoverMerge';
import { loadedColorIndexes, loadPokemonColorIndexes } from '@/lib/colorIndexes';

export type ParsedQuery = ReturnType<typeof parseQuery>;
type Fields = ParsedQuery['fields'];
/** A lane's failure, as text. Only the lab listens. */
export type LaneError = (message: string) => void;

/** The colours Discover offers, with a name to say back. */
export const SWATCHES = [
  { hex: '#d93b30', name: 'red' },
  { hex: '#f08a24', name: 'orange' },
  { hex: '#f2c94c', name: 'yellow' },
  { hex: '#3fa34d', name: 'green' },
  { hex: '#2f8fe0', name: 'blue' },
  { hex: '#8e5bd1', name: 'purple' },
  { hex: '#e86fae', name: 'pink' },
  { hex: '#2b2b33', name: 'black' },
] as const;

/** A search body for the card server's search_cards. */
export function cardSearchBody(parsed: ParsedQuery, fields: Fields): Record<string, unknown> {
  return {
    p_words: parsed.words,
    p_fields: expandThemeFields(fields, { on: true, game: 'pokemon' }).fields,
    p_compares: parsed.comparisons.map((c) => ({ field: c.field, op: c.op, value: c.value })),
    p_facets: null,
    p_min_price: parsed.minPrice,
    p_max_price: parsed.maxPrice,
    p_sort: parsed.sort,
    p_dir: parsed.sortDir,
    p_limit: 400,
    p_offset: 0,
  };
}

/** The art lane's body: no name words, every typed word as a theme field. */
export function artSearchBody(parsed: ParsedQuery): Record<string, unknown> {
  return cardSearchBody({ ...parsed, words: [] }, parsed.words.map((w) => ({ key: 'theme' as const, value: w })));
}

/** Lane: the query as cards (names, card text, every field), binders ranked by those cards. */
export function laneCardWords(parsed: ParsedQuery, onError?: LaneError): Promise<RankedBinderRow[] | null> {
  return discoverByQuery(cardSearchBody(parsed, parsed.fields), onError);
}

/** Lane: plain words as what the art shows. Null (not asked) unless the query is plain words. */
export function laneArt(parsed: ParsedQuery, onError?: LaneError): Promise<RankedBinderRow[] | null> {
  return isPlainWords(parsed) ? discoverByQuery(artSearchBody(parsed), onError) : Promise.resolve(null);
}

/** Lane: the kit's own card search, then binders by those cards. Discover asks only when both server lanes fail. */
export async function laneCardFallback(q: string, onError?: LaneError): Promise<RankedBinderRow[] | null> {
  try {
    const page = await searchCards(parseQuery(q), { limit: 400 });
    if (page.failed) {
      onError?.('kit card search failed');
      return null;
    }
    if (!page.cards.length) return null;
    const rows = await searchBindersByCardsRows(page.cards.map((c) => c.id), 60);
    if (!rows) onError?.('search_binders_by_cards failed');
    return rows;
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** The card lanes as Discover ranks them: words lead, art follows, the fallback only when both fail. */
export async function rankByCards(q: string): Promise<RankedBinderRow[] | null> {
  const parsed = parseQuery(q);
  const [byWords, byArt] = await Promise.all([laneCardWords(parsed), laneArt(parsed)]);
  const viaServer = mergeRows(byWords, byArt);
  if (viaServer) return viaServer;
  return laneCardFallback(q);
}

/**
 * BY PAGE (owner, 2026-11-11: "binders with PAGEs that exhibit a lot of black"): each card's share
 * of the colour comes from the palette index, and a page matches at that colour's own bar
 * (data/colourFamilies). The binders come back through those pages. No top-up of near pages
 * (owner, 2026-11-11: results that are "not PINK"): only pages at the bar.
 * Null when the palette index is not available. Used by the swatches and by typed colour words.
 */
export async function colourFamilyRows(family: ColourFamily): Promise<RankedBinderRow[] | null> {
  const sw = SWATCHES.find((x) => x.name === family);
  if (!sw) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(sw.hex.slice(i, i + 2), 16));
  await loadPokemonColorIndexes();
  const indexes = loadedColorIndexes();
  if (!indexes.length) return null;
  const { ids, shares } = cardsInFamily(indexes, sw.name, srgbToLab(r, g, b));
  return searchBinderPagesByShares(ids, shares, { minShare: PAGE_MATCH_BAR[sw.name], minCards: PAGE_MATCH_MIN_CARDS, floor: PAGE_SHARE_FLOOR });
}

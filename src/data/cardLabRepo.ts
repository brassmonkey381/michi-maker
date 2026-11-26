/**
 * THE CARD LAB'S READS (MIC-080): one card, everything the app can ask about it. READ ONLY.
 * Nothing here writes or sends analytics.
 */
import {
  fetchCardsByIds,
  getApiKey,
  getApiUrl,
  getCardPrices,
  getLoadedCatalog,
  loadCatalog,
  parseQuery,
  scoreCard,
  searchCards,
  type CardPrices,
  type CatalogCard,
  type Lab,
} from 'tcgscan-browse';

import { colourWordIn } from '@/data/colourWords';
import { isPlainWords } from '@/data/discoverMerge';
import { cardSearchBody } from '@/data/discoverSearch';
import { familyShares } from '@/data/searchLab';
import { cardIdsFor, themeHits } from '@/data/searchLabRepo';
import { colorIndexHolding, loadPokemonColorIndexes } from '@/lib/colorIndexes';
import { getPriceSummary } from '@/lib/prices';

/** Cards for a name, a query, or an id. An id-looking input is resolved first. */
export async function findCards(text: string): Promise<{ cards: CatalogCard[]; error: string | null }> {
  const t = text.trim();
  if (!t) return { cards: [], error: null };
  const out: CatalogCard[] = [];
  if (/^[\w-]+$/.test(t) && /\d/.test(t)) out.push(...(await fetchCardsByIds([t])));
  const page = await searchCards(parseQuery(t), { limit: 30 });
  for (const c of page.cards) if (!out.some((x) => x.id === c.id)) out.push(c);
  return { cards: out, error: page.failed ? 'card search failed' : null };
}

/** The card's raw row from the card server, as wide as this key may read. */
export async function rawCardRow(id: string): Promise<{ source: string; row: Record<string, unknown> | null; error: string | null }> {
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key) return { source: '', row: null, error: 'card server not configured' };
  const errors: string[] = [];
  for (const table of ['cards', 'cards_en']) {
    try {
      const res = await fetch(`${url}/${table}?select=*&id=eq.${encodeURIComponent(id)}`, { headers: { apikey: key } });
      if (!res.ok) {
        errors.push(`${table} ${res.status}`);
        continue;
      }
      const rows = (await res.json()) as Record<string, unknown>[];
      if (rows.length) return { source: table, row: rows[0], error: errors.length ? errors.join('; ') : null };
      errors.push(`${table}: no row`);
    } catch (e) {
      errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { source: '', row: null, error: errors.join('; ') };
}

/** The full catalogue's view of the card (captions and scene tags, when the bundle ships them). */
export async function catalogueCard(id: string): Promise<CatalogCard | null> {
  const cat = getLoadedCatalog() ?? (await loadCatalog().catch(() => null));
  return cat?.getCard(id) ?? null;
}

export interface CardPalette {
  index: boolean;
  art: Lab[];
  noborder: Lab[];
  families: ReturnType<typeof familyShares>;
}

export async function cardPalette(id: string): Promise<CardPalette> {
  await loadPokemonColorIndexes();
  const idx = colorIndexHolding(id);
  const art = idx?.colors(id, 'art') ?? [];
  return { index: !!idx, art, noborder: idx?.colors(id, 'noborder') ?? [], families: familyShares(art) };
}

export async function cardPrices(id: string): Promise<{ history: CardPrices | null; summary: { cur: number; date: string; variants: Record<string, number> } | null }> {
  const [history, summary] = await Promise.all([
    getCardPrices(id).catch(() => null),
    getPriceSummary().then((s) => s[id] ?? null).catch(() => null),
  ]);
  return { history, summary };
}

export interface LaneVerdict {
  lane: string;
  verdict: 'yes' | 'no' | 'n/a' | 'error';
  detail: string;
}

/** Would this card take part in each lane of Discover's search for `q`? */
export async function testQueryOnCard(card: CatalogCard, q: string, priceOf: (id: string) => number): Promise<LaneVerdict[]> {
  const parsed = parseQuery(q.trim());
  const out: LaneVerdict[] = [];

  // Card words: the local grammar, then the card server's own top 400 (what discover-search uses).
  const local = scoreCard(card, { ...parsed, fields: parsed.fields.filter((f) => f.key !== 'theme') }, priceOf);
  const server = await cardIdsFor(cardSearchBody(parsed, parsed.fields));
  const at = server.ids.indexOf(card.id);
  out.push(
    server.error
      ? { lane: 'Card words', verdict: 'error', detail: server.error }
      : {
          lane: 'Card words',
          verdict: at >= 0 ? 'yes' : 'no',
          detail: `${at >= 0 ? `rank ${at + 1} of ${server.ids.length}` : `not in the server's ${server.ids.length}${server.ids.length >= 400 ? ' (capped at 400)' : ''}`}; local grammar score ${local}${parsed.fields.some((f) => f.key === 'theme') ? ' (theme fields left out locally)' : ''}`,
        },
  );

  // Art: plain words as themes, every word in the art. Typed theme: fields are checked the same way.
  const themeWords = isPlainWords(parsed) ? parsed.words : parsed.fields.filter((f) => f.key === 'theme').map((f) => f.value);
  if (!themeWords.length) {
    out.push({ lane: 'Art and theme', verdict: 'n/a', detail: 'not asked: the query is not plain words and has no theme: field' });
  } else {
    const { hits, error } = await themeHits(themeWords, [card.id]);
    const got = hits.get(card.id) ?? [];
    const all = themeWords.every((w) => got.includes(w));
    out.push(
      error
        ? { lane: 'Art and theme', verdict: 'error', detail: error }
        : { lane: 'Art and theme', verdict: all ? 'yes' : 'no', detail: `carries ${got.length ? got.join(', ') : 'none'} of ${themeWords.join(', ')} (exact tags, no synonyms)` },
    );
  }

  // Colour word.
  const cw = colourWordIn(q);
  if (!cw) out.push({ lane: 'Colour word', verdict: 'n/a', detail: 'no colour word in the query' });
  else {
    const pal = await cardPalette(card.id);
    const f = pal.families.find((x) => x.family === cw.family)!;
    out.push(
      !pal.index
        ? { lane: 'Colour word', verdict: 'error', detail: 'card not in the palette index' }
        : { lane: 'Colour word', verdict: f.counts ? 'yes' : 'no', detail: `${cw.family} share ${f.share} (counts at 0.1 or more)` },
    );
  }

  out.push({ lane: 'Title and page tags', verdict: 'n/a', detail: 'matches binder and page text, not cards' });
  return out;
}

/**
 * THE LABS' READS (MIC-080). Runs Discover's search lanes one at a time, with a clock and an error
 * on each, and gathers the "why" for each result. READ ONLY: selects and read-only RPCs on public
 * data, nothing else. No analytics events (nothing here calls track()).
 *
 * The lanes are data/discoverSearch's own functions and the merge is data/discoverMerge's, so the
 * lab's merged order is Discover's merged order.
 */
import { fetchCardsByIds, getApiKey, getApiUrl, parseQuery, type CatalogCard } from 'tcgscan-browse';

import { searchBindersPage, type RankedBinderRow } from '@/data/binderRepo';
import type { DemoBinder } from '@/data/binderTypes';
import { colourWordIn, type ColourWordMatch } from '@/data/colourWords';
import { discoverOrder, finalCardHits, isPlainWords, mergeRows, type MergedSource } from '@/data/discoverMerge';
import {
  cardSearchBody,
  colourFamilyRows,
  laneArt,
  laneCardFallback,
  laneCardWords,
  type ParsedQuery,
} from '@/data/discoverSearch';
import { matchedCardsByBinder, titleWhy } from '@/data/searchLab';
import { supabase } from '@/lib/supabase';

export type LaneKey = 'words' | 'art' | 'fallback' | 'title' | 'colour';

export interface LaneRun<T> {
  key: LaneKey;
  label: string;
  /** Not asked, and why (e.g. the query is not plain words). */
  skipped?: string;
  ms: number;
  value: T | null;
  error: string | null;
  note?: string;
}

/** One result row as the lab prints it. */
export interface LabRow {
  binder_id: string;
  rank: number;
  title?: string;
  author?: string | null;
  likes?: number;
  pages?: number | null;
  score?: number | null;
  hits?: number | null;
  matchPages?: number[];
  /** Human reasons: matched cards, colour pages, title branches. */
  why: string[];
}

export interface LabLane {
  run: LaneRun<unknown>;
  rows: LabRow[];
}

export interface LabSearch {
  query: string;
  parsed: ParsedQuery;
  colourWord: ColourWordMatch | null;
  lanes: LabLane[];
  merged: (LabRow & { from: MergedSource })[];
  totalMs: number;
}

async function timed<T>(key: LaneKey, label: string, fn: (onError: (m: string) => void) => Promise<T | null>): Promise<LaneRun<T>> {
  let error: string | null = null;
  const t0 = Date.now();
  try {
    const value = await fn((m) => {
      error = error ? `${error}; ${m}` : m;
    });
    return { key, label, ms: Date.now() - t0, value, error };
  } catch (e) {
    return { key, label, ms: Date.now() - t0, value: null, error: e instanceof Error ? e.message : String(e) };
  }
}

const skipped = <T,>(key: LaneKey, label: string, why: string): LaneRun<T> => ({ key, label, skipped: why, ms: 0, value: null, error: null });

function rankedRow(r: RankedBinderRow, i: number): LabRow {
  return {
    binder_id: r.binder_id,
    rank: i + 1,
    author: r.author_name,
    likes: Number(r.like_count),
    pages: r.page_count ?? null,
    score: r.score ?? null,
    hits: r.hits ?? null,
    matchPages: r.match_pages?.map(Number),
    why: [],
  };
}

function binderRow(b: DemoBinder, i: number): LabRow {
  return { binder_id: b.id, rank: i + 1, title: b.title, author: b.authorName ?? null, likes: b.likeCount, pages: b.pageCount ?? null, why: [] };
}

/**
 * Run every lane of Discover's search for `q`, exactly as Discover would, but separately. With
 * `explain`, also reads the binders' titles and the cards that matched, for the top `explainTop`
 * rows of each lane (more reads; the Run all list passes false).
 */
export async function runLabSearch(q: string, { explain = true, explainTop = 25 } = {}): Promise<LabSearch> {
  const t0 = Date.now();
  const query = q.trim();
  const parsed = parseQuery(query);
  const cw = colourWordIn(query);
  const [words, art, title, colour] = await Promise.all([
    timed('words', 'Card words (discover-search, as words)', (e) => laneCardWords(parsed, e)),
    isPlainWords(parsed)
      ? timed('art', 'Art and theme (discover-search, words as themes)', (e) => laneArt(parsed, e))
      : Promise.resolve(skipped<RankedBinderRow[]>('art', 'Art and theme (discover-search, words as themes)', 'not asked: the query has fields or comparisons')),
    timed('title', 'Title, description, @owner, page titles, page tags (search_binders)', () => searchBindersPage(query)),
    cw
      ? timed('colour', `Colour word: ${cw.family}${cw.onlyColour ? ' (alone, leads)' : ' (in a longer query, follows)'}`, async (e) => {
          const rows = await colourFamilyRows(cw.family).catch((err: unknown) => {
            e(err instanceof Error ? err.message : String(err));
            return null;
          });
          if (rows === null) e('palette index unavailable or the page search failed');
          return rows;
        })
      : Promise.resolve(skipped<RankedBinderRow[]>('colour', 'Colour word', 'not asked: no colour word in the query')),
  ]);
  const viaServer = mergeRows(words.value, art.value);
  const fallback = viaServer
    ? skipped<RankedBinderRow[]>('fallback', 'Card fallback (kit search, then search_binders_by_cards)', 'not asked: a server lane answered')
    : await timed('fallback', 'Card fallback (kit search, then search_binders_by_cards)', (e) => laneCardFallback(query, e));
  const ranked = viaServer ?? fallback.value;
  const cardHits = finalCardHits(ranked, colour.value, cw);
  const titleBinders = title.value?.binders ?? [];
  if (title.value) title.note = `${titleBinders.length} on the first page${title.value.next ? ', more behind Load more' : ''}. Page tags (MIC-068) are a branch of this RPC, not a lane of their own.`;

  const lanes: LabLane[] = [
    { run: words as LaneRun<unknown>, rows: (words.value ?? []).map(rankedRow) },
    { run: art as LaneRun<unknown>, rows: (art.value ?? []).map(rankedRow) },
    { run: fallback as LaneRun<unknown>, rows: (fallback.value ?? []).map(rankedRow) },
    { run: title as LaneRun<unknown>, rows: titleBinders.map(binderRow) },
    { run: colour as LaneRun<unknown>, rows: (colour.value ?? []).map(rankedRow) },
  ];

  // The merged order, built from the same rows.
  const byId = new Map<string, LabRow>();
  for (const lane of [...lanes].reverse()) for (const r of lane.rows) byId.set(r.binder_id, { ...r, ...(byId.get(r.binder_id) ?? {}) });
  const rankedById = new Map((cardHits ?? []).map((r, i) => [r.binder_id, rankedRow(r, i)]));
  const merged = discoverOrder(cardHits, titleBinders.map((b) => b.id)).map((m, i) => ({
    ...(rankedById.get(m.binder_id) ?? byId.get(m.binder_id) ?? { binder_id: m.binder_id, why: [] }),
    rank: i + 1,
    from: m.from,
    why: [] as string[],
  }));

  if (explain) await explainRows(query, parsed, lanes, merged, explainTop);
  else await fillTitles(merged.slice(0, 10));
  return { query, parsed, colourWord: cw, lanes, merged, totalMs: Date.now() - t0 };
}

/** Titles and owners for rows that do not have them yet. */
async function fillTitles(rows: LabRow[]): Promise<void> {
  const want = [...new Set(rows.filter((r) => !r.title).map((r) => r.binder_id))];
  if (!want.length || !supabase) return;
  const { data } = await supabase.from('binders').select('id, title, description').in('id', want);
  const meta = new Map((data ?? []).map((b) => [b.id, b]));
  for (const r of rows) if (!r.title) r.title = meta.get(r.binder_id)?.title ?? '(not readable)';
}

/** The data server's search_cards, called directly (read only). Returns the found card ids. */
export async function cardIdsFor(body: Record<string, unknown>): Promise<{ ids: string[]; error: string | null }> {
  const url = getApiUrl();
  const key = getApiKey();
  if (!url || !key) return { ids: [], error: 'card server not configured' };
  try {
    const res = await fetch(`${url}/rpc/search_cards`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ids: [], error: `search_cards ${res.status}` };
    const rows = ((await res.json()) ?? []) as { id: string | number }[];
    return { ids: rows.map((r) => String(r.id)), error: null };
  } catch (e) {
    return { ids: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** score_cards_by_theme over a pool: which of `want` each card carries (a subset of what was sent). */
export async function themeHits(want: string[], pool: string[]): Promise<{ hits: Map<string, string[]>; error: string | null }> {
  const hits = new Map<string, string[]>();
  const url = getApiUrl();
  const key = getApiKey();
  if (!want.length || !pool.length) return { hits, error: null };
  if (!url || !key) return { hits, error: 'card server not configured' };
  try {
    const res = await fetch(`${url}/rpc/score_cards_by_theme`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_want: want, p_pool: pool.slice(0, 1000), p_limit: Math.min(1000, pool.length) }),
    });
    if (!res.ok) return { hits, error: `score_cards_by_theme ${res.status}` };
    for (const r of ((await res.json()) ?? []) as { id: string | number; hits?: string[] | null }[]) {
      if (r.hits?.length) hits.set(String(r.id), r.hits);
    }
    return { hits, error: null };
  } catch (e) {
    return { hits, error: e instanceof Error ? e.message : String(e) };
  }
}

const names = (ids: string[], cards: Map<string, CatalogCard>, max = 6) => {
  const list = ids.slice(0, max).map((id) => cards.get(id)?.name ?? id);
  return ids.length > max ? `${list.join(', ')} +${ids.length - max}` : list.join(', ');
};

async function explainRows(query: string, parsed: ParsedQuery, lanes: LabLane[], merged: LabRow[], top: number): Promise<void> {
  if (!supabase) return;
  const pick = (k: LaneKey) => lanes.find((l) => l.run.key === k)!;
  const all = [...lanes.flatMap((l) => l.rows.slice(0, top)), ...merged.slice(0, top)];
  const ids = [...new Set(all.map((r) => r.binder_id))];
  if (!ids.length) return;

  // What a visitor can read: binder titles, page titles, and the cards in each binder's pockets.
  const [binders, pages, slots] = await Promise.all([
    supabase.from('binders').select('id, title, description').in('id', ids),
    supabase.from('binder_pages').select('binder_id, title').in('binder_id', ids),
    supabase.from('binder_slots').select('binder_id, card_id').in('binder_id', ids).not('card_id', 'is', null).limit(20000),
  ]);
  const meta = new Map((binders.data ?? []).map((b) => [b.id, b]));
  const pageTitles = new Map<string, (string | null)[]>();
  for (const p of pages.data ?? []) pageTitles.set(p.binder_id, [...(pageTitles.get(p.binder_id) ?? []), p.title]);
  const slotRows = (slots.data ?? []) as { binder_id: string | null; card_id: string | null }[];

  // Which cards each card lane found: the words lane's own search, asked again of the card server.
  const wordsFound = await cardIdsFor(cardSearchBody(parsed, parsed.fields));
  const wordsSet = new Set(wordsFound.ids);
  // The art lane's cards: every typed word must be in the art. Asked of score_cards_by_theme over
  // the result binders' own cards (themed search_cards would be clamped for this key).
  const poolIds = [...new Set(slotRows.map((s) => s.card_id!).filter(Boolean))];
  const art = isPlainWords(parsed) ? await themeHits(parsed.words, poolIds) : { hits: new Map<string, string[]>(), error: null };
  const artSet = new Set([...art.hits.entries()].filter(([, h]) => parsed.words.every((w) => h.includes(w))).map(([id]) => id));
  const wordsByBinder = matchedCardsByBinder(slotRows, wordsSet);
  const artByBinder = matchedCardsByBinder(slotRows, artSet);
  const cardIds = [...new Set([...wordsByBinder.values(), ...artByBinder.values()].flat())];
  const cards = new Map((await fetchCardsByIds(cardIds.slice(0, 600))).map((c) => [c.id, c]));

  if (wordsFound.error) pick('words').run.note = `card list for "why": ${wordsFound.error}`;
  else pick('words').run.note = `the card server finds ${wordsFound.ids.length}${wordsFound.ids.length >= 400 ? ' (capped at 400)' : ''} cards for these words`;
  pick('art').run.note = art.error ? `card list for "why": ${art.error}` : 'art cards in "why" are exact tag matches only (no synonyms), so they can undercount';

  const explain = (r: LabRow, lane: LaneKey | 'merged') => {
    const m = meta.get(r.binder_id);
    if (!r.title) r.title = m?.title ?? '(not readable)';
    const why: string[] = [];
    if (r.hits != null) why.push(`${r.hits} found ${r.hits === 1 ? 'card' : 'cards'} (RPC)`);
    if (r.matchPages?.length) why.push(`${lane === 'colour' ? 'colour pages' : 'matching pages'}: ${r.matchPages.join(', ')}`);
    const w = wordsByBinder.get(r.binder_id);
    if (w?.length && (lane === 'words' || lane === 'fallback' || lane === 'merged')) why.push(`word cards (${w.length}): ${names(w, cards)}`);
    const a = artByBinder.get(r.binder_id);
    if (a?.length && (lane === 'art' || lane === 'merged')) why.push(`art cards (${a.length}): ${names(a, cards)}`);
    if (lane === 'title' || (lane === 'merged' && (r as { from?: MergedSource }).from === 'title')) {
      why.push(`text: ${titleWhy(query, { title: m?.title, description: m?.description, author: r.author, pageTitles: pageTitles.get(r.binder_id) }).join(', ')}`);
    }
    r.why = why;
  };
  for (const lane of lanes) for (const r of lane.rows.slice(0, top)) explain(r, lane.run.key);
  for (const r of merged.slice(0, top)) explain(r, 'merged');
  await fillTitles(merged);
  for (const lane of lanes) await fillTitles(lane.rows);
}

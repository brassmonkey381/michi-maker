/**
 * THE OWNER'S SEARCH AND CARD LABS, PURE HALF (MIC-080). /lab/search and /lab/card are read-only
 * QA pages; everything here is the logic they show, kept free of React and of the network so
 * `node --test` can check it.
 *
 * Verdicts (good / bad per query and binder) live on this device only (localStorage or
 * AsyncStorage). Nothing in the labs writes to a database.
 */
import { CARD_MIN_SHARE, familyShare, type ColourFamily } from './colourFamilies.ts';
import type { Lab } from 'tcgscan-browse';

/** The saved test queries the lab starts with. */
export const DEFAULT_TEST_QUERIES: readonly string[] = [
  'cameo',
  'green',
  'emerald',
  'watercolor',
  'rainy city',
  'pikachu',
  'charizard',
  '151',
  'dragon',
  'pastel pink',
];

/** Normalise a saved-query list: trimmed, no blanks, no repeats (case-insensitive), order kept. */
export function normaliseQueries(list: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== 'string') continue;
    const q = v.trim();
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    out.push(q);
  }
  return out;
}

export type Verdict = 'good' | 'bad';
/** query (lowercased, trimmed) -> binder id -> verdict. */
export type Verdicts = Record<string, Record<string, Verdict>>;

const queryKey = (q: string) => q.trim().toLowerCase();

/** A new verdict map with one verdict set, changed or (with null) cleared. Never mutates. */
export function setVerdict(all: Verdicts, query: string, binderId: string, v: Verdict | null): Verdicts {
  const k = queryKey(query);
  const row = { ...(all[k] ?? {}) };
  if (v) row[binderId] = v;
  else delete row[binderId];
  const next = { ...all };
  if (Object.keys(row).length) next[k] = row;
  else delete next[k];
  return next;
}

export function verdictOf(all: Verdicts, query: string, binderId: string): Verdict | null {
  return all[queryKey(query)]?.[binderId] ?? null;
}

/** Whatever storage held, as a clean verdict map (unknown shapes and values dropped). */
export function parseVerdicts(raw: string | null): Verdicts {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: Verdicts = {};
  for (const [q, row] of Object.entries(data as Record<string, unknown>)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const clean: Record<string, Verdict> = {};
    for (const [id, v] of Object.entries(row as Record<string, unknown>)) if (v === 'good' || v === 'bad') clean[id] = v;
    if (Object.keys(clean).length) out[queryKey(q)] = clean;
  }
  return out;
}

/** The export: queries sorted, each with its good and bad binder ids, plus a count. */
export function exportVerdicts(all: Verdicts, at = new Date().toISOString()): string {
  const queries = Object.keys(all)
    .sort()
    .map((q) => {
      const row = all[q];
      const ids = Object.keys(row).sort();
      return { query: q, good: ids.filter((id) => row[id] === 'good'), bad: ids.filter((id) => row[id] === 'bad') };
    });
  const total = queries.reduce((n, q) => n + q.good.length + q.bad.length, 0);
  return JSON.stringify({ exported_at: at, total, queries }, null, 2);
}

/** search_binders' text match: the whole trimmed query, anywhere, any case (public.like_pattern). */
export function ilikeContains(haystack: string | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !!q && !!haystack && haystack.toLowerCase().includes(q);
}

/**
 * WHY THE TITLE LANE FOUND A BINDER. search_binders has five branches (title or description,
 * @owner, page titles, page tags or the page's tag description). The first three are checked here
 * from what a visitor can read; the tags table is server-only (no client read policy), so a binder
 * none of the others explain is put down to the tags.
 */
export function titleWhy(
  query: string,
  b: { title?: string | null; description?: string | null; author?: string | null; pageTitles?: readonly (string | null)[] },
): string[] {
  const why: string[] = [];
  if (ilikeContains(b.title, query)) why.push('title');
  if (ilikeContains(b.description, query)) why.push('description');
  if (ilikeContains(b.author, query)) why.push('@owner');
  const pages = (b.pageTitles ?? []).filter((t) => ilikeContains(t, query)).length;
  if (pages) why.push(`${pages} page ${pages === 1 ? 'title' : 'titles'}`);
  if (!why.length) why.push('page tags or tag description (server only)');
  return why;
}

/** Per binder, the found cards it holds: binder id -> distinct card ids, in slot order. */
export function matchedCardsByBinder(
  slots: readonly { binder_id: string | null; card_id: string | null }[],
  found: ReadonlySet<string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of slots) {
    if (!s.binder_id || !s.card_id || !found.has(s.card_id)) continue;
    const list = out.get(s.binder_id) ?? [];
    if (!list.includes(s.card_id)) list.push(s.card_id);
    out.set(s.binder_id, list);
  }
  return out;
}

export const FAMILIES: readonly ColourFamily[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'black'];

/**
 * A card's share of each colour family, from its art palette, and whether it counts: it is sent to
 * the page colour search for a family (cardsInFamily) only at CARD_MIN_SHARE or more.
 */
export function familyShares(colours: readonly Lab[]): { family: ColourFamily; share: number; counts: boolean }[] {
  return FAMILIES.map((family) => {
    const raw = familyShare(colours, family);
    return { family, share: Math.round(raw * 100) / 100, counts: colours.length > 0 && raw >= CARD_MIN_SHARE };
  });
}

/** Milliseconds as the lab prints them. */
export function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

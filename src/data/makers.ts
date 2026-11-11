/**
 * MAKERS, NOT A PEOPLE SEARCH (MIC-017 piece 8, owner 2026-11-11: "the MAKERS toggle on /discover
 * was not supposed to be a PEOPLE search ... top binders makers first, recent makers, etc ... with
 * some of their binders showing").
 *
 * Discover's public rankings already name each binder's maker and its likes, so the makers come
 * from grouping those rows here: no new query. "Top makers": the most-liked public binders grouped
 * by maker, ranked by the likes their binders hold together. "Recently active": the newest public
 * binders grouped by maker, ranked by their newest one. Each maker keeps their binders in the
 * ranking's order, so the first three are their best (or newest). The official reference account
 * is left out (it has its own shelf); house personas go last.
 */
import type { RankedBinderRow } from './binderRepo';
import { isHouseAccount } from './houseAccounts.ts';

export interface Maker {
  name: string;
  likes: number;
  latestAt: string;
  rows: RankedBinderRow[];
}

/** The official account's reference binders have their own section on Discover. */
const OFFICIAL = 'michimaker';

export function groupMakers(rows: readonly RankedBinderRow[], by: 'likes' | 'recent'): Maker[] {
  const map = new Map<string, Maker>();
  for (const r of rows) {
    const name = r.author_name?.trim();
    if (!name || name.toLowerCase() === OFFICIAL) continue;
    const key = name.toLowerCase();
    const m = map.get(key) ?? { name, likes: 0, latestAt: '', rows: [] };
    m.likes += Number(r.like_count) || 0;
    const at = r.made_public_at ?? '';
    if (at > m.latestAt) m.latestAt = at;
    m.rows.push(r);
    map.set(key, m);
  }
  const house = (m: Maker) => (isHouseAccount(m.name) ? 1 : 0);
  return [...map.values()].sort((a, b) =>
    house(a) - house(b) ||
    (by === 'likes' ? b.likes - a.likes || b.rows.length - a.rows.length : b.latestAt.localeCompare(a.latestAt)) ||
    a.name.localeCompare(b.name),
  );
}

/**
 * MIC-041 (owner, 2026-11-26): the public profile's Want and Trade lists, browsed. One search box,
 * All / Want / Trade, a sort, and a Filters sheet (set, type, rarity), shared by both profile
 * layouts (A: a compact carousel top right; B: a full-width grid). Pure, so it is tested alone.
 *
 * "Newest" is the order the lists arrive in: public_collection_lists returns each list by
 * updated_at, newest first, so a row's index is its age rank (wants first, then trades merged).
 */
import type { TableRow } from '@/data/collectionLists';

export type ListShow = 'all' | 'want' | 'trade';
export type ListSort = 'newest' | 'name' | 'set';

/** What the browser needs to know about a card; anything missing reads as ''. */
export interface ListCardInfo {
  name: string;
  setName: string;
  releaseDate: string;
  rarity: string;
  /** Energy types for a Pokémon (Fire, Water...), else the supertype (Trainer, Energy). */
  type: string;
}

export interface ListFilters {
  set: string;
  type: string;
  rarity: string;
}

export const NO_FILTERS: ListFilters = { set: '', type: '', rarity: '' };

export interface ListQuery {
  q: string;
  show: ListShow;
  sort: ListSort;
  filters: ListFilters;
}

export interface BrowseRow extends TableRow {
  /** Position in the lists as they arrived: 0 is the newest. */
  rank: number;
  info: ListCardInfo;
}

const BLANK: ListCardInfo = { name: '', setName: '', releaseDate: '', rarity: '', type: '' };

/** A card's browse facts from a catalog card (or nothing yet). */
export function cardInfo(c: { name?: string; setName?: string; releaseDate?: string; rarity?: string; types?: string[]; cardType?: string[] } | null | undefined): ListCardInfo {
  if (!c) return BLANK;
  const type = c.types?.find(Boolean) ?? c.cardType?.find(Boolean) ?? '';
  return { name: c.name ?? '', setName: c.setName ?? '', releaseDate: c.releaseDate ?? '', rarity: c.rarity ?? '', type };
}

export function browseRows(rows: readonly TableRow[], info: (cardId: string) => ListCardInfo): BrowseRow[] {
  return rows.map((r, rank) => ({ ...r, rank, info: info(r.cardId) }));
}

export function activeFilterCount(f: ListFilters): number {
  return (f.set ? 1 : 0) + (f.type ? 1 : 0) + (f.rarity ? 1 : 0);
}

/** The choices each filter offers: the values present in these rows, sorted, blanks left out. */
export function filterChoices(rows: readonly BrowseRow[]): { set: string[]; type: string[]; rarity: string[] } {
  const pick = (k: keyof ListFilters) => {
    const key = k === 'set' ? 'setName' : k;
    return [...new Set(rows.map((r) => r.info[key as keyof ListCardInfo]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  };
  return { set: pick('set'), type: pick('type'), rarity: pick('rarity') };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function applyListQuery(rows: readonly BrowseRow[], query: ListQuery): BrowseRow[] {
  const words = norm(query.q).split(/\s+/).filter(Boolean);
  const { set, type, rarity } = query.filters;
  const out = rows.filter((r) => {
    if (query.show === 'want' && r.want <= 0) return false;
    if (query.show === 'trade' && r.trade <= 0) return false;
    if (set && r.info.setName !== set) return false;
    if (type && r.info.type !== type) return false;
    if (rarity && r.info.rarity !== rarity) return false;
    if (words.length) {
      const hay = norm(`${r.info.name} ${r.info.setName} ${r.cardId}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const byName = (a: BrowseRow, b: BrowseRow) => (a.info.name || a.cardId).localeCompare(b.info.name || b.cardId);
  if (query.sort === 'newest') out.sort((a, b) => a.rank - b.rank);
  else if (query.sort === 'name') out.sort((a, b) => byName(a, b) || a.rank - b.rank);
  else
    // Set: newest set first (release date), then the set's name, then the card's name.
    out.sort((a, b) => b.info.releaseDate.localeCompare(a.info.releaseDate) || a.info.setName.localeCompare(b.info.setName) || byName(a, b));
  return out;
}

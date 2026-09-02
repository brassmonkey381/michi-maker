/**
 * THE STICKER LIBRARY — set and series logos, as a flat list a tile grid can draw and a search
 * field can filter.
 *
 * The logos come from the tiny public taxonomy the browse kit already loads (browse/taxonomy.json,
 * one small file, guest-safe): every series and every set carries a `coverUri`, which is the logo
 * the home screen already puts on set headers. That is the whole source — no catalog load, no
 * new endpoint, no package change. Set SYMBOLS are not offered: they are not in the data path.
 *
 * Pure and structurally typed so `npm test` can pin it against a stub taxonomy. The kit's
 * TaxonomySource is described here as the two methods this needs rather than imported.
 */

import { seriesCode } from './seriesCode.ts';

export interface StickerItem {
  /** 'set:<id>' | 'series:<id>' — stored on the decoration so a changed logo URL can be re-resolved. */
  id: string;
  kind: 'set' | 'series';
  label: string;
  /** The set's code (e.g. "SV3"), or the series' abbreviation ("SV"). */
  code: string;
  seriesId: string;
  seriesName: string;
  uri: string;
  /** ISO date, for newest-first ordering. */
  releaseDate: string;
}

/** The two calls this needs from the kit's TaxonomySource. */
export interface StickerTaxonomy {
  listSeries(): { id: string; name: string; coverUri?: string; releaseDate: string }[];
  listSets(seriesId: string): { id: string; name: string; code: string; seriesId: string; coverUri?: string; releaseDate: string }[];
}

/**
 * Every logo the taxonomy has, newest first, series logos ahead of their sets. Entries without a
 * logo are dropped: the kit's initial-letter fallback tile is a placeholder, not a sticker.
 */
export function buildStickerLibrary(tax: StickerTaxonomy): StickerItem[] {
  const out: StickerItem[] = [];
  for (const series of tax.listSeries()) {
    if (series.coverUri) {
      out.push({
        id: `series:${series.id}`,
        kind: 'series',
        label: series.name,
        code: seriesCode(series.name),
        seriesId: series.id,
        seriesName: series.name,
        uri: series.coverUri,
        releaseDate: series.releaseDate,
      });
    }
    for (const set of tax.listSets(series.id)) {
      if (!set.coverUri) continue;
      out.push({
        id: `set:${set.id}`,
        kind: 'set',
        label: set.name,
        code: set.code,
        seriesId: series.id,
        seriesName: series.name,
        uri: set.coverUri,
        releaseDate: set.releaseDate,
      });
    }
  }
  return out.sort((a, b) => {
    // Newest series first; within a series the series logo leads its sets, newest set first.
    if (a.seriesId !== b.seriesId) return seriesDate(out, b.seriesId).localeCompare(seriesDate(out, a.seriesId));
    if (a.kind !== b.kind) return a.kind === 'series' ? -1 : 1;
    return b.releaseDate.localeCompare(a.releaseDate);
  });
}

function seriesDate(items: StickerItem[], seriesId: string): string {
  let best = '';
  for (const it of items) if (it.seriesId === seriesId && it.releaseDate > best) best = it.releaseDate;
  return best;
}

/** Name, code or series abbreviation, case-insensitively; an empty query is everything. */
export function filterStickers(items: StickerItem[], query: string): StickerItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      it.code.toLowerCase().includes(q) ||
      it.seriesName.toLowerCase().includes(q) ||
      seriesCode(it.seriesName).toLowerCase() === q,
  );
}

/** The distinct series in the library, in the library's order — for a filter chip row. */
export function stickerSeries(items: StickerItem[]): { id: string; name: string; uri?: string }[] {
  const seen = new Map<string, { id: string; name: string; uri?: string }>();
  for (const it of items) {
    const cur = seen.get(it.seriesId);
    if (!cur) seen.set(it.seriesId, { id: it.seriesId, name: it.seriesName, uri: it.kind === 'series' ? it.uri : undefined });
    else if (!cur.uri && it.kind === 'series') cur.uri = it.uri;
  }
  return [...seen.values()];
}

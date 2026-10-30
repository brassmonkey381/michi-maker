/**
 * THE QUERIES A GUEST FILL SENDS (docs/GUEST-FILL-PLAN.md, 2026-10-30), kept pure so `node --test`
 * can pin them: PostgREST filters over the public `cards` view's anonymous columns (name,
 * illustrator, types, evolution line, release date), ids only, two windows per filter.
 *
 * Two windows, newest and oldest, approximate the full catalogue's spread of eras: the composer's
 * varietyRank buckets by series, and a single "newest 200" would hand it one era. The network side
 * is data/guestFill.
 */
import type { CardLanguage } from 'tcgscan-browse';

import type { DemoPage } from './binderTypes.ts';

export interface Window {
  order: string;
  limit: number;
}

export const WINDOWS: readonly Window[] = [
  { order: 'release_date.desc.nullslast', limit: 120 },
  { order: 'release_date.asc.nullslast', limit: 80 },
];

/**
 * A value quoted the PostgREST way, so commas, dots and parens in a name survive an or=() list or
 * an array literal. ONLY there: a plain `column=ilike.value` takes its value bare, and quoting it
 * matched nothing (probed 2026-10-30).
 */
const quoted = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Filter clauses (unencoded `key=op.value` pairs) that find a method's candidates. */
export const where = {
  /** Cards whose name contains the species (Same Pokemon). */
  nameHas(species: string): string[] {
    const s = species.trim();
    return s ? [`name=ilike.*${s}*`] : [];
  },
  /** Cards whose name contains ANY of these words (an evolution line, a trainer's world). */
  nameHasAny(words: readonly string[]): string[] {
    const ws = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
    if (!ws.length) return [];
    return [`or=(${ws.map((w) => `name.ilike.${quoted(`*${w}*`)}`).join(',')})`];
  },
  /** Cards by this illustrator (Same artist). */
  artist(name: string): string[] {
    const a = name.trim();
    return a ? [`illustrator=ilike.${a}`] : [];
  },
  /** Cards carrying this energy type (Color by type). */
  type(t: string): string[] {
    const v = t.trim();
    return v ? [`types=cs.{${quoted(v)}}`] : [];
  },
};

/**
 * The `/cards?...` path for one window of a filter: ids only, standard footprint, browse-visible,
 * the language bound when there is one. Values are URL-encoded; the PostgREST grammar characters
 * (`*`, `(`, `)`, `,`, `{`, `}`, `.`, `"`) are put back so the server can parse them.
 */
export function cardsQuery(filters: readonly string[], window: Window, languages?: readonly CardLanguage[]): string {
  const parts = ['select=id', 'jumbo=is.false', 'browse_visible=is.true', ...filters];
  if (languages?.length) parts.push(`language=in.(${languages.join(',')})`);
  parts.push(`order=${window.order}`, `limit=${window.limit}`);
  const keep: Record<string, string> = { '%2A': '*', '%28': '(', '%29': ')', '%2C': ',', '%7B': '{', '%7D': '}', '%22': '"' };
  return `/cards?${parts
    .map((p) => {
      const i = p.indexOf('=');
      const value = encodeURIComponent(p.slice(i + 1)).replace(/%2A|%28|%29|%2C|%7B|%7D|%22/g, (m) => keep[m]);
      return `${p.slice(0, i)}=${value}`;
    })
    .join('&')}`;
}

/** Ids already placed on the page, the seed among them, reading order. */
export function idsOnPage(page: DemoPage): string[] {
  return [...page.slots]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((s) => s.cardId)
    .filter((id): id is string => !!id);
}

/**
 * Which Fill page methods a guest is offered, wow first (docs/GUEST-FILL-PLAN.md section 2). The
 * palette method is paid and names PRO, Friends needs the whole catalogue to find partners, and the
 * colour sheet is not the card page a visitor came for; everything else runs on the slice.
 */
export const GUEST_FILL_METHODS: readonly string[] = ['samePokemon', 'evolutionLine', 'sameArtist', 'colorType', 'trainerPage', 'moreLikeThis', 'sameScene'];

/** Which Complete page fills a guest is offered: the palette needs the on-device colour index, which a guest never loads. */
export const GUEST_COMPLETE_METHODS: readonly string[] = ['theme', 'similar', 'type', 'artist', 'lines'];

/**
 * COLOUR FAMILIES (MIC-017 piece 8, owner 2026-11-11): Discover's swatches find binders whose
 * PAGES show a lot of one colour, not binders holding many cards with a speck of it.
 *
 * Every card in the palette index has three dominant art colours, each with a coverage weight
 * (0..1). A colour belongs to one family by its lightness and hue (CIELAB as LCh): black is any
 * colour with L* at most 28 (navy and charcoal count, mid greys do not); a colour with chroma under
 * 18 is grey and in no swatch's family; the rest fall into hue bins. A card's SHARE of a family is
 * the sum of the weights of its colours in that family, so a card whose art is two thirds black
 * has a black share near 0.67.
 *
 * A page's share is the average over its filled pockets (search_binder_pages_by_cards). It matches
 * at PAGE_MATCH_SHARE: about a third of the art across the page in that colour, which with three
 * clusters per card means it is the page's leading colour. Calibrated on 1,879 live public pages
 * (2026-11-10): black at 0.35 matched 21 pages in 16 binders (0.30: 38 in 27, 0.40: 7 in 6).
 */
import type { Lab } from 'tcgscan-browse';

export type ColourFamily = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'black';

/** A page matches a colour when at least this much of its pockets' art is that colour. */
export const PAGE_MATCH_SHARE = 0.35;
/** A page needs this many cards before it can stand for a colour. */
export const PAGE_MATCH_MIN_CARDS = 3;
/** Cards below this share are not sent: they barely move a page's average. */
const CARD_MIN_SHARE = 0.2;

/** The family one palette colour belongs to, or null for greys and near-whites. */
export function colourFamily(c: { L: number; a: number; b: number }): ColourFamily | null {
  if (c.L <= 28) return 'black';
  const chroma = Math.hypot(c.a, c.b);
  if (chroma < 18) return null;
  let h = (Math.atan2(c.b, c.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  if (h >= 330 || h < 20) return c.L >= 55 ? 'pink' : 'red';
  if (h < 50) return c.L >= 72 && chroma < 40 ? 'pink' : 'red';
  if (h < 75) return 'orange';
  if (h < 105) return 'yellow';
  if (h < 190) return 'green';
  if (h < 300) return 'blue';
  return h >= 315 && c.L >= 55 ? 'pink' : 'purple';
}

/** How much of one card's art (its weighted palette) is in `family`, 0..1. */
export function familyShare(colours: readonly Lab[], family: ColourFamily): number {
  let s = 0;
  for (const c of colours) if (colourFamily(c) === family) s += c.w;
  return Math.min(1, s);
}

/** The palette index's surface this module needs (ColorIndex from tcgscan-browse). */
export interface PaletteIndex {
  searchByColor(pick: { L: number; a: number; b: number }, region: 'art', topN: number, lambda: number): { id: string }[];
  colors(id: string, region: 'art'): Lab[];
}

/**
 * Every card in the given indexes whose art is at least CARD_MIN_SHARE `family`, with its share.
 * searchByColor with no cap is used only as the list of every id the index holds.
 */
export function cardsInFamily(
  indexes: readonly PaletteIndex[],
  family: ColourFamily,
  pick: { L: number; a: number; b: number },
): { ids: string[]; shares: number[] } {
  const ids: string[] = [];
  const shares: number[] = [];
  for (const index of indexes) {
    for (const { id } of index.searchByColor(pick, 'art', Number.MAX_SAFE_INTEGER, 0)) {
      const s = familyShare(index.colors(id, 'art'), family);
      if (s >= CARD_MIN_SHARE) {
        ids.push(id);
        shares.push(Math.round(s * 100) / 100);
      }
    }
  }
  return { ids, shares };
}

/**
 * The post-it's text (owner, 2026-11-11: show all the numbers). Runs collapse into ranges
 * ("p. 3–5, 9, 12"); only when that is wider than the tag can be does the tail become "+N".
 * `maxChars` is the tag's width in characters (the caller divides by the font's character width).
 */
export function pagesTagText(pages: readonly number[], maxChars = Infinity): string {
  const sorted = [...new Set(pages)].sort((x, y) => x - y);
  const parts: { text: string; count: number }[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(j > i ? { text: `${sorted[i]}–${sorted[j]}`, count: j - i + 1 } : { text: String(sorted[i]), count: 1 });
    i = j + 1;
  }
  const join = (n: number) => `p. ${parts.slice(0, n).map((p) => p.text).join(', ')}`;
  if (join(parts.length).length <= maxChars) return join(parts.length);
  for (let n = parts.length - 1; n >= 1; n -= 1) {
    const rest = parts.slice(n).reduce((t, p) => t + p.count, 0);
    const text = `${join(n)} +${rest}`;
    if (text.length <= maxChars) return text;
  }
  return `${join(1)} +${parts.slice(1).reduce((t, p) => t + p.count, 0)}`;
}

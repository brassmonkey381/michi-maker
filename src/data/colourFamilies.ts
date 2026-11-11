/**
 * COLOUR FAMILIES (MIC-017 piece 8, owner 2026-11-11): Discover's swatches find binders whose
 * PAGES show a lot of one colour, not binders holding many cards with a speck of it.
 *
 * Every card in the palette index has three dominant art colours, each with a coverage weight
 * (0..1). v2 (owner, 2026-11-11: "why do some of the colors have no results (purple and pink?)",
 * "I like lavender and pastel pink", "maybe a page can land in both?"):
 *
 *  - FAMILIES BY THE HUE PEOPLE SEE. A colour is named by its HSV hue (Lab converted to sRGB),
 *    not its CIELAB hue: in Lab pure blue sits near 306 degrees, so violet art was counted blue.
 *    Centres: red 0, orange 28, yellow 52, green 125, blue 215, purple 275, pink 322 (magenta).
 *  - SOFT EDGES. A colour in the outer quarter of the span between two centres counts for both, in
 *    proportion (violet is part blue, part purple); nearer a centre it counts fully for that one.
 *  - SOFT COLOURS IN, GREYS OUT. The saturation floor is lower for light colours (S >= 0.13 when
 *    V >= 0.8, 0.20 when V >= 0.55, 0.28 below), so lavender, pastel pink, baby blue, mint and
 *    butter yellow join their families; near-greys stay out. Black is L* <= 28 or V <= 0.2.
 *  - EVERY SWATCH ON ITS OWN. A page has a share of every family; it can match blue AND purple.
 *
 * A card's SHARE of a family is the weighted sum of its colours' membership. A page's share is the
 * average over its filled pockets (search_binder_pages_by_cards); it matches at that family's bar.
 *
 * v3 STRICTER (owner, 2026-11-11: "many of these results are not PINK"). v2 let one or two pinkish
 * cards carry a blue or orange page past a 0.15 bar, and its soft edges counted the purple Psychic
 * energy as half pink. Now: (1) the shared zone between two centres is the middle 30% of the span,
 * not the middle half, so violet stays purple and crimson stays red; (2) a card counts toward a
 * family only when that family is its first or second biggest; (3) purple, pink, green and red
 * match at 0.25, about three strongly coloured cards in nine; (4) no top-up of near pages. Fewer
 * binders per swatch, all of them that colour.
 *
 * PINK IS LIGHT, PLUM IS PURPLE. The palettes showed why purple pages came back as pink: dark
 * magenta, plum and mauve (#985d7f, #973480) and the Psychic energy's lilac (#ad73a9) all sit at
 * hue 300-330, the old pink centre. People call those purple. So from hue 290 to 345 a colour is
 * pink only when it is light (V >= 0.7), else purple; from 345 round to red, a light, soft colour
 * (V >= 0.8, S <= 0.5) is pink (rose), the rest red.
 */
import type { Lab } from 'tcgscan-browse';

export type ColourFamily = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'black';

/**
 * PER-SWATCH BARS. Purple and pink are 2.2% and 2.1% of all palette colour, blue 15.7%, so one bar
 * for all never let purple or pink through. Each bar is three times its family's average share,
 * held between 0.15 and 0.35; black stays at 0.35 (the owner asked for heavy black). Calibrated on
 * 1,879 live public pages (2026-11-11): pages / binders at the bar, red 87/59, orange 60/46,
 * yellow 43/31, green 118/62, blue 199/77, purple 23/18, pink 23/20, black 21/16.
 */
export const PAGE_MATCH_BAR: Record<ColourFamily, number> = {
  red: 0.25,
  orange: 0.35,
  yellow: 0.35,
  green: 0.25,
  blue: 0.35,
  purple: 0.25,
  pink: 0.25,
  black: 0.35,
};
/** Fewer binders than this at the bar: the closest pages, down to PAGE_TOP_UP_SHARE, follow. */
export const PAGE_MIN_RESULTS = 8;
export const PAGE_TOP_UP_SHARE = 0.1;
/** A page needs this many cards before it can stand for a colour. */
export const PAGE_MATCH_MIN_CARDS = 3;
/**
 * A page's share is averaged over at least this many pockets, so a page with three cards on it
 * cannot stand for a colour on one strongly coloured card (search_binder_pages_by_cards p_floor).
 */
export const PAGE_SHARE_FLOOR = 6;
/** Cards below this share are not sent: they barely move a page's average. */
const CARD_MIN_SHARE = 0.1;

/** sRGB (0..1) from CIELAB (D65). */
function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.95047 * f(fx);
  const Y = f(fy);
  const Z = 1.08883 * f(fz);
  const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  const g = lin.map((c) => Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  return [g[0], g[1], g[2]];
}

/** Hue (degrees), saturation and value of a Lab colour, as people would read it on screen. */
export function hsvOf(c: { L: number; a: number; b: number }): { h: number; s: number; v: number } {
  const [r, g, b] = labToRgb(c.L, c.a, c.b);
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: mx ? d / mx : 0, v: mx };
}

/** From hue 290 to 345, lighter than this reads pink, darker reads purple. */
const PINK_MIN_V = 0.7;

const CENTRES: readonly [ColourFamily, number][] = [
  ['red', 0],
  ['orange', 28],
  ['yellow', 52],
  ['green', 125],
  ['blue', 215],
  ['purple', 275],
  ['pink', 322],
  ['red', 360],
];

/** How much one palette colour belongs to each family (0..1 each; greys belong to none). */
export function colourMemberships(c: { L: number; a: number; b: number }): Partial<Record<ColourFamily, number>> {
  const { h, s, v } = hsvOf(c);
  if (c.L <= 28 || v <= 0.2) return { black: 1 };
  const floor = v >= 0.8 ? 0.13 : v >= 0.55 ? 0.2 : 0.28;
  if (s < floor) return {};
  if (h >= 290 && h < 345) return v >= PINK_MIN_V ? { pink: 1 } : { purple: 1 };
  if (h >= 345 || h < 8) return v >= 0.8 && s <= 0.5 ? { pink: 1 } : { red: 1 };
  if (h >= 255 && h < 290) return { purple: 1 };
  for (let i = 0; i < CENTRES.length - 1; i += 1) {
    const [fa, ha] = CENTRES[i];
    const [fb, hb] = CENTRES[i + 1];
    if (h < ha || h > hb) continue;
    const t = (h - ha) / (hb - ha);
    // Full membership in the outer 35% of the span on each side; shared only in the middle 30%.
    const near = (w: number) => Math.min(1, Math.max(0, (w - 0.35) / 0.3));
    const out: Partial<Record<ColourFamily, number>> = {};
    out[fa] = near(1 - t);
    out[fb] = (out[fb] ?? 0) + near(t);
    return out;
  }
  return {};
}

/** The family one palette colour belongs to most, or null for greys. */
export function colourFamily(c: { L: number; a: number; b: number }): ColourFamily | null {
  let best: ColourFamily | null = null;
  let top = 0;
  for (const [k, w] of Object.entries(colourMemberships(c)) as [ColourFamily, number][]) {
    if (w > top) {
      top = w;
      best = k;
    }
  }
  return best;
}

/** How much of one card's art (its weighted palette) is in `family`, 0..1. */
export function familyShare(colours: readonly Lab[], family: ColourFamily): number {
  const all: Partial<Record<ColourFamily, number>> = {};
  for (const c of colours) for (const [k, m] of Object.entries(colourMemberships(c)) as [ColourFamily, number][]) all[k] = (all[k] ?? 0) + c.w * m;
  const mine = all[family] ?? 0;
  // Only a card's first or second family counts: a speck of pink on a blue card is not pink.
  const bigger = Object.values(all).filter((v) => (v ?? 0) > mine).length;
  return bigger >= 2 ? 0 : Math.min(1, mine);
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

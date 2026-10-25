/**
 * THE ART VIEW: a page that shows its cards as their artwork.
 *
 * Every card on a page is a different frame design, and a page of mixed eras reads as five
 * borders before it reads as five pictures. The art view puts the illustration first. Two views,
 * chosen per page (`binder_pages.art_view`), both approved by the owner on 2026-10-24 from
 * rendered mock-ups (scripts/lab/windowed-stock-card.mjs):
 *
 *   window     Each windowed card is cropped to its ART WINDOW, which is laid at the full width of
 *              a plain black stock card with NO rescaling in either direction and never cropped at
 *              the sides, and under it the card's name, a dex line, and series, set, number,
 *              illustrator and year. A full-art card has no window to cut, so it stays as it is.
 *   connected  The bare windows, edge to edge, no pockets and no gaps, so a page whose cards share
 *              one continuing illustration (Saboteri's city, a Pokémon Center skyline) reads as
 *              that illustration. The sheet needs cells of one shape, so the PAGE picks the cut
 *              (connectedCut): a page whose cards are all full art is cut to the ART INSIDE THE
 *              BORDER, whole, so the picture that runs off one full-art card meets the next
 *              (owner, 2026-10-24, the Saboteri promos); any other page cuts every card to the
 *              window, full art included.
 *
 * ONE WINDOW FOR EVERY ERA. The crop is a single rectangle in fractions of the card, measured on
 * thirteen scans from EX-era promos to Mega Evolution: the inner edge of the art sits at x 6.9–8.6%
 * and 91.7–93.3%, y 8.9–10.3% and 46.2–50%, and this is the intersection. It trims up to two
 * percent of art from the widest windows and never shows frame, and one window is what makes the
 * connected sheet line up. A per-set table could claw back the trim; the evolution-stage tab sits
 * inside every modern window and is kept. Cards whose art is neither windowed nor full (V, ex,
 * Radiant, Gold Star) are cut like a windowed card, which is the known gap.
 *
 * PURE: no react-native, so `node --test` reaches all of it.
 */
import type { CatalogCard } from '../lib/catalog.ts';

export type ArtView = 'window' | 'connected';

export const ART_VIEWS: { id: ArtView | 'card'; label: string; blurb: string }[] = [
  { id: 'card', label: 'Full card', blurb: 'The card as it is, frame and all.' },
  { id: 'window', label: 'Art window', blurb: 'The illustration on a plain stock card with the name, set and number.' },
  { id: 'connected', label: 'Connected art', blurb: 'The illustrations edge to edge, for cards that share one picture.' },
];

/** Whatever the column holds, as a view or nothing. An unknown value is the plain page. */
export function normalizeArtView(raw: unknown): ArtView | undefined {
  return raw === 'window' || raw === 'connected' ? raw : undefined;
}

/** The art window as fractions of the card: left, top, right, bottom. */
export const ART_WINDOW = { x0: 0.086, y0: 0.103, x1: 0.917, y1: 0.462 } as const;

/** Card box aspect, height over width. The same 88/63 as binderLayout, kept here so this stays pure. */
const CARD_H_OVER_W = 88 / 63;

/** The window's height over its width, on the card's own proportions. */
export const ART_WINDOW_H_OVER_W =
  ((ART_WINDOW.y1 - ART_WINDOW.y0) * CARD_H_OVER_W) / (ART_WINDOW.x1 - ART_WINDOW.x0);

/**
 * Where to draw the whole card picture so that its window fills a box `boxW` wide: the picture's
 * size, and its offset from the box's top-left (negative, since the window is inside it). The
 * renderer clips to the box. One place for the arithmetic, so a stock card and a connected cell
 * cut the same window.
 */
export function windowPlacement(boxW: number): { width: number; height: number; left: number; top: number } {
  const width = boxW / (ART_WINDOW.x1 - ART_WINDOW.x0);
  const height = width * CARD_H_OVER_W;
  return { width, height, left: -ART_WINDOW.x0 * width, top: -ART_WINDOW.y0 * height };
}

/**
 * THE BORDER OF A FULL-ART CARD, as fractions of the card: the silver band and the rounded corners.
 * Measured on all 34 Saboteri promo scans: the band's median is 4.1% on the left, 3.6% on the
 * right (the scans sit a little to one side) and 2.7% top and bottom, and the cut is half a
 * percent inside that, because the scans vary by a pixel or two and a hairline of band at a seam
 * reads as a crack through the picture (owner, 2026-10-24: "slightly off"). The same cut on every
 * full-art card, as with the window.
 */
export const ART_FULL_TRIM = { left: 0.047, right: 0.042, top: 0.033, bottom: 0.033 } as const;

/** The trimmed full-art card's height over its width. */
export const ART_FULL_H_OVER_W =
  ((1 - ART_FULL_TRIM.top - ART_FULL_TRIM.bottom) * CARD_H_OVER_W) / (1 - ART_FULL_TRIM.left - ART_FULL_TRIM.right);

/** As windowPlacement, for the art inside a full-art card's border. */
export function fullArtPlacement(boxW: number): { width: number; height: number; left: number; top: number } {
  const width = boxW / (1 - ART_FULL_TRIM.left - ART_FULL_TRIM.right);
  const height = width * CARD_H_OVER_W;
  return { width, height, left: -ART_FULL_TRIM.left * width, top: -ART_FULL_TRIM.top * height };
}

/** How a connected sheet cuts its cards: the art window, or the whole art of a full-art card. */
export type ConnectedCut = 'window' | 'full';

/**
 * The cut a connected page uses, from the cards on it: 'full' when every card the catalogue knows
 * is full art, otherwise the window. A page the catalogue has not resolved yet (or an empty page)
 * is the window, so the sheet never jumps from full to window as the catalogue loads a page of
 * windowed cards; it jumps the other way at most once.
 */
export function connectedCut(cards: (Pick<CatalogCard, 'fullArt' | 'fullArtKind'> | undefined)[]): ConnectedCut {
  const known = cards.filter((c): c is NonNullable<typeof c> => !!c);
  return known.length > 0 && known.every(isFullArtCard) ? 'full' : 'window';
}

/** The cell's height over its width for a cut. */
export function connectedCellAspect(cut: ConnectedCut): number {
  return cut === 'full' ? ART_FULL_H_OVER_W : ART_WINDOW_H_OVER_W;
}

/**
 * A card with no window to cut. The catalogue's own flag first (the Full art filter's), then the
 * pipeline's kind for cards the flag has not assessed, exactly as the arranger reads it
 * (arrange.ts artClassOf).
 */
export function isFullArtCard(card: Pick<CatalogCard, 'fullArt' | 'fullArtKind'> | undefined): boolean {
  if (!card) return false;
  if (card.fullArt === true) return true;
  return /^(special_illustration_rare|illustration_rare|named_full_art|measured|double_rare)$/.test(card.fullArtKind ?? '');
}

/** What the stock card says under the window. Blank fields are left out, so a row never reads "SET". */
export interface StockCardText {
  name: string;
  /** "Grass · Stage 2", or less when the catalogue has less. */
  sub: string;
  rows: { label: string; value: string }[];
}

export function stockCardText(card: Pick<CatalogCard, 'name' | 'types' | 'stage' | 'seriesId' | 'setName' | 'number' | 'illustrator' | 'releaseDate'> | undefined, fallbackName = ''): StockCardText {
  if (!card) return { name: fallbackName, sub: '', rows: [] };
  const sub = [card.types?.[0], card.stage].filter((s): s is string => !!s).join(' · ');
  const rows = [
    ['Series', card.seriesId],
    ['Set', card.setName],
    ['Number', card.number],
    ['Illustrator', card.illustrator],
    ['Released', card.releaseDate ? card.releaseDate.slice(0, 4) : ''],
  ]
    .filter(([, v]) => !!v)
    .map(([label, value]) => ({ label, value }));
  return { name: card.name || fallbackName, sub, rows };
}

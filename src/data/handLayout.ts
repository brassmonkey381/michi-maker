/**
 * WHERE THE HAND'S CARDS GO (MIC-017 editor-hand, owner 2026-11-10: "centre the hand, cards as big
 * as possible, spread across the tray, overlapping only as much as needed"). Pure: given how many
 * cards and the space the hand has, picks the row count and card size that make the cards biggest
 * while every card keeps a visible strip to click or drag, then spreads each row across the width.
 */

/** A card's width over its height (63 x 88 mm). */
export const CARD_RATIO = 63 / 88;
/** The least of a card that stays visible beside its neighbour: this many px, or this share of it. */
export const MIN_STRIP_PX = 28;
export const MIN_STRIP_SHARE = 0.28;
/** How much of a card's height shows above the row in front of it. */
export const ROW_SHOW = 0.46;
/** Gap between cards when there is room for them not to overlap at all. */
export const SPREAD_GAP = 8;

export type HandLayout = {
  /** Card indexes per row, front row last. */
  rows: number[][];
  cardW: number;
  cardH: number;
  /** Left edge to left edge of neighbours in a row. */
  stride: number;
  /** Top edge to top edge of neighbouring rows. */
  rowStep: number;
  /** How far odd rows sit to the right (half a stride, like a held hand). */
  offset: number;
  /** The block's full size, to centre it. */
  width: number;
  height: number;
};

const strip = (w: number) => Math.max(MIN_STRIP_PX, Math.round(w * MIN_STRIP_SHARE));

function rowsOf(n: number, r: number): number[][] {
  const per = Math.ceil(n / r);
  const out: number[][] = [];
  for (let i = 0; i < n; i += per) out.push(Array.from({ length: Math.min(per, n - i) }, (_, k) => i + k));
  return out;
}

/** A card shows "comfortably" when at least this share of its width is uncovered. A layout below it
 *  counts its card as SLIVER_PENALTY of its size when layouts are compared (owner via Triage,
 *  2026-11-10: thin slivers are worse than a few more rows). The 28 px / 28% floor always holds. */
export const COMFORT_SHARE = 0.35;
export const SLIVER_PENALTY = 0.65;
/** Tallest a hand card gets, however much room there is. */
export const MAX_CARD_H = 420;

/**
 * @param n cards in the hand
 * @param width px the cards may use (the tray's inner width)
 * @param maxH px the cards may use top to bottom (desktop: what is free below the page)
 * @param maxRows most rows to try
 *
 * Tries 1 to maxRows rows, each with the biggest card that fits both ways, and picks the biggest
 * card (owner, 2026-11-10: "let the size of the images scale up/down"), counting a layout whose
 * cards show less than COMFORT_SHARE of themselves at SLIVER_PENALTY. Fewer rows win a tie. (Only
 * filtering for comfort picked one row of 16 px cards in a 620 px column: tiny cards barely overlap.)
 */
export function handLayout(n: number, width: number, maxH: number, maxRows = 4): HandLayout {
  const empty: HandLayout = { rows: [], cardW: 0, cardH: 0, stride: 0, rowStep: 0, offset: 0, width: 0, height: 0 };
  if (n <= 0 || width <= 0 || maxH <= 0) return empty;
  const tried: { L: HandLayout; comfy: boolean; shown: number }[] = [];
  for (let r = 1; r <= Math.min(maxRows, n); r += 1) {
    const rows = rowsOf(n, r);
    if (rows.length !== r) continue; // e.g. 4 cards in 3 rows comes out as 2 rows; tried already
    const per = rows[0].length;
    // Tallest card the height allows, then shrink until the widest row fits with minimum strips.
    let cardH = Math.min(MAX_CARD_H, Math.floor(maxH / (1 + (r - 1) * ROW_SHOW)));
    let cardW = Math.floor(cardH * CARD_RATIO);
    const need = (w: number) => w + (per - 1) * strip(w) + (r > 1 ? strip(w) / 2 : 0);
    while (cardW > 16 && need(cardW) > width) cardW -= 1;
    cardH = Math.round(cardW / CARD_RATIO);
    // Spread: as far apart as the width allows, never more than a small gap.
    const room = width - cardW;
    const stride = per > 1 ? Math.min(cardW + SPREAD_GAP, Math.floor(room / (per - 1 + (r > 1 ? 0.5 : 0)))) : 0;
    const offset = r > 1 ? Math.round(stride / 2) : 0;
    const rowStep = Math.round(cardH * ROW_SHOW);
    const shown = per > 1 ? Math.min(stride, cardW) : cardW;
    tried.push({
      L: { rows, cardW, cardH, stride, rowStep, offset, width: cardW + (per - 1) * stride + offset, height: cardH + (r - 1) * rowStep },
      comfy: shown >= cardW * COMFORT_SHARE,
      shown,
    });
  }
  if (!tried.length) return empty;
  const score = (t: (typeof tried)[number]) => t.L.cardW * (t.comfy ? 1 : SLIVER_PENALTY);
  return tried.reduce((a, b) => (score(b) > score(a) ? b : a)).L;
}

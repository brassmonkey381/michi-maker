/**
 * Placeholder-card PDF export — a print-ready, cut-ready sheet of gray placeholder cards for
 * every card pocket in a binder. Each placeholder is REAL CARD SIZE (2.5" × 3.5" — it must
 * slide into a pocket, so it's cut to card size, not the 2.75" × 3.75" pocket opening) and
 * carries its binder location (page + row/col) plus the card's name / set / number, so when
 * the real card arrives the owner knows exactly which pocket it swaps into.
 *
 * Layout: US Letter (8.5" × 11"), 3 × 3 tiles per sheet = one binder page per printed sheet.
 * Cut lines run edge-to-edge (guillotine-friendly). Page 1 is a cover with instructions and
 * a 1-inch calibration square — home printers love to "fit to page", which would shrink the
 * cards; the square lets the user verify 100% scale before cutting a whole run.
 *
 * All geometry is in PDF points (72 pt = 1 inch), so the physical sizes are exact.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

import type { DemoBinder } from '@/data/binderTypes';

// ---- physical geometry (points; 72 pt = 1 in) ------------------------------
const PT = 72;
const SHEET_W = 8.5 * PT; // US Letter
const SHEET_H = 11 * PT;
const CARD_W = 2.5 * PT; // real card size — fits a pocket sleeved or bare
const CARD_H = 3.5 * PT;
const COLS = 3;
const ROWS = 3;
const GRID_W = COLS * CARD_W;
const GRID_H = ROWS * CARD_H;
const MARGIN_X = (SHEET_W - GRID_W) / 2; // 36 pt (0.5")
const MARGIN_Y = (SHEET_H - GRID_H) / 2; // 18 pt (0.25")
const TILES_PER_SHEET = COLS * ROWS;

// ---- colors (ink-friendly grays) -------------------------------------------
const FILL = rgb(0.93, 0.93, 0.93);
const BAND = rgb(0.82, 0.82, 0.82);
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.42, 0.42, 0.42);
const GUIDE = rgb(0.7, 0.7, 0.7);

/** What each placeholder tile says. One tile per card pocket, in reading order. */
export interface PlaceholderTile {
  /** 1-indexed binder page number. */
  page: number;
  /** 1-indexed pocket coordinates (top-left cell for multi-pocket cards). */
  row: number;
  col: number;
  /** "2×2" when the card spans multiple pockets (jumbo), '' for a normal card. */
  span: string;
  name: string;
  setName: string;
  number: string;
}

/** Card metadata lookup the builder needs — satisfied by the kit catalog's `getCard`. */
export interface CardMetaSource {
  getCard(cardId: string): { name: string; setName: string; number: string } | undefined;
}

/**
 * Flatten a binder into placeholder tiles: every `card` slot, page by page in reading order.
 * Artwork panels and tonal inserts aren't collectibles, so they don't get placeholders.
 */
export function placeholderTiles(binder: DemoBinder, cards: CardMetaSource): PlaceholderTile[] {
  const tiles: PlaceholderTile[] = [];
  binder.pages.forEach((page, pageIndex) => {
    const slots = [...page.slots]
      .filter((s) => s.type === 'card' && s.cardId)
      .sort((a, b) => a.row - b.row || a.col - b.col);
    for (const slot of slots) {
      const card = cards.getCard(slot.cardId!);
      tiles.push({
        page: pageIndex + 1,
        row: slot.row + 1,
        col: slot.col + 1,
        span: slot.rowSpan > 1 || slot.colSpan > 1 ? `${slot.colSpan}×${slot.rowSpan}` : '',
        name: card?.name ?? 'Unknown card',
        setName: card?.setName ?? '',
        number: card?.number ?? '',
      });
    }
  });
  return tiles;
}

/** Sheets the tile run needs (excluding the cover). */
export function sheetsFor(tileCount: number): number {
  return Math.ceil(tileCount / TILES_PER_SHEET);
}

/**
 * WinAnsi-safe text: the PDF standard fonts can't encode every glyph a card name might carry
 * (Nidoran's ♀/♂, stars). Swap the known offenders, then drop anything else outside Latin-1 +
 * the WinAnsi typographic extras — a placeholder label beats a hard encode error.
 */
function sanitize(text: string): string {
  return text
    .replace(/♀/g, ' F')
    .replace(/♂/g, ' M')
    .replace(/[★☆]/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…]/g, '')
    .trim();
}

/** Greedy word-wrap to `maxWidth`, at most `maxLines` (last line ellipsised if truncated). */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]}…`;
    while (font.widthOfTextAtSize(last, size) > maxWidth && last.length > 1) {
      last = `${last.slice(0, -2)}…`;
    }
    kept[maxLines - 1] = last;
    return kept;
  }
  return lines;
}

function drawCentered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = INK, cx = SHEET_W / 2) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color });
}

/** Build the full PDF: cover (instructions + calibration square) then the tile sheets. */
export async function buildPlaceholderPdf(binder: DemoBinder, cards: CardMetaSource): Promise<Uint8Array> {
  const tiles = placeholderTiles(binder, cards);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle(`${sanitize(binder.title)} - placeholders`);

  drawCover(doc.addPage([SHEET_W, SHEET_H]), sanitize(binder.title), tiles.length, bold, regular);

  for (let i = 0; i < tiles.length; i += TILES_PER_SHEET) {
    const page = doc.addPage([SHEET_W, SHEET_H]);
    drawCutGrid(page);
    tiles.slice(i, i + TILES_PER_SHEET).forEach((tile, j) => {
      const col = j % COLS;
      const row = Math.floor(j / COLS);
      // PDF origin is bottom-left; tiles read top-left → bottom-right.
      const x = MARGIN_X + col * CARD_W;
      const y = SHEET_H - MARGIN_Y - (row + 1) * CARD_H;
      drawTile(page, tile, x, y, bold, regular);
    });
    const footer = `${sanitize(binder.title)} · sheet ${Math.floor(i / TILES_PER_SHEET) + 1} of ${sheetsFor(tiles.length)}`;
    drawCentered(page, footer, 6, regular, 7, MUTED);
  }

  return doc.save();
}

/** Edge-to-edge cut lines along every tile boundary — straight guillotine cuts. */
function drawCutGrid(page: PDFPage) {
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: GUIDE, dashArray: [3, 3] });
  for (let c = 0; c <= COLS; c += 1) {
    const x = MARGIN_X + c * CARD_W;
    line(x, 0, x, SHEET_H);
  }
  for (let r = 0; r <= ROWS; r += 1) {
    const y = SHEET_H - MARGIN_Y - r * CARD_H;
    line(0, y, SHEET_W, y);
  }
}

/** One placeholder card: location band up top, then name / set / number, then an "acquired" box. */
function drawTile(page: PDFPage, tile: PlaceholderTile, x: number, y: number, bold: PDFFont, regular: PDFFont) {
  const cx = x + CARD_W / 2;
  const pad = 10;
  const innerW = CARD_W - pad * 2;

  page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, color: FILL });

  // Location band — the "where does this go" headline.
  const bandH = 34;
  page.drawRectangle({ x, y: y + CARD_H - bandH, width: CARD_W, height: bandH, color: BAND });
  drawCentered(page, `PAGE ${tile.page}`, y + CARD_H - 15, bold, 11, INK, cx);
  const loc = `Row ${tile.row} · Col ${tile.col}${tile.span ? ` · ${tile.span}` : ''}`;
  drawCentered(page, loc, y + CARD_H - 28, regular, 8.5, INK, cx);

  // Card identity, centered in the body.
  let cursor = y + CARD_H - bandH - 26;
  for (const line of wrap(sanitize(tile.name), bold, 12, innerW, 3)) {
    drawCentered(page, line, cursor, bold, 12, INK, cx);
    cursor -= 15;
  }
  cursor -= 4;
  for (const line of wrap(sanitize(tile.setName), regular, 9, innerW, 2)) {
    drawCentered(page, line, cursor, regular, 9, MUTED, cx);
    cursor -= 12;
  }
  if (tile.number) {
    drawCentered(page, `#${sanitize(tile.number)}`, cursor - 2, regular, 9, MUTED, cx);
  }

  // "Acquired" checkbox at the foot — tick it off as the real cards come in.
  const boxSize = 9;
  const label = 'acquired';
  const labelW = regular.widthOfTextAtSize(label, 8);
  const groupX = cx - (boxSize + 5 + labelW) / 2;
  page.drawRectangle({
    x: groupX,
    y: y + 16,
    width: boxSize,
    height: boxSize,
    borderColor: MUTED,
    borderWidth: 0.8,
  });
  page.drawText(label, { x: groupX + boxSize + 5, y: y + 17.5, size: 8, font: regular, color: MUTED });
}

/** Cover sheet: what this is, how to print it true-to-size, and the 1-inch calibration square. */
function drawCover(page: PDFPage, binderTitle: string, tileCount: number, bold: PDFFont, regular: PDFFont) {
  let y = SHEET_H - 120;
  drawCentered(page, 'Binder placeholders', y, bold, 26);
  y -= 26;
  drawCentered(page, binderTitle, y, regular, 14, MUTED);
  y -= 20;
  drawCentered(
    page,
    `${tileCount} placeholder card${tileCount === 1 ? '' : 's'} · ${sheetsFor(tileCount)} sheet${sheetsFor(tileCount) === 1 ? '' : 's'}`,
    y,
    regular,
    11,
    MUTED,
  );

  y -= 56;
  const steps = [
    'Print at 100% scale (“Actual size”) — NOT “Fit to page”.',
    'Check the calibration square below: it must measure exactly 1 inch (2.54 cm).',
    'Cut along the dashed lines — every placeholder comes out at real card size, 2.5" × 3.5".',
    'Slide each placeholder into the binder pocket printed at its top (page, row, column).',
    'When you get the real card, the placeholder in its pocket tells you where it goes — swap it in.',
  ];
  const left = MARGIN_X + 24;
  steps.forEach((text, i) => {
    page.drawText(`${i + 1}.`, { x: left, y, size: 11, font: bold, color: INK });
    const lines = wrap(text, regular, 11, GRID_W - 72, 2);
    for (const line of lines) {
      page.drawText(line, { x: left + 20, y, size: 11, font: regular, color: INK });
      y -= 16;
    }
    y -= 8;
  });

  // The 1" × 1" calibration square.
  y -= 30;
  const sq = PT;
  page.drawRectangle({
    x: SHEET_W / 2 - sq / 2,
    y: y - sq,
    width: sq,
    height: sq,
    borderColor: INK,
    borderWidth: 1,
  });
  drawCentered(page, '1 inch', y - sq / 2 - 4, regular, 9, MUTED);
  drawCentered(page, 'This square must measure exactly 1" × 1" (2.54 cm). If it doesn’t, fix your print scale before cutting.', y - sq - 18, regular, 9, MUTED);

  drawCentered(page, 'michi-maker.com', 40, regular, 9, MUTED);
}

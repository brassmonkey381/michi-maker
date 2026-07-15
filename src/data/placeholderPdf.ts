/**
 * Fill-sheet PDF export — print a binder's pages as cut-ready sheets: gray/green placeholder
 * cards for card pockets, REAL ART pieces for artwork pockets (rights cleared), and solid
 * color tiles for tonal inserts. Every piece is REAL CARD SIZE (2.5" × 3.5" — it must slide
 * into a pocket, so pieces are cut to card size, not the 2.75" × 3.75" pocket opening).
 *
 * Art fidelity (the v2 engine, verified against real binders):
 *  - GAP COMPENSATION: an art region spanning pockets maps onto the assembled physical extent
 *    (pockets + 1/8" webbing between them); each printed piece samples only its pocket's
 *    window, so the mounted picture reads continuous across the dividers.
 *  - GROUP MERGING: adjacent same-image artwork slots (Slice Studio slices, merged 1×2 pairs,
 *    legacy spans) join into one physical region when their cells form a rectangle and their
 *    crops tile it — so gap compensation spans the whole picture, not just single slots.
 *  - TRANSFORMS: quarter-turn rotation + mirror flips reproduce the app's rendering exactly
 *    (crop windows live in TRANSFORMED image space; flips apply before rotation) via a PDF
 *    transformation matrix.
 *
 * Layout: US Letter, 3 × 3 tiles per sheet, edge-to-edge dashed guillotine cut lines, margin
 * rulers (cumulative inches at every cut), and a cover with instructions + a 1-inch
 * calibration square — home printers love "fit to page", which would shrink the pieces.
 *
 * All geometry is in PDF points (72 pt = 1 inch), so the physical sizes are exact.
 */
import {
  clip,
  closePath,
  concatTransformationMatrix,
  endPath,
  lineTo,
  moveTo,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
} from 'pdf-lib';

import type { DemoBinder, DemoSlot, ImageTransform } from '@/data/binderTypes';
import type { ArtLoader, LoadedArt } from '@/data/fillSheetArt';

// ---- physical geometry (points; 72 pt = 1 in) ------------------------------
const PT = 72;
const SHEET_W = 8.5 * PT; // US Letter
const SHEET_H = 11 * PT;
const CARD_W = 2.5 * PT; // real card size — fits a pocket sleeved or bare
const CARD_H = 3.5 * PT;
/** Physical webbing between pockets on a side-load page (Ultra Pro / Vault X ballpark). */
const POCKET_GAP = 0.125 * PT;
const COLS = 3;
const ROWS = 3;
const GRID_W = COLS * CARD_W;
const GRID_H = ROWS * CARD_H;
const MARGIN_X = (SHEET_W - GRID_W) / 2; // 36 pt (0.5")
const MARGIN_Y = (SHEET_H - GRID_H) / 2; // 18 pt (0.25")
const TILES_PER_SHEET = COLS * ROWS;

// ---- colors (ink-friendly grays; soft green for owned cards) ---------------
const FILL = rgb(0.93, 0.93, 0.93);
const BAND = rgb(0.82, 0.82, 0.82);
const FILL_OWNED = rgb(0.87, 0.94, 0.87);
const BAND_OWNED = rgb(0.71, 0.85, 0.71);
const OWNED_INK = rgb(0.16, 0.42, 0.2);
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.42, 0.42, 0.42);
const GUIDE = rgb(0.7, 0.7, 0.7);
const WHITE = rgb(1, 1, 1);

// ---- tiles ------------------------------------------------------------------

export interface CardTile {
  kind: 'card';
  page: number; // 1-indexed binder page
  row: number; // 1-indexed pocket coordinates
  col: number;
  span: string; // '2×2' for jumbos, '' for normal
  name: string;
  setName: string;
  number: string;
  owned: boolean;
}

/** One physical picture: same image + transform, cells forming a rectangle, crops tiling it. */
interface ArtGroup {
  imageUrl: string;
  transform?: ImageTransform;
  fit: 'cover' | 'contain';
  row: number; // 0-indexed top-left cell (page coords)
  col: number;
  R: number; // cells tall / wide
  C: number;
  crop: { x: number; y: number; w: number; h: number };
}

export interface ArtTile {
  kind: 'art';
  page: number;
  row: number;
  col: number;
  group: ArtGroup;
  i: number; // this piece's cell within the group
  j: number;
}

export interface InsertTile {
  kind: 'insert';
  page: number;
  row: number;
  col: number;
  color: string;
}

export type FillTile = CardTile | ArtTile | InsertTile;

export interface FillCounts {
  cards: number;
  ownedCards: number;
  art: number;
  inserts: number;
  total: number;
}

/** Card metadata lookup the builder needs — satisfied by the kit catalog's `getCard`. */
export interface CardMetaSource {
  getCard(cardId: string): { name: string; setName: string; number: string } | undefined;
}

const transformKey = (t?: ImageTransform) => (t ? `${t.rot}|${t.flipH ? 1 : 0}|${t.flipV ? 1 : 0}` : '0|0|0');

/**
 * Merge a page's artwork slots into physical groups (see ArtGroup). Slots that don't cleanly
 * tile a rectangle with the same image+transform fall back to per-slot groups. 'contain'
 * slots always stand alone (they letterbox the whole image inside their own footprint).
 */
function groupArt(slots: DemoSlot[]): ArtGroup[] {
  const byKey = new Map<string, DemoSlot[]>();
  for (const s of slots) {
    if (s.imageFit === 'contain') {
      byKey.set(`contain-${s.id}`, [s]);
      continue;
    }
    const key = `${s.imageUrl}#${transformKey(s.imageTransform)}`;
    const list = byKey.get(key) ?? [];
    list.push(s);
    byKey.set(key, list);
  }
  const groups: ArtGroup[] = [];
  for (const list of byKey.values()) {
    // Two placements of the SAME image on one page (e.g. a banner up top and a detail pocket
    // below) must not fuse — split the key-group into 4-adjacency connected components first,
    // then try to merge each component into one region.
    for (const component of connectedComponents(list)) {
      groups.push(...mergeComponent(component));
    }
  }
  return groups;
}

/** Partition slots into connected components (slots touch when any of their cells are 4-adjacent). */
function connectedComponents(slots: DemoSlot[]): DemoSlot[][] {
  const cellOwner = new Map<string, number>();
  slots.forEach((s, idx) => {
    for (let i = 0; i < s.rowSpan; i += 1) {
      for (let j = 0; j < s.colSpan; j += 1) cellOwner.set(`${s.row + i},${s.col + j}`, idx);
    }
  });
  const parent = slots.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (const [key, idx] of cellOwner) {
    const [r, c] = key.split(',').map(Number);
    for (const [nr, nc] of [[r + 1, c], [r, c + 1]] as const) {
      const other = cellOwner.get(`${nr},${nc}`);
      if (other !== undefined && other !== idx) union(idx, other);
    }
  }
  const byRoot = new Map<number, DemoSlot[]>();
  slots.forEach((s, i) => {
    const root = find(i);
    const list = byRoot.get(root) ?? [];
    list.push(s);
    byRoot.set(root, list);
  });
  return [...byRoot.values()];
}

/**
 * Merge one connected component into physical regions. Slots that came from ONE slicing
 * placement share a *virtual grid*: per-cell crop size (crop / span) and a common grid
 * origin (crop.x − col·cellW, crop.y − row·cellH). Cluster on that signature — it cleanly
 * separates two different placements of the same image even when they touch — then a
 * cluster whose cells form a filled rectangle merges into one region; anything else prints
 * per-slot (each piece still uses its own exact crop, just without cross-slot gap comp).
 */
function mergeComponent(list: DemoSlot[]): ArtGroup[] {
  const byGrid = new Map<string, DemoSlot[]>();
  for (const s of list) {
    const crop = s.imageCrop ?? { x: 0, y: 0, w: 1, h: 1 };
    const cw = crop.w / s.colSpan;
    const ch = crop.h / s.rowSpan;
    const gx = crop.x - s.col * cw;
    const gy = crop.y - s.row * ch;
    const key = [cw, ch, gx, gy].map((v) => v.toFixed(3)).join('|');
    const bucket = byGrid.get(key) ?? [];
    bucket.push(s);
    byGrid.set(key, bucket);
  }
  const groups: ArtGroup[] = [];
  for (const cluster of byGrid.values()) {
    const cells = new Set<string>();
    let minR = Infinity, maxR = -1, minC = Infinity, maxC = -1;
    let bx = 1, by = 1, bx2 = 0, by2 = 0;
    for (const s of cluster) {
      const crop = s.imageCrop ?? { x: 0, y: 0, w: 1, h: 1 };
      for (let i = 0; i < s.rowSpan; i += 1) {
        for (let j = 0; j < s.colSpan; j += 1) {
          cells.add(`${s.row + i},${s.col + j}`);
        }
      }
      minR = Math.min(minR, s.row); maxR = Math.max(maxR, s.row + s.rowSpan);
      minC = Math.min(minC, s.col); maxC = Math.max(maxC, s.col + s.colSpan);
      bx = Math.min(bx, crop.x); by = Math.min(by, crop.y);
      bx2 = Math.max(bx2, crop.x + crop.w); by2 = Math.max(by2, crop.y + crop.h);
    }
    const R = maxR - minR, C = maxC - minC;
    const base = cluster[0];
    if (cells.size === R * C) {
      groups.push({
        imageUrl: base.imageUrl!,
        transform: base.imageTransform,
        fit: base.imageFit === 'contain' ? 'contain' : 'cover',
        row: minR, col: minC, R, C,
        crop: { x: bx, y: by, w: bx2 - bx, h: by2 - by },
      });
    } else {
      for (const s of cluster) {
        groups.push({
          imageUrl: s.imageUrl!,
          transform: s.imageTransform,
          fit: s.imageFit === 'contain' ? 'contain' : 'cover',
          row: s.row, col: s.col, R: s.rowSpan, C: s.colSpan,
          crop: s.imageCrop ?? { x: 0, y: 0, w: 1, h: 1 },
        });
      }
    }
  }
  return groups;
}

/**
 * Flatten a binder into printable tiles: one piece per pocket, pages in order, reading order
 * within a page. Card pockets get placeholders; artwork pockets get art pieces; inserts get
 * color tiles. `ownedIds` (card ids in the user's collection) tints those placeholders green.
 */
export function collectFillTiles(
  binder: DemoBinder,
  cards: CardMetaSource,
  ownedIds?: ReadonlySet<string>,
): { tiles: FillTile[]; counts: FillCounts } {
  const tiles: FillTile[] = [];
  binder.pages.forEach((page, pageIndex) => {
    const byCell = new Map<string, FillTile>();
    for (const group of groupArt(page.slots.filter((s) => s.type === 'artwork' && s.imageUrl))) {
      for (let i = 0; i < group.R; i += 1) {
        for (let j = 0; j < group.C; j += 1) {
          byCell.set(`${group.row + i},${group.col + j}`, {
            kind: 'art', page: pageIndex + 1, row: group.row + i + 1, col: group.col + j + 1,
            group, i, j,
          });
        }
      }
    }
    for (const slot of page.slots) {
      if (slot.type === 'card' && slot.cardId) {
        const card = cards.getCard(slot.cardId);
        byCell.set(`${slot.row},${slot.col}`, {
          kind: 'card', page: pageIndex + 1, row: slot.row + 1, col: slot.col + 1,
          span: slot.rowSpan > 1 || slot.colSpan > 1 ? `${slot.colSpan}×${slot.rowSpan}` : '',
          name: card?.name ?? 'Unknown card',
          setName: card?.setName ?? '',
          number: card?.number ?? '',
          owned: ownedIds?.has(slot.cardId) ?? false,
        });
      } else if (slot.type === 'insert' && slot.insertColor) {
        // Spanning inserts print one card-size color piece per covered pocket.
        for (let i = 0; i < slot.rowSpan; i += 1) {
          for (let j = 0; j < slot.colSpan; j += 1) {
            byCell.set(`${slot.row + i},${slot.col + j}`, {
              kind: 'insert', page: pageIndex + 1, row: slot.row + i + 1, col: slot.col + j + 1,
              color: slot.insertColor,
            });
          }
        }
      }
    }
    for (let r = 0; r < page.rows; r += 1) {
      for (let c = 0; c < page.cols; c += 1) {
        const t = byCell.get(`${r},${c}`);
        if (t) tiles.push(t);
      }
    }
  });
  const counts: FillCounts = {
    cards: tiles.filter((t) => t.kind === 'card').length,
    ownedCards: tiles.filter((t) => t.kind === 'card' && t.owned).length,
    art: tiles.filter((t) => t.kind === 'art').length,
    inserts: tiles.filter((t) => t.kind === 'insert').length,
    total: tiles.length,
  };
  return { tiles, counts };
}

/** Sheets the tile run needs (excluding the cover). */
export function sheetsFor(tileCount: number): number {
  return Math.ceil(tileCount / TILES_PER_SHEET);
}

// ---- text helpers -----------------------------------------------------------

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

/** Hostname of an art URL, for the sheet-footer attribution. */
function artHost(url: string): string {
  const m = /^https?:\/\/([^/]+)/.exec(url);
  return (m?.[1] ?? '').replace(/^www\./, '');
}

// ---- build ------------------------------------------------------------------

interface EmbeddedArt {
  ref: PDFImage;
  width: number;
  height: number;
}

/**
 * Build the full PDF: cover (instructions + calibration square) then the fill sheets.
 * `loadImage` fetches art pixels (see fillSheetArt's web loader); art whose image can't be
 * loaded prints a labeled fallback tile instead of aborting the export.
 */
export async function buildPlaceholderPdf(
  binder: DemoBinder,
  cards: CardMetaSource,
  opts?: { ownedIds?: ReadonlySet<string>; loadImage?: ArtLoader },
): Promise<Uint8Array> {
  const { tiles, counts } = collectFillTiles(binder, cards, opts?.ownedIds);
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle(`${sanitize(binder.title)} - fill sheets`);

  // Fetch + embed each distinct art image once. Failures resolve null → fallback tiles.
  const urls = [...new Set(tiles.filter((t): t is ArtTile => t.kind === 'art').map((t) => t.group.imageUrl))];
  const images = new Map<string, EmbeddedArt | null>();
  await Promise.all(
    urls.map(async (url) => {
      const loaded: LoadedArt | null = opts?.loadImage ? await opts.loadImage(url) : null;
      if (!loaded) {
        images.set(url, null);
        return;
      }
      const ref = loaded.kind === 'png' ? await doc.embedPng(loaded.bytes) : await doc.embedJpg(loaded.bytes);
      images.set(url, { ref, width: loaded.width, height: loaded.height });
    }),
  );

  drawCover(doc.addPage([SHEET_W, SHEET_H]), sanitize(binder.title), counts, bold, regular);

  for (let i = 0; i < tiles.length; i += TILES_PER_SHEET) {
    const page = doc.addPage([SHEET_W, SHEET_H]);
    const batch = tiles.slice(i, i + TILES_PER_SHEET);
    batch.forEach((tile, j) => {
      const col = j % COLS;
      const row = Math.floor(j / COLS);
      // PDF origin is bottom-left; tiles read top-left → bottom-right.
      const x = MARGIN_X + col * CARD_W;
      const y = SHEET_H - MARGIN_Y - (row + 1) * CARD_H;
      if (tile.kind === 'card') {
        drawCardTile(page, tile, x, y, bold, regular);
      } else if (tile.kind === 'insert') {
        page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, color: hexColor(tile.color) });
        drawTag(page, `P${tile.page} · R${tile.row}C${tile.col} · insert ${tile.color}`, x, y, regular);
      } else {
        const img = images.get(tile.group.imageUrl) ?? null;
        if (img) drawArtPiece(page, img, tile, x, y);
        else drawArtFallback(page, tile, x, y, bold, regular);
        drawTag(page, `P${tile.page} · R${tile.row}C${tile.col}`, x, y, regular);
      }
    });
    // Cut grid + rulers LAST so the dashed lattice rides on top of every fill.
    drawCutGrid(page);
    drawMarginRulers(page, regular);
    const hosts = [...new Set(batch.filter((t): t is ArtTile => t.kind === 'art').map((t) => artHost(t.group.imageUrl)))]
      .filter(Boolean);
    const footer = [
      `${sanitize(binder.title)} · sheet ${Math.floor(i / TILES_PER_SHEET) + 1} of ${sheetsFor(tiles.length)}`,
      'cards 2.5" × 3.5" (63.5 × 88.9 mm)',
      hosts.length ? `art: ${hosts.join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    drawCentered(page, footer, 6, regular, 7, MUTED);
  }

  return doc.save();
}

function hexColor(h: string) {
  const v = parseInt(h.replace('#', ''), 16);
  if (!Number.isFinite(v)) return FILL;
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
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

/**
 * Cumulative-inch labels in the margins at every cut line — a printed ruler doubling as a
 * second scale check beyond the cover's calibration square.
 */
function drawMarginRulers(page: PDFPage, regular: PDFFont) {
  const label = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)}"`;
  for (let c = 0; c <= COLS; c += 1) {
    const x = MARGIN_X + c * CARD_W;
    const text = label((c * CARD_W) / PT);
    const w = regular.widthOfTextAtSize(text, 6);
    page.drawText(text, { x: x - w / 2, y: SHEET_H - MARGIN_Y + 5, size: 6, font: regular, color: MUTED });
  }
  for (let r = 0; r <= ROWS; r += 1) {
    const y = SHEET_H - MARGIN_Y - r * CARD_H;
    const text = label((r * CARD_H) / PT);
    const w = regular.widthOfTextAtSize(text, 6);
    page.drawText(text, { x: MARGIN_X - w - 4, y: y + 2, size: 6, font: regular, color: MUTED });
  }
}

/** Discreet assembly tag on art/insert pieces (a future run could print these on the back). */
function drawTag(page: PDFPage, text: string, x: number, y: number, regular: PDFFont) {
  const w = regular.widthOfTextAtSize(text, 5.5) + 6;
  page.drawRectangle({ x: x + 3, y: y + CARD_H - 12, width: w, height: 9, color: WHITE, opacity: 0.75 });
  page.drawText(text, { x: x + 6, y: y + CARD_H - 9.5, size: 5.5, font: regular, color: MUTED });
}

/** One placeholder card: location band up top, then name / set / number, then the checkbox. */
function drawCardTile(page: PDFPage, tile: CardTile, x: number, y: number, bold: PDFFont, regular: PDFFont) {
  const cx = x + CARD_W / 2;
  const pad = 10;
  const innerW = CARD_W - pad * 2;

  page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, color: tile.owned ? FILL_OWNED : FILL });
  const bandH = 34;
  page.drawRectangle({
    x, y: y + CARD_H - bandH, width: CARD_W, height: bandH,
    color: tile.owned ? BAND_OWNED : BAND,
  });
  drawCentered(page, `PAGE ${tile.page}`, y + CARD_H - 15, bold, 11, INK, cx);
  const loc = `Row ${tile.row} · Col ${tile.col}${tile.span ? ` · ${tile.span}` : ''}`;
  drawCentered(page, loc, y + CARD_H - 28, regular, 8.5, INK, cx);

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

  const boxSize = 9;
  const label = tile.owned ? 'owned' : 'acquired';
  const tone = tile.owned ? OWNED_INK : MUTED;
  const labelW = regular.widthOfTextAtSize(label, 8);
  const groupX = cx - (boxSize + 5 + labelW) / 2;
  const boxY = y + 16;
  page.drawRectangle({ x: groupX, y: boxY, width: boxSize, height: boxSize, borderColor: tone, borderWidth: 0.8 });
  if (tile.owned) {
    page.drawLine({ start: { x: groupX + 2, y: boxY + 4.5 }, end: { x: groupX + 3.8, y: boxY + 2.2 }, thickness: 1.1, color: tone });
    page.drawLine({ start: { x: groupX + 3.8, y: boxY + 2.2 }, end: { x: groupX + 7.2, y: boxY + 7 }, thickness: 1.1, color: tone });
  }
  page.drawText(label, { x: groupX + boxSize + 5, y: boxY + 1.5, size: 8, font: regular, color: tone });
}

/** Art piece whose image couldn't be fetched: a labeled gray tile instead of a hole. */
function drawArtFallback(page: PDFPage, tile: ArtTile, x: number, y: number, bold: PDFFont, regular: PDFFont) {
  const cx = x + CARD_W / 2;
  page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, color: FILL });
  drawCentered(page, 'art piece', y + CARD_H / 2 + 10, bold, 11, MUTED, cx);
  drawCentered(page, 'image unavailable', y + CARD_H / 2 - 4, regular, 9, MUTED, cx);
  drawCentered(page, sanitize(artHost(tile.group.imageUrl)), y + CARD_H / 2 - 18, regular, 8, MUTED, cx);
}

/**
 * One pocket's piece of an art group, gap-compensated and transform-aware.
 *
 * The group's crop (in TRANSFORMED image space, matching the app) is cover-fit onto the
 * assembled physical extent (pockets + webbing), then this piece samples only its pocket's
 * window. The original image is drawn under a transformation matrix that reproduces the
 * app's rendering: mirror flips first (in original space), then the quarter-turn rotation.
 */
function drawArtPiece(page: PDFPage, img: EmbeddedArt, tile: ArtTile, tx: number, ty: number) {
  const g = tile.group;
  const t = g.transform;
  const rot = t?.rot ?? 0;
  const quarter = rot === 90 || rot === 270;
  // Transformed-space pixel dims (the space the crop lives in).
  const Wt = quarter ? img.height : img.width;
  const Ht = quarter ? img.width : img.height;

  // Group crop in transformed px.
  let sx = g.crop.x * Wt, sy = g.crop.y * Ht, sw = g.crop.w * Wt, sh = g.crop.h * Ht;

  if (g.fit === 'contain') {
    // Letterbox the whole image inside this piece's footprint (single-slot groups only):
    // white backing, image centered at original aspect.
    page.drawRectangle({ x: tx, y: ty, width: CARD_W, height: CARD_H, color: WHITE });
    const s = Math.min(CARD_W / Wt, CARD_H / Ht);
    const rw = Wt * s, rh = Ht * s;
    drawTransformed(page, img, rot, t, tx + (CARD_W - rw) / 2, ty + (CARD_H - rh) / 2, rw, rh);
    return;
  }

  // Cover-fit the crop to the assembled physical extent (pockets + webbing).
  const physW = g.C * CARD_W + (g.C - 1) * POCKET_GAP;
  const physH = g.R * CARD_H + (g.R - 1) * POCKET_GAP;
  const AR = physW / physH;
  if (sw / sh > AR) { const nw = sh * AR; sx += (sw - nw) / 2; sw = nw; }
  else { const nh = sw / AR; sy += (sh - nh) / 2; sh = nh; }
  const s = physW / sw; // points per transformed px, uniform
  // This piece's window origin (transformed px, top-origin) — offset by pocket pitch.
  const px = sx + (tile.j * (CARD_W + POCKET_GAP)) / s;
  const py = sy + (tile.i * (CARD_H + POCKET_GAP)) / s;
  // Full transformed image rect on the page (the window lands exactly on this tile).
  const ox = tx - px * s;
  const oy = ty + CARD_H - (Ht - py) * s;
  drawTransformed(page, img, rot, t, ox, oy, Wt * s, Ht * s, { x: tx, y: ty, w: CARD_W, h: CARD_H });
}

/**
 * Draw the ORIGINAL image so that its TRANSFORMED rendering fills the page rect
 * [ox, oy, tw, th] (bottom-left origin), optionally clipped. Mapping is derived by pushing
 * three unit-square corners through: original draw coords → flips (original space) →
 * quarter-turn → transformed normalized → page.
 */
function drawTransformed(
  page: PDFPage,
  img: EmbeddedArt,
  rot: number,
  t: ImageTransform | undefined,
  ox: number,
  oy: number,
  tw: number,
  th: number,
  clipRect?: { x: number; y: number; w: number; h: number },
) {
  const F = (p: number, q: number): [number, number] => {
    let xo = p;
    let yo = 1 - q; // original top-origin
    if (t?.flipH) xo = 1 - xo;
    if (t?.flipV) yo = 1 - yo;
    let a: number, b: number;
    if (rot === 90) { a = 1 - yo; b = xo; }
    else if (rot === 180) { a = 1 - xo; b = 1 - yo; }
    else if (rot === 270) { a = yo; b = 1 - xo; }
    else { a = xo; b = yo; }
    return [ox + a * tw, oy + (1 - b) * th];
  };
  const [e0x, e0y] = F(0, 0);
  const [e1x, e1y] = F(1, 0);
  const [e2x, e2y] = F(0, 1);

  page.pushOperators(pushGraphicsState());
  if (clipRect) {
    page.pushOperators(
      moveTo(clipRect.x, clipRect.y),
      lineTo(clipRect.x + clipRect.w, clipRect.y),
      lineTo(clipRect.x + clipRect.w, clipRect.y + clipRect.h),
      lineTo(clipRect.x, clipRect.y + clipRect.h),
      closePath(),
      clip(),
      endPath(),
    );
  }
  page.pushOperators(concatTransformationMatrix(e1x - e0x, e1y - e0y, e2x - e0x, e2y - e0y, e0x, e0y));
  page.drawImage(img.ref, { x: 0, y: 0, width: 1, height: 1 });
  page.pushOperators(popGraphicsState());
}

/** Cover sheet: what this is, how to print it true-to-size, and the 1-inch calibration square. */
function drawCover(page: PDFPage, binderTitle: string, counts: FillCounts, bold: PDFFont, regular: PDFFont) {
  let y = SHEET_H - 120;
  drawCentered(page, 'Binder fill sheets', y, bold, 26);
  y -= 26;
  drawCentered(page, binderTitle, y, regular, 14, MUTED);
  y -= 20;
  const parts = [
    `${counts.cards} card placeholder${counts.cards === 1 ? '' : 's'}`,
    counts.art ? `${counts.art} art piece${counts.art === 1 ? '' : 's'}` : '',
    counts.inserts ? `${counts.inserts} insert${counts.inserts === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  drawCentered(
    page,
    `${parts.join(' · ')} · ${sheetsFor(counts.total)} sheet${sheetsFor(counts.total) === 1 ? '' : 's'}`,
    y,
    regular,
    11,
    MUTED,
  );
  if (counts.ownedCards > 0) {
    y -= 16;
    drawCentered(
      page,
      `Green placeholders = the ${counts.ownedCards} card${counts.ownedCards === 1 ? '' : 's'} already in your collection; gray = still to hunt.`,
      y,
      regular,
      10,
      OWNED_INK,
    );
  }

  y -= 56;
  const steps = [
    'Print at 100% scale (“Actual size”) — NOT “Fit to page”.',
    'Check the calibration square below: it must measure exactly 1 inch (2.54 cm).',
    'Cut along the dashed lines — every piece comes out at real card size, 2.5" × 3.5".',
    'Slide each piece into the pocket printed on it (page, row, column — art pieces carry a corner tag).',
    'When you get a real card, its placeholder tells you exactly which pocket it goes in — swap it in.',
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

  y -= 30;
  const sq = PT;
  page.drawRectangle({ x: SHEET_W / 2 - sq / 2, y: y - sq, width: sq, height: sq, borderColor: INK, borderWidth: 1 });
  drawCentered(page, '1 inch', y - sq / 2 - 4, regular, 9, MUTED);
  drawCentered(page, 'This square must measure exactly 1" × 1" (2.54 cm). If it doesn’t, fix your print scale before cutting.', y - sq - 18, regular, 9, MUTED);

  drawCentered(page, 'michi-maker.com', 40, regular, 9, MUTED);
}

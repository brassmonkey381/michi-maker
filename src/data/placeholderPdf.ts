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
 * Layout: US Letter. Singles (placeholders, inserts, 1-pocket art) pack 3 × 3 EDGE TO EDGE so
 * neighboring pieces share one dashed cut line (fewest cuts, no waste strips); folded 2-wide
 * art pieces print on their own sheets AT THE END, at true assembled width. Margin rulers
 * (cumulative inches at every cut) and a cover with instructions + a 1-inch calibration
 * square — home printers love "fit to page", which would shrink the pieces.
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

import { insideEdgePairStarts, pageSide } from '@/data/binderPhysics';
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
/**
 * Singles sheets pack pieces EDGE TO EDGE: neighboring pieces share one cut line, so a single
 * straight cut frees two edges at once — no narrow waste strips between columns. Folded
 * 2-wide pieces would break that shared grid (their true assembled width is 2 cards + the
 * fold strip), so they move to their own sheets at the END of the document (FOLD_* below).
 */
const GRID_W = COLS * CARD_W; // 540 pt (7.5")
const GRID_H = ROWS * CARD_H; // 756 pt (10.5")
/** Fold pieces: 2 cards + the fold strip, art continuous across the fold. */
const FOLD_W = 2 * CARD_W + POCKET_GAP; // 369 pt (5.125")

/**
 * Sheet layout, in two modes:
 *
 *  - CUT MARGINS (default): pieces are spaced 0.25" apart with the dashed outline drawn just
 *    OUTSIDE each piece, so guides never touch the artwork and every cut has margin for error
 *    (cut anywhere in the gap, then trim to the line). Placement labels print BELOW each piece
 *    in the gap — nothing is ever stamped on the art. Costs sheets: 6 singles per sheet vs 9.
 *
 *  - TIGHT: the classic edge-to-edge grid — neighboring pieces share one cut line (fewest
 *    cuts, least paper). No room between pieces, so labels overlay a corner of each piece.
 */
interface SheetLayout {
  /** Piece spacing (0 = tight/shared cuts). */
  gap: number;
  /** How far the dashed outline sits OUTSIDE the true piece edge (0 = on the edge). */
  outset: number;
  rows: number;
  marginX: number;
  marginY: number;
  foldRows: number;
  foldMarginX: number;
  foldMarginY: number;
}

function makeLayout(cutMargins: boolean): SheetLayout {
  if (!cutMargins) {
    return {
      gap: 0,
      outset: 0,
      rows: ROWS,
      marginX: (SHEET_W - GRID_W) / 2, // 36 pt (0.5")
      marginY: (SHEET_H - GRID_H) / 2, // 18 pt (0.25")
      foldRows: 3,
      foldMarginX: (SHEET_W - FOLD_W) / 2,
      foldMarginY: (SHEET_H - 3 * CARD_H) / 2,
    };
  }
  const gap = 0.25 * PT;
  const rows = 2; // 3 rows + gaps don't fit US Letter
  return {
    gap,
    outset: 2,
    rows,
    marginX: (SHEET_W - (COLS * CARD_W + (COLS - 1) * gap)) / 2, // 18 pt (0.25")
    marginY: (SHEET_H - (rows * CARD_H + (rows - 1) * gap)) / 2,
    foldRows: 2,
    foldMarginX: (SHEET_W - FOLD_W) / 2,
    foldMarginY: (SHEET_H - (2 * CARD_H + gap)) / 2,
  };
}

const colX = (L: SheetLayout, c: number) => L.marginX + c * (CARD_W + L.gap);
const rowY = (L: SheetLayout, r: number) => SHEET_H - L.marginY - (r + 1) * CARD_H - r * L.gap;
const foldRowY = (L: SheetLayout, r: number) => SHEET_H - L.foldMarginY - (r + 1) * CARD_H - r * L.gap;

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
  col: number; // 1-indexed leftmost pocket of the piece
  group: ArtGroup;
  i: number; // this piece's top-left cell within the group
  j: number;
  /** Pockets wide: 2 = a folded piece printed at true assembled width (art crosses the fold). */
  w: 1 | 2;
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
  /** Total print sheets across BOTH files, excluding their covers (placeholders + art). */
  sheets: number;
  /** Sheets in the PLACEHOLDERS file — plain paper: card placeholders + inserts, 3 × 3 edge to edge. */
  placeholderSheets: number;
  /** Sheets in the ART file — matte cardstock: art pieces, spaced (singles 3-up, folds their own). */
  artSheets: number;
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
function groupArt(slots: DemoSlot[]): GroupedArt[] {
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
  const groups: GroupedArt[] = [];
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

/** A sampling region plus the slots that formed it — slot boundaries define the PHYSICAL
 *  printed pieces (a merged 1×2 slot is one folded piece; separate slices stay separate). */
interface GroupedArt {
  group: ArtGroup;
  slots: DemoSlot[];
}

/**
 * The physical pieces one artwork slot prints as (slot-relative cells): 1×1 and merged 1×2
 * slots ARE single pieces; legacy oversized slots subdivide per row — folded pairs wherever
 * the footprint sits on an inside-edge pocket pair, singles elsewhere.
 */
function slotPieces(slot: DemoSlot, pairStarts: number[]): { i: number; j: number; w: 1 | 2 }[] {
  if (slot.rowSpan === 1 && slot.colSpan <= 2) {
    return [{ i: 0, j: 0, w: slot.colSpan === 2 ? 2 : 1 }];
  }
  const pieces: { i: number; j: number; w: 1 | 2 }[] = [];
  for (let i = 0; i < slot.rowSpan; i += 1) {
    let j = 0;
    while (j < slot.colSpan) {
      const pairHere = j + 1 < slot.colSpan && pairStarts.includes(slot.col + j);
      pieces.push({ i, j, w: pairHere ? 2 : 1 });
      j += pairHere ? 2 : 1;
    }
  }
  return pieces;
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
function mergeComponent(list: DemoSlot[]): GroupedArt[] {
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
  const groups: GroupedArt[] = [];
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
        group: {
          imageUrl: base.imageUrl!,
          transform: base.imageTransform,
          fit: base.imageFit === 'contain' ? 'contain' : 'cover',
          row: minR, col: minC, R, C,
          crop: { x: bx, y: by, w: bx2 - bx, h: by2 - by },
        },
        slots: cluster,
      });
    } else {
      for (const s of cluster) {
        groups.push({
          group: {
            imageUrl: s.imageUrl!,
            transform: s.imageTransform,
            fit: s.imageFit === 'contain' ? 'contain' : 'cover',
            row: s.row, col: s.col, R: s.rowSpan, C: s.colSpan,
            crop: s.imageCrop ?? { x: 0, y: 0, w: 1, h: 1 },
          },
          slots: [s],
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
    // Printed art PIECES follow slot boundaries: a merged 1×2 slot is ONE folded piece
    // (printed at true assembled width, art continuous across the fold); separate 1×1
    // slices stay separate pieces. Legacy oversized slots subdivide into folded pairs at
    // the page's inside-edge pockets + singles (side-load physics).
    const pairStarts = insideEdgePairStarts(page.cols, pageSide(pageIndex));
    for (const { group, slots } of groupArt(page.slots.filter((s) => s.type === 'artwork' && s.imageUrl))) {
      for (const slot of slots) {
        for (const piece of slotPieces(slot, pairStarts)) {
          byCell.set(`${slot.row + piece.i},${slot.col + piece.j}`, {
            kind: 'art',
            page: pageIndex + 1,
            row: slot.row + piece.i + 1,
            col: slot.col + piece.j + 1,
            group,
            i: slot.row + piece.i - group.row,
            j: slot.col + piece.j - group.col,
            w: piece.w,
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
  const placeholderSheets = packSection(tiles, 'placeholders').sheetCount;
  const artSheets = packSection(tiles, 'art').sheetCount;
  const counts: FillCounts = {
    cards: tiles.filter((t) => t.kind === 'card').length,
    ownedCards: tiles.filter((t) => t.kind === 'card' && t.owned).length,
    art: tiles.filter((t) => t.kind === 'art').length,
    inserts: tiles.filter((t) => t.kind === 'insert').length,
    total: tiles.length,
    placeholderSheets,
    artSheets,
    sheets: placeholderSheets + artSheets,
  };
  return { tiles, counts };
}

/** A tile placed on the print layout: which sheet, and its bottom-left corner (points). */
interface PlacedTile {
  tile: FillTile;
  sheet: number;
  x: number;
  y: number;
}

/**
 * Pack ONE section's tiles onto its own sheets, each section numbered from sheet 0 (the two
 * sections become two separate PDFs — plain paper vs matte cardstock).
 *
 *  - 'placeholders': card placeholders + inserts fill the 3 × 3 grid EDGE TO EDGE in reading
 *    order — no blanks, every interior edge is one shared cut. (Art tiles are ignored here.)
 *  - 'art': art pieces print SPACED (never on ink) — singles 3-up per the spaced layout, then
 *    folded 2-wide pieces on their own sheets at the end (FOLD_ROWS per sheet, true width).
 */
function packSection(
  tiles: FillTile[],
  section: 'placeholders' | 'art',
): { placed: PlacedTile[]; sheetCount: number } {
  if (section === 'placeholders') {
    const L = makeLayout(false);
    const plain = tiles.filter((t) => t.kind !== 'art');
    const perPlain = COLS * L.rows;
    const placed: PlacedTile[] = plain.map((tile, n) => ({
      tile,
      sheet: Math.floor(n / perPlain),
      x: colX(L, n % COLS),
      y: rowY(L, Math.floor(n / COLS) % L.rows),
    }));
    return { placed, sheetCount: Math.ceil(plain.length / perPlain) };
  }
  // ART is NEVER printed tight: art pieces get the spaced layout — labels beneath them,
  // outlines outset, no ink on the artwork.
  const art = makeLayout(true);
  const singles = tiles.filter((t): t is ArtTile => t.kind === 'art' && t.w === 1);
  const folded = tiles.filter((t): t is ArtTile => t.kind === 'art' && t.w === 2);
  const perArt = COLS * art.rows;
  const placed: PlacedTile[] = singles.map((tile, n) => ({
    tile,
    sheet: Math.floor(n / perArt),
    x: colX(art, n % COLS),
    y: rowY(art, Math.floor(n / COLS) % art.rows),
  }));
  const foldStartSheet = Math.ceil(singles.length / perArt);
  folded.forEach((tile, n) => {
    placed.push({
      tile,
      sheet: foldStartSheet + Math.floor(n / art.foldRows),
      x: art.foldMarginX,
      y: foldRowY(art, n % art.foldRows),
    });
  });
  return { placed, sheetCount: foldStartSheet + Math.ceil(folded.length / art.foldRows) };
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

/** One generated fill-sheet file. Placeholders and art print as SEPARATE PDFs so each can go
 *  on its own paper stock (plain paper for placeholders, matte cardstock for art). */
export interface FillSheetPdf {
  section: 'placeholders' | 'art';
  bytes: Uint8Array;
  /** Sheets in this file, excluding its cover. */
  sheets: number;
  /** Printable pieces in this file (placeholders + inserts, or art pieces). */
  pieces: number;
}

/**
 * Build the fill-sheet PDFs for a binder: up to TWO files — a PLACEHOLDERS file (plain paper:
 * card placeholders + inserts) and an ART file (matte cardstock: the binder's art pieces). A
 * section with no pieces is omitted, so a card-only binder yields one file and an art-only
 * binder the other. Each file carries its own cover (instructions + calibration square).
 * `loadImage` fetches art pixels (see fillSheetArt's web loader); art whose image can't be
 * loaded prints a labeled fallback tile instead of aborting the export.
 */
export async function buildFillSheetPdfs(
  binder: DemoBinder,
  cards: CardMetaSource,
  opts?: { ownedIds?: ReadonlySet<string>; loadImage?: ArtLoader },
): Promise<FillSheetPdf[]> {
  const title = sanitize(binder.title);
  const { tiles, counts } = collectFillTiles(binder, cards, opts?.ownedIds);
  const plain = tiles.filter((t) => t.kind !== 'art');
  const art = tiles.filter((t) => t.kind === 'art');
  const out: FillSheetPdf[] = [];
  if (plain.length > 0) {
    const { bytes, sheets } = await buildSectionDoc('placeholders', title, tiles, counts);
    out.push({ section: 'placeholders', bytes, sheets, pieces: plain.length });
  }
  if (art.length > 0) {
    const { bytes, sheets } = await buildSectionDoc('art', title, tiles, counts, opts?.loadImage);
    out.push({ section: 'art', bytes, sheets, pieces: art.length });
  }
  return out;
}

/** Build one section's PDF (cover + its sheets). Only the art section fetches/embeds images. */
async function buildSectionDoc(
  section: 'placeholders' | 'art',
  title: string,
  tiles: FillTile[],
  counts: FillCounts,
  loadImage?: ArtLoader,
): Promise<{ bytes: Uint8Array; sheets: number }> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle(`${title} - ${section === 'art' ? 'art' : 'placeholder'} sheets`);

  // Only the ART file embeds images (placeholders are pure vector). Fetch + embed each distinct
  // art image once. Failures resolve null → fallback tiles.
  const images = new Map<string, EmbeddedArt | null>();
  if (section === 'art') {
    const urls = [...new Set(tiles.filter((t): t is ArtTile => t.kind === 'art').map((t) => t.group.imageUrl))];
    await Promise.all(
      urls.map(async (url) => {
        const loaded: LoadedArt | null = loadImage ? await loadImage(url) : null;
        if (!loaded) {
          images.set(url, null);
          return;
        }
        const ref = loaded.kind === 'png' ? await doc.embedPng(loaded.bytes) : await doc.embedJpg(loaded.bytes);
        images.set(url, { ref, width: loaded.width, height: loaded.height });
      }),
    );
  }

  drawCover(doc.addPage([SHEET_W, SHEET_H]), section, title, counts, bold, regular);

  const { placed, sheetCount } = packSection(tiles, section);
  const L = makeLayout(false);
  const artLayout = makeLayout(true); // art draws with the spaced treatment
  for (let s = 0; s < sheetCount; s += 1) {
    const page = doc.addPage([SHEET_W, SHEET_H]);
    const batch = placed.filter((p) => p.sheet === s);
    for (const { tile, x, y } of batch) {
      if (tile.kind === 'card') {
        drawCardTile(page, tile, x, y, bold, regular);
        drawPieceOutline(page, x, y, CARD_W, L);
      } else if (tile.kind === 'insert') {
        page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, color: hexColor(tile.color) });
        drawTag(page, `P${tile.page} · R${tile.row}C${tile.col} · insert ${tile.color}`, x, y, regular, L);
        drawPieceOutline(page, x, y, CARD_W, L);
      } else {
        const pieceW = tile.w * CARD_W + (tile.w - 1) * POCKET_GAP;
        const img = images.get(tile.group.imageUrl) ?? null;
        if (img) drawArtPiece(page, img, tile, x, y);
        else drawArtFallback(page, tile, x, y, bold, regular);
        // Art markings NEVER touch the artwork: label below the piece, outline outset.
        drawTag(page, `P${tile.page} · R${tile.row}C${tile.col}${tile.w === 2 ? ' · fold' : ''}`, x, y, regular, artLayout);
        drawPieceOutline(page, x, y, pieceW, artLayout);
        if (tile.w === 2) drawFoldTicks(page, x + CARD_W + POCKET_GAP / 2, y);
      }
    }
    if (section === 'placeholders') drawMarginRulers(page, regular, false, L);
    const hosts = [...new Set(
      batch.map((p) => p.tile).filter((t): t is ArtTile => t.kind === 'art').map((t) => artHost(t.group.imageUrl)),
    )].filter(Boolean);
    const label = section === 'art' ? 'art sheet' : 'sheet';
    const footer = [
      `${title} · ${label} ${s + 1} of ${sheetCount}`,
      'cards 2.5" × 3.5" (63.5 × 88.9 mm)',
      hosts.length ? `art: ${hosts.join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    drawCentered(page, footer, 3, regular, 7, MUTED);
  }

  return { bytes: await doc.save(), sheets: sheetCount };
}

function hexColor(h: string) {
  const v = parseInt(h.replace('#', ''), 16);
  if (!Number.isFinite(v)) return FILL;
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

/** Dashed cut outline around one piece. TIGHT: pieces sit edge to edge, neighbors' outlines
 *  coincide — one dashed line marks one shared cut. CUT MARGINS: the outline sits `outset`
 *  OUTSIDE the true edge, so the guide never touches the artwork — cut in the gap, trim to
 *  the line, and the piece is still ≥ true size. */
function drawPieceOutline(page: PDFPage, x: number, y: number, width: number, L: SheetLayout) {
  page.drawRectangle({
    x: x - L.outset,
    y: y - L.outset,
    width: width + 2 * L.outset,
    height: CARD_H + 2 * L.outset,
    borderColor: GUIDE, borderWidth: 0.5, borderDashArray: [3, 3],
  });
}

/** Fold marks on a 2-wide piece: short ticks ABOVE and BELOW the piece, in the surrounding
 *  gap — never on the artwork itself. Fold on the line between them, then each half slides
 *  into its pocket. (Fold sheets always use the spaced layout, so the gap exists.) */
function drawFoldTicks(page: PDFPage, foldX: number, y: number) {
  const tick = (y1: number, y2: number) =>
    page.drawLine({ start: { x: foldX, y: y1 }, end: { x: foldX, y: y2 }, thickness: 0.8, color: GUIDE, dashArray: [2, 2] });
  tick(y - 9, y - 3);
  tick(y + CARD_H + 3, y + CARD_H + 9);
}

/**
 * Cumulative-inch labels in the margins at every cut line — a printed ruler doubling as a
 * second scale check beyond the cover's calibration square. With the edge-to-edge layout the
 * cut lines ARE the piece edges: 0 / 2.5 / 5 / 7.5" across, card-height pitch down (fold
 * sheets: 0 and the assembled width across).
 */
function drawMarginRulers(page: PDFPage, regular: PDFFont, fold: boolean, L: SheetLayout) {
  const originX = fold ? L.foldMarginX : L.marginX;
  const originY = fold ? L.foldMarginY : L.marginY;
  const label = (n: number) => `${Number(n.toFixed(2))}"`;
  const top = (x: number, inches: number) => {
    const text = label(inches);
    const w = regular.widthOfTextAtSize(text, 6);
    page.drawText(text, { x: x - w / 2, y: SHEET_H - originY + 4, size: 6, font: regular, color: MUTED });
  };
  const left = (y: number, inches: number) => {
    const text = label(inches);
    const w = regular.widthOfTextAtSize(text, 6);
    page.drawText(text, { x: originX - w - 4, y: y + 2, size: 6, font: regular, color: MUTED });
  };
  const colEdges = fold ? [0, FOLD_W] : Array.from({ length: COLS + 1 }, (_, c) => c * CARD_W);
  for (const e of colEdges) top(originX + e, e / PT);
  const rows = fold ? L.foldRows : L.rows;
  for (let r = 0; r <= rows; r += 1) left(SHEET_H - originY - r * CARD_H, (r * CARD_H) / PT);
}

/** Assembly tag on art/insert pieces. CUT MARGINS: printed BELOW the piece in the gap — the
 *  artwork itself stays clean. TIGHT: there's no gap, so a small translucent chip overlays the
 *  piece's top-left corner (the trade-off of the compact layout). */
function drawTag(page: PDFPage, text: string, x: number, y: number, regular: PDFFont, L: SheetLayout) {
  if (L.gap > 0) {
    page.drawText(text, { x: x + 1, y: y - L.outset - 8.5, size: 5.5, font: regular, color: MUTED });
    return;
  }
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
  const pieceW = tile.w * CARD_W + (tile.w - 1) * POCKET_GAP;
  const cx = x + pieceW / 2;
  page.drawRectangle({ x, y, width: pieceW, height: CARD_H, color: FILL });
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
  // Printed footprint: a folded 2-wide piece is its true assembled width — two cards PLUS
  // the fold strip, with the art running continuously across the fold.
  const pieceW = tile.w * CARD_W + (tile.w - 1) * POCKET_GAP;

  if (g.fit === 'contain') {
    // Letterbox the whole image inside this piece's footprint (single-slot groups only):
    // white backing, image centered at original aspect.
    page.drawRectangle({ x: tx, y: ty, width: pieceW, height: CARD_H, color: WHITE });
    const s = Math.min(pieceW / Wt, CARD_H / Ht);
    const rw = Wt * s, rh = Ht * s;
    drawTransformed(page, img, rot, t, tx + (pieceW - rw) / 2, ty + (CARD_H - rh) / 2, rw, rh);
    return;
  }

  // Cover-fit the crop to the assembled physical extent (pockets + webbing).
  const physW = g.C * CARD_W + (g.C - 1) * POCKET_GAP;
  const physH = g.R * CARD_H + (g.R - 1) * POCKET_GAP;
  const AR = physW / physH;
  if (sw / sh > AR) { const nw = sh * AR; sx += (sw - nw) / 2; sw = nw; }
  else { const nh = sw / AR; sy += (sh - nh) / 2; sh = nh; }
  const s = physW / sw; // points per transformed px, uniform
  // This piece's window origin (transformed px, top-origin) — offset by pocket pitch. The
  // window then runs CONTINUOUSLY for pieceW: for a folded pair that includes the fold strip
  // (visible in the binder, bridging the webbing); the skip only happens BETWEEN pieces.
  const px = sx + (tile.j * (CARD_W + POCKET_GAP)) / s;
  const py = sy + (tile.i * (CARD_H + POCKET_GAP)) / s;
  // Full transformed image rect on the page (the window lands exactly on this piece).
  const ox = tx - px * s;
  const oy = ty + CARD_H - (Ht - py) * s;
  drawTransformed(page, img, rot, t, ox, oy, Wt * s, Ht * s, { x: tx, y: ty, w: pieceW, h: CARD_H });
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

/** Cover sheet: what this file is, which paper it wants, how to print it true-to-size, and the
 *  1-inch calibration square. One cover per file (placeholders → plain paper; art → cardstock). */
function drawCover(
  page: PDFPage,
  section: 'placeholders' | 'art',
  binderTitle: string,
  counts: FillCounts,
  bold: PDFFont,
  regular: PDFFont,
) {
  const isArt = section === 'art';
  let y = SHEET_H - 120;
  drawCentered(page, isArt ? 'Art fill sheets' : 'Placeholder fill sheets', y, bold, 26);
  y -= 26;
  drawCentered(page, binderTitle, y, regular, 14, MUTED);
  y -= 20;

  const sectionSheets = isArt ? counts.artSheets : counts.placeholderSheets;
  const parts = isArt
    ? [`${counts.art} art piece${counts.art === 1 ? '' : 's'}`]
    : [
        `${counts.cards} card placeholder${counts.cards === 1 ? '' : 's'}`,
        counts.inserts ? `${counts.inserts} insert${counts.inserts === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
  drawCentered(
    page,
    `${parts.join(' · ')} · ${sectionSheets} sheet${sectionSheets === 1 ? '' : 's'}`,
    y,
    regular,
    11,
    MUTED,
  );

  // The whole point of two files: each prints on its own stock. Say which, loud, up top.
  y -= 20;
  drawCentered(
    page,
    isArt ? 'Print on MATTE-COATED CARDSTOCK' : 'Print on PLAIN PAPER',
    y,
    bold,
    12,
    isArt ? OWNED_INK : INK,
  );
  y -= 15;
  drawCentered(
    page,
    isArt
      ? 'Your card placeholders print in a separate file — put plain paper in for that one.'
      : 'Your artwork prints in a separate file — swap to matte cardstock for that one.',
    y,
    regular,
    9.5,
    MUTED,
  );

  if (!isArt && counts.ownedCards > 0) {
    y -= 15;
    drawCentered(
      page,
      `Green placeholders = the ${counts.ownedCards} card${counts.ownedCards === 1 ? '' : 's'} already in your collection; gray = still to hunt.`,
      y,
      regular,
      10,
      OWNED_INK,
    );
  }

  y -= 48;
  const steps = isArt
    ? [
        'Print at 100% scale (“Actual size”), NOT “Fit to page”. Matte-coated cardstock holds the ink and slides into a pocket best.',
        'Check the calibration square below: it must measure exactly 1 inch (2.54 cm).',
        'Pieces print spaced apart — nothing is ever printed on your artwork. Cut just inside each dashed outline; the pocket location prints in the margin below each piece.',
        'Wide pieces fold at the tick marks above and below the fold line, then each half slides into its pocket pair.',
        'Slide each piece into its pocket. Neighboring pieces are gap-compensated, so the picture reads continuous across the dividers.',
      ]
    : [
        'Print at 100% scale (“Actual size”), NOT “Fit to page”. Plain paper is fine — these are backings behind your cards, not display pieces.',
        'Check the calibration square below: it must measure exactly 1 inch (2.54 cm).',
        'Cut along the dashed lines. Pieces print edge to edge: neighbors share a cut line, so one straight cut frees two edges at once.',
        'Slide every piece into its pocket: each placeholder prints its page/row/column. When a real card arrives, its placeholder shows exactly which pocket to swap.',
      ];
  const left = (SHEET_W - GRID_W) / 2 + 24;
  steps.forEach((text, i) => {
    page.drawText(`${i + 1}.`, { x: left, y, size: 11, font: bold, color: INK });
    const lines = wrap(text, regular, 11, GRID_W - 72, 2);
    for (const line of lines) {
      page.drawText(line, { x: left + 20, y, size: 11, font: regular, color: INK });
      y -= 16;
    }
    y -= 8;
  });

  y -= 24;
  const sq = PT;
  page.drawRectangle({ x: SHEET_W / 2 - sq / 2, y: y - sq, width: sq, height: sq, borderColor: INK, borderWidth: 1 });
  drawCentered(page, '1 inch', y - sq / 2 - 4, regular, 9, MUTED);
  drawCentered(page, 'This square must measure exactly 1" × 1" (2.54 cm). If it doesn’t, fix your print scale before cutting.', y - sq - 18, regular, 9, MUTED);

  drawCentered(page, 'michi-maker.com', 40, regular, 9, MUTED);
}

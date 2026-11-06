/**
 * ONE PAGE AS A PICTURE, drawn in the browser (owner, 2026-11-05: "viewers on mobile web will
 * want to share pictures straight from their phones", at full resolution, with our mark).
 *
 * WHY NOT THE SERVER RENDER. api/og-image-hires draws a poster of a PUBLIC binder in about half a
 * minute. This draws the page in front of you, private or not, in a second or two, from the same
 * card pictures the screen shows at full size, and hands it to the phone's own share sheet
 * (Instagram, Reddit, Messages) through the Web Share API. Where that is missing (a desktop) it
 * copies the picture to the clipboard, and failing that saves the file.
 *
 * WHAT IT DRAWS. The page's mat colour, every pocket (a card at full resolution, a piece of art
 * with its crop, an empty pocket as a soft well), and the michi mark with michi-maker.com in the
 * bottom-right corner. Sleeves, stickers, mat patterns and art windows are NOT drawn (the screen's
 * grid owns those); the picture is the page's cards on its mat, which is what gets posted.
 *
 * THE CARD PICTURES come through the fill-sheet loader (a CORS fetch, then the art-proxy), so the
 * canvas is never tainted and toBlob always works.
 */
import { Platform } from 'react-native';
import { cardThumbUrl } from 'tcgscan-browse';

import { Palette } from '@/constants/theme';
import { CARD_ASPECT, POCKET_GAP_RATIO } from '@/data/binderLayout';
import type { DemoPage } from '@/data/binderTypes';
import { createWebArtLoader } from '@/data/fillSheetArt';

export interface PageImageInput {
  page: DemoPage;
  /** The binder's title, for the file name. */
  title: string;
  pageNo: number;
  /** The mat colour behind the pockets when the page sets none. */
  mat: string;
}

/** Card pocket width in the picture. 3 columns at this width is a 2100px page: Instagram-sized. */
const POCKET_W = 640;
const SITE = 'michi-maker.com';

const loader = typeof document !== 'undefined' ? createWebArtLoader() : null;

/**
 * STRAIGHT TO A BITMAP when the host allows it (our card and art buckets do): one fetch, one
 * decode. The fill-sheet loader is the fallback for a host without CORS; it sniffs, measures and
 * re-encodes through a canvas, which took half a minute for three full-size cards.
 */
async function bitmapOf(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) return await createImageBitmap(await res.blob());
  } catch {
    // CORS-blocked, or not decodable as fetched: the loader's path below.
  }
  if (!loader) return null;
  const art = await loader(url);
  if (!art) return null;
  try {
    return await createImageBitmap(new Blob([art.bytes as BlobPart]));
  } catch {
    return null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Is this colour dark enough that the stamp should be light? */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/**
 * THE MARK (src/components/brand/LogoMark.tsx, as geometry): a 3x3 pocket grid with one piece of
 * art spanning two pockets, the blue rectangle through it. Same proportions: gap = size/12.
 */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, pocket: string) {
  const gap = Math.max(1, Math.round(size / 12));
  const cell = (size - gap * 2) / 3;
  const r = Math.max(1, cell * 0.24);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (row === 1 && col === 0) {
        ctx.fillStyle = Palette.accent;
        roundRect(ctx, x, y + row * (cell + gap), cell * 2 + gap, cell, r);
        ctx.fill();
        continue;
      }
      if (row === 1 && col === 1) continue;
      ctx.fillStyle = pocket;
      roundRect(ctx, x + col * (cell + gap), y + row * (cell + gap), cell, cell, r);
      ctx.fill();
    }
  }
}

export async function buildPageImage(input: PageImageInput): Promise<Blob> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') throw new Error('The page picture is drawn in a browser.');
  const { page } = input;
  const gap = Math.round(POCKET_W * POCKET_GAP_RATIO);
  const pad = Math.round(POCKET_W * 0.11);
  const pocketH = Math.round(POCKET_W * CARD_ASPECT);
  const W = pad * 2 + page.cols * POCKET_W + (page.cols - 1) * gap;
  const H = pad * 2 + page.rows * pocketH + (page.rows - 1) * gap;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas.');

  const mat = page.backgroundColor ?? input.mat;
  const dark = isDark(mat);
  ctx.fillStyle = mat;
  ctx.fillRect(0, 0, W, H);

  const cellX = (col: number) => pad + col * (POCKET_W + gap);
  const cellY = (row: number) => pad + row * (pocketH + gap);
  const radius = Math.round(POCKET_W * 0.045);

  // Every pocket as a soft well first, so an empty one still reads as a pocket.
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  for (let row = 0; row < page.rows; row += 1) {
    for (let col = 0; col < page.cols; col += 1) {
      roundRect(ctx, cellX(col), cellY(row), POCKET_W, pocketH, radius);
      ctx.fill();
    }
  }

  // The pictures, fetched together; a pocket whose picture fails stays a well, the rest still draw.
  const jobs = page.slots.map(async (slot) => {
    const url = slot.cardId ? cardThumbUrl(slot.cardId, 'full') : slot.imageUrl;
    if (!url) return;
    const bmp = await bitmapOf(url);
    if (!bmp) return;
    const x = cellX(slot.col), y = cellY(slot.row);
    const w = slot.colSpan * POCKET_W + (slot.colSpan - 1) * gap;
    const h = slot.rowSpan * pocketH + (slot.rowSpan - 1) * gap;
    ctx.save();
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    if (slot.cardId) {
      ctx.drawImage(bmp, x, y, w, h);
    } else {
      // A piece of art: its crop window when it has one, else cover (or contain) the pocket.
      const c = slot.imageCrop;
      const sx = c ? c.x * bmp.width : 0, sy = c ? c.y * bmp.height : 0;
      const sw = c ? c.w * bmp.width : bmp.width, sh = c ? c.h * bmp.height : bmp.height;
      const scale = slot.imageFit === 'contain' ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
      const dw = sw * scale, dh = sh * scale;
      if (slot.imageFit === 'contain') {
        ctx.fillStyle = dark ? '#000000' : '#ffffff';
        ctx.fillRect(x, y, w, h);
      }
      ctx.drawImage(bmp, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
    ctx.restore();
    bmp.close();
  });
  await Promise.all(jobs);

  // THE STAMP, bottom right, over the mat's padding: the mark and the address, small and quiet.
  const stampH = Math.round(pad * 0.56);
  const ink = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.62)';
  ctx.font = `600 ${Math.round(stampH * 0.72)}px "Segoe UI", -apple-system, Arial, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(SITE).width;
  const cy = H - pad / 2;
  const right = W - pad * 0.55;
  ctx.fillStyle = ink;
  ctx.fillText(SITE, right, cy);
  drawMark(ctx, right - textW - stampH * 1.35, cy - stampH / 2, stampH, dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.28)');

  // JPEG, not PNG: the same page was 7MB as PNG and about 1.5MB here, and a phone posts it.
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be encoded.'))), 'image/jpeg', 0.92);
  });
}

/**
 * ONE CARD AS A PICTURE (owner, 2026-11-06: "sharing cards from the browser"): the card at full
 * resolution on a mat with a caption (name · set) and the same stamp. 1200px wide.
 */
export async function buildCardImage(input: {
  cardId: string;
  name: string;
  /** The set and number, under the name. */
  caption?: string;
  /** Bold, under the caption, when the data has it (owner, 2026-11-06). */
  illustrator?: string;
  /** Beside the name, with today's date under it: a price is a snapshot. USD. */
  price?: number | null;
  date?: string;
  mat: string;
}): Promise<Blob> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') throw new Error('The card picture is drawn in a browser.');
  const bmp = await bitmapOf(cardThumbUrl(input.cardId, 'full'));
  if (!bmp) throw new Error('The card picture did not load.');
  const cardW = 1000;
  const cardH = Math.round(cardW * CARD_ASPECT);
  // A slim mat around the card (owner, 2026-11-06: the card takes the room); the band's text sits
  // further in than the card's edge.
  const pad = 36;
  const inset = 64;
  // THE FOOTER IS A GRID (owner, 2026-11-06): three rows on shared baselines, two columns. Left:
  // name, set · number, illustrator. Right: price, date, and the stamp on the third row. The
  // rows are ROW apart and the whole block sits a pad above the bottom edge, like the card above.
  const ROW = 44;
  const capH = ROW * 3;
  const W = cardW + pad * 2;
  const H = pad + cardH + pad + 48 + capH + 36;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas.');
  ctx.fillStyle = input.mat;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, pad, pad, cardW, cardH, Math.round(cardW * 0.045));
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, pad, pad, cardW, cardH, Math.round(cardW * 0.045));
  ctx.clip();
  ctx.drawImage(bmp, pad, pad, cardW, cardH);
  ctx.restore();
  bmp.close();
  // THE DARK BAND (owner, 2026-11-06, option C): the footer is a near-black label under the
  // card, whatever the mat, so the card pops and the facts read as a plate.
  const bandTop = pad + cardH + pad;
  ctx.fillStyle = '#17191d';
  ctx.fillRect(0, bandTop, W, H - bandTop);
  const ink = 'rgba(255,255,255,0.92)';
  const muted = 'rgba(255,255,255,0.62)';
  const left = inset;
  const right = W - inset;
  const y1 = bandTop + 48 + 36; // baseline of row 1
  const y2 = y1 + ROW;
  const y3 = y2 + ROW;
  const FONT = '"Segoe UI", -apple-system, Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  // Right column first, so the left column knows how much room it has on each row.
  let rightW1 = 0, rightW2 = 0;
  if (typeof input.price === 'number' && input.price > 0) {
    const text = `$${input.price.toFixed(2)}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = ink;
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(text, right, y1);
    rightW1 = ctx.measureText(text).width + 48;
    if (input.date) {
      ctx.fillStyle = muted;
      ctx.font = `500 26px ${FONT}`;
      ctx.fillText(input.date, right, y2);
      rightW2 = ctx.measureText(input.date).width + 48;
    }
  }
  // The stamp, on the third row's baseline, at the illustrator's weight and size so the two
  // columns' rows match; the mark is as tall as the capitals beside it.
  ctx.textAlign = 'right';
  ctx.fillStyle = ink;
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(SITE, right, y3);
  const siteW = ctx.measureText(SITE).width;
  const markS = 26;
  drawMark(ctx, right - siteW - 12 - markS, y3 - markS + 3, markS, 'rgba(255,255,255,0.5)');
  const rightW3 = siteW + 12 + markS + 48;
  // Left column.
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText(input.name, left, y1, W - inset * 2 - rightW1);
  if (input.caption) {
    ctx.fillStyle = muted;
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(input.caption, left, y2, W - inset * 2 - rightW2);
  }
  if (input.illustrator) {
    ctx.fillStyle = ink;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(`Illus. ${input.illustrator}`, left, y3, W - inset * 2 - rightW3);
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be encoded.'))), 'image/jpeg', 0.92);
  });
}

export type PageImageOutcome = 'shared' | 'copied' | 'saved';

async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')?.drawImage(bmp, 0, 0);
  bmp.close();
  return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('no png'))), 'image/png'));
}

/** The file name a save gets: the binder, the page. */
export function pageImageFileName(title: string, pageNo: number): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'binder';
  return `michi-${slug}-page-${pageNo}.jpg`;
}

/**
 * HAND IT OVER. A phone's share sheet when the browser has one that takes files (iOS Safari,
 * Android Chrome); the clipboard on a desktop that allows pictures; a download otherwise. Called
 * from a tap, because both the share sheet and the clipboard insist on one.
 */
export async function sharePageImage(blob: Blob, fileName: string, text: string, prefer: 'share' | 'clipboard' = 'share'): Promise<PageImageOutcome> {
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // `prefer: 'clipboard'` is the desktop's explicit Copy: it skips the share sheet.
  if (prefer === 'share' && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      // A cancelled sheet is not a failure, and not a reason to also download.
      if ((err as { name?: string })?.name === 'AbortError') return 'shared';
    }
  }
  if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
    try {
      // The clipboard takes PNG only, so the picture is re-encoded for it.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toPng(blob) })]);
      return 'copied';
    } catch {
      // Safari without a user gesture, Firefox: fall through to the file.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}

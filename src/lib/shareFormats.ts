/**
 * SHARING FORMATS (MIC-017 piece 9): a QR code for a binder's link, and the open page as an
 * Instagram story (1080x1920) or square post (1080x1080). Web only; everything is drawn on a
 * canvas in the browser, nothing is uploaded.
 */
import qrcode from 'qrcode-generator';

import { buildPageImage, type PageImageInput } from '@/lib/pageImage';

/** A QR code for `text` as a data URL (GIF), `cell` pixels per module, a quiet zone of 4. */
export function qrDataUrl(text: string, cell = 8): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cell, cell * 4);
}

export type SocialFormat = 'story' | 'square' | 'page';
export const SOCIAL_FORMATS: { key: SocialFormat; label: string; size: string }[] = [
  { key: 'story', label: 'Story', size: '9:16' },
  { key: 'square', label: 'Square post', size: '1:1' },
  { key: 'page', label: 'Page', size: 'as it is' },
];

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture did not load.'));
    img.src = src;
  });

const isDark = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.5;
};

/** The open page in one of the social formats: the page centred on its mat, the title above. */
export async function buildSocialImage(input: PageImageInput, format: SocialFormat): Promise<Blob> {
  const page = await buildPageImage(input, 'image/png');
  if (format === 'page') return page;
  const [W, H] = format === 'story' ? [1080, 1920] : [1080, 1080];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas.');
  const mat = input.page.backgroundColor ?? input.mat;
  ctx.fillStyle = mat;
  ctx.fillRect(0, 0, W, H);
  const url = URL.createObjectURL(page);
  try {
    const img = await loadImage(url);
    const top = format === 'story' ? 260 : 120;
    const bottom = format === 'story' ? 220 : 90;
    const room = { w: W - 2 * 60, h: H - top - bottom };
    const k = Math.min(room.w / img.width, room.h / img.height);
    const w = Math.round(img.width * k);
    const h = Math.round(img.height * k);
    ctx.drawImage(img, Math.round((W - w) / 2), Math.round(top + (room.h - h) / 2), w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
  const ink = isDark(mat) ? '#ffffff' : '#1d1d1f';
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = `700 ${format === 'story' ? 64 : 52}px Georgia, serif`;
  ctx.fillText(input.title || 'My binder', W / 2, format === 'story' ? 170 : 78, W - 120);
  ctx.globalAlpha = 0.7;
  ctx.font = `600 ${format === 'story' ? 36 : 30}px system-ui, sans-serif`;
  ctx.fillText(`Page ${input.pageNo} · michi-maker.com`, W / 2, H - (format === 'story' ? 120 : 40));
  ctx.globalAlpha = 1;
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No picture.'))), 'image/jpeg', 0.92));
}

/** A printable QR card: the code, the binder's title and the link written out. */
export async function buildQrCard(link: string, title: string): Promise<Blob> {
  const W = 1200;
  const H = 1500;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const img = await loadImage(qrDataUrl(link, 24));
  const size = 900;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, (W - size) / 2, 230, size, size);
  ctx.fillStyle = '#1d1d1f';
  ctx.textAlign = 'center';
  ctx.font = '700 72px Georgia, serif';
  ctx.fillText(title || 'My binder', W / 2, 150, W - 120);
  ctx.font = '500 34px system-ui, sans-serif';
  ctx.globalAlpha = 0.75;
  ctx.fillText('Scan to open this binder', W / 2, 1230);
  ctx.fillText(link.replace(/^https?:\/\//, '').slice(0, 60), W / 2, 1290, W - 120);
  ctx.globalAlpha = 1;
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No picture.'))), 'image/png'));
}

/** Save a picture (a phone's share sheet when it takes files, else a download). */
export async function savePicture(blob: Blob, fileName: string, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && 'ontouchstart' in window) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'shared';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}

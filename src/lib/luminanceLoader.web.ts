/**
 * A picture reduced to a small greyscale grid (matStyle.ts LuminanceSample) — web. The browser
 * decodes it, a 160px-wide canvas shrinks it, and the grey bytes come out of getImageData. Any
 * failure (no CORS header, undecodable, canvas blocked) is null: the mat then keeps its chosen
 * ink, which is what it showed before the picture was read.
 */
import type { LuminanceSample } from '@/data/matStyle';

const GRID_W = 160;

export async function loadLuminanceSample(uri: string): Promise<LuminanceSample | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    const res = await fetch(uri, { mode: 'cors' });
    if (!res.ok) return null;
    bitmap = await createImageBitmap(await res.blob());
    const pw = bitmap.width;
    const ph = bitmap.height;
    if (!pw || !ph) return null;
    const lw = GRID_W;
    const lh = Math.max(1, Math.round((lw * ph) / pw));
    const canvas = document.createElement('canvas');
    canvas.width = lw;
    canvas.height = lh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, lw, lh);
    const { data } = ctx.getImageData(0, 0, lw, lh);
    const grey = new Uint8Array(lw * lh);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
      // Rec. 601 luma, over the alpha: a transparent pixel reads as the paper would, mid grey.
      const a = data[i + 3] / 255;
      const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grey[j] = Math.round(y * a + 128 * (1 - a));
    }
    return { pw, ph, lw, lh, data: grey };
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

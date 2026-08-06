/**
 * Re-encode art the share-image renderer can't read (WebP/AVIF/HEIC) into PNG or JPEG — web.
 *
 * The browser already decodes these formats, so the conversion is just decode → canvas → encode.
 * Transparency decides the target: PNG when any pixel is translucent (sliced wordart is routinely
 * a transparent cut-out, and JPEG would flatten it onto black), JPEG otherwise — re-encoding a
 * photograph as PNG can multiply its size tenfold.
 *
 * Returns null whenever it can't do better than the original (undecodable, canvas blocked); the
 * caller then stores the source bytes as-is, correctly labelled.
 */

/** Above this, skip the alpha scan and assume transparency — PNG is lossless, so it's the safe bet. */
const ALPHA_SCAN_MAX_PIXELS = 40_000_000;

export async function transcodeToRenderable(
  blob: Blob,
): Promise<{ blob: Blob; mime: string } | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);

    const mime = hasAlpha(ctx, canvas.width, canvas.height) ? 'image/png' : 'image/jpeg';
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, mime === 'image/jpeg' ? 0.92 : undefined),
    );
    return out && out.size > 0 ? { blob: out, mime } : null;
  } catch {
    return null; // undecodable here — keep the original bytes rather than losing the image
  } finally {
    bitmap?.close?.();
  }
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  if (w * h > ALPHA_SCAN_MAX_PIXELS) return true;
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  } catch {
    return true; // tainted canvas or OOM — PNG is lossless, so it can't make things worse
  }
}

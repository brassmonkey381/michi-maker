/**
 * Art pixels for the fill-sheet PDF (web) — fetch a binder artwork image as bytes pdf-lib can
 * embed, whatever the host or format:
 *
 *  - Direct CORS fetch first; hosts that don't send CORS headers (artofpkm's CDN,
 *    pokemoncenter, pinimg, pexels…) fall back to the `art-proxy` edge function.
 *  - pdf-lib embeds only PNG/JPEG. Anything else (webp card art, gifs…) — and anything
 *    oversized — is decoded and re-encoded through an offscreen canvas.
 *  - artofpkm "representation" URLs (resized webp) are swapped for the original blob first,
 *    so prints get the artist's full-resolution upload.
 *
 * Results are cached per URL for the session; a failed image resolves null and the PDF prints
 * a labeled fallback tile for those pieces instead of aborting the whole export.
 */
import { supabasePublishableKey, supabaseUrl } from '@/lib/env';

export interface LoadedArt {
  bytes: Uint8Array;
  kind: 'png' | 'jpg';
  width: number;
  height: number;
}
export type ArtLoader = (url: string) => Promise<LoadedArt | null>;

/** Longest edge of an embedded image — plenty for 300dpi at 2×3 pockets, keeps PDFs sane. */
const MAX_EDGE = 2600;

/** artofpkm representation (resized webp) → the original full-res blob. */
export function artOriginalUrl(url: string): string {
  return url.replace(/\/representations\/redirect\/([^/]+)\/[^/]+\//, '/blobs/redirect/$1/');
}

const sniff = (bytes: Uint8Array): 'png' | 'jpg' | 'other' => {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  return 'other';
};

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch {
    // CORS-blocked or network error — fall through to the proxy.
  }
  if (!supabaseUrl) return null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/art-proxy?url=${encodeURIComponent(url)}`, {
      headers: supabasePublishableKey ? { apikey: supabasePublishableKey } : undefined,
    });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch {
    // proxy unreachable
  }
  return null;
}

/** Decode → (maybe downscale) → PNG re-encode via canvas. Needs the bytes already in hand. */
async function canvasConvert(bytes: Uint8Array): Promise<LoadedArt | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'png', width: w, height: h };
  } catch {
    return null;
  }
}

/** Read a PNG/JPEG's pixel size from its bytes (cheap, avoids a decode for pass-through). */
async function imageSize(bytes: Uint8Array): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export function createWebArtLoader(): ArtLoader {
  const cache = new Map<string, Promise<LoadedArt | null>>();
  return (url: string) => {
    const key = artOriginalUrl(url);
    let hit = cache.get(key);
    if (!hit) {
      hit = (async () => {
        const bytes = await fetchBytes(key);
        if (!bytes) return null;
        const kind = sniff(bytes);
        const size = await imageSize(bytes);
        if (!size) return null;
        // Pass PNG/JPEG through untouched (no quality loss) unless oversized.
        if (kind !== 'other' && Math.max(size.width, size.height) <= MAX_EDGE) {
          return { bytes, kind, ...size };
        }
        return canvasConvert(bytes);
      })();
      cache.set(key, hit);
    }
    return hit;
  };
}

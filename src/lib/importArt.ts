/**
 * Import a REMOTE image (pasted or dragged URL) into the user's OWN `binder-art` storage bucket,
 * returning the bucket URL. michi-maker hosts what the user brings — we never persist a hotlink to
 * someone else's server. The original source is kept separately as attribution (the credit), not
 * as the image location.
 *
 * Fetch path mirrors the fill-sheet loader: a direct CORS fetch first, then the `art-proxy` edge
 * function for hosts that don't send CORS headers. If neither works we throw a clear message so the
 * caller can tell the user to download the image and use Upload instead — we do NOT fall back to
 * storing the remote URL.
 */
import { uploadArtImage } from '@/lib/uploadArt';
import { supabasePublishableKey, supabaseUrl } from '@/lib/env';

const MIME_BY_SIG: { test: (b: Uint8Array) => boolean; type: string }[] = [
  { test: (b) => b[0] === 0x89 && b[1] === 0x50, type: 'image/png' },
  { test: (b) => b[0] === 0xff && b[1] === 0xd8, type: 'image/jpeg' },
  { test: (b) => b[0] === 0x47 && b[1] === 0x49, type: 'image/gif' },
  { test: (b) => b[8] === 0x57 && b[9] === 0x45, type: 'image/webp' }, // 'WE' of WEBP at offset 8
];

function sniffType(bytes: Uint8Array, contentType: string | null): string {
  if (contentType && contentType.startsWith('image/')) return contentType;
  for (const m of MIME_BY_SIG) if (m.test(bytes)) return m.type;
  return 'image/png';
}

async function fetchImage(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  // Direct CORS fetch — works for hosts that send CORS headers.
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { bytes, type: sniffType(bytes, res.headers.get('content-type')) };
    }
  } catch {
    // fall through to the proxy
  }
  // art-proxy edge function for no-CORS hosts (allowlisted art hosts only).
  if (supabaseUrl) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/art-proxy?url=${encodeURIComponent(url)}`, {
        headers: supabasePublishableKey ? { apikey: supabasePublishableKey } : undefined,
      });
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { bytes, type: sniffType(bytes, res.headers.get('content-type')) };
      }
    } catch {
      // proxy unreachable
    }
  }
  return null;
}

/**
 * Fetch a remote image and upload a copy to the user's bucket; resolves to the bucket URL. Throws
 * a user-facing message if the image can't be fetched (so the caller prompts a manual Upload) — it
 * never returns the remote URL.
 */
export async function importRemoteArtToBucket(url: string): Promise<string> {
  const got = await fetchImage(url);
  if (!got || got.bytes.length === 0) {
    throw new Error(
      'Couldn’t import that image directly (the site may block it). Download the image, then use Upload.',
    );
  }
  const type = got.type || sniffType(got.bytes, null);
  const ext = type.split('/')[1] ?? 'png';
  const blob = new Blob([got.bytes as BlobPart], { type });
  return uploadArtImage(blob, `imported.${ext}`);
}

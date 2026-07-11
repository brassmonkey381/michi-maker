/**
 * Gated catalog source — the app side of DATA-PROTECTION-PLAN.md P3.
 *
 * When a Supabase session exists (guest or registered), the catalog is fetched via the
 * data server's `catalog-key` edge function: it validates our APP-project JWT and returns
 * the current AES-256-GCM key + a short-lived signed URL for the PRIVATE `catalog.enc`
 * (12-byte IV || ciphertext of gzip(catalog.json)). We stream-download it (real progress),
 * decrypt with Web Crypto, gunzip with DecompressionStream, and hand the kit the parsed
 * RawCatalog through its `catalogSource` seam.
 *
 * Fallbacks keep the app working everywhere: no session / native (no Web Crypto+gzip
 * streams) / any gated-path failure → the public catalog.json (which remains published
 * during the migration; the protective flip retires it once this path is proven).
 */
import { Platform } from 'react-native';

import type { CatalogSource, RawCatalog } from 'tcgscan-browse';

import { supabase } from '@/lib/supabase';

/** The data server's edge-function origin (same project as the browse bucket/API). */
const CATALOG_KEY_FN = 'https://bmhjizcmwtmcrstadqto.supabase.co/functions/v1/catalog-key';

type Progress = ((received: number, total: number) => void) | undefined;

/** Stream a response body, reporting progress; returns the concatenated bytes. */
async function streamBytes(res: Response, onProgress: Progress): Promise<Uint8Array> {
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body?.getReader?.();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total || received);
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Public catalog.json (streamed for progress) — the migration-period fallback. */
async function fetchPublic(onProgress: Progress): Promise<RawCatalog> {
  const base = process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL ?? '/browse';
  const res = await fetch(`${base}/catalog.json`);
  if (!res.ok) throw new Error(`catalog.json ${res.status}`);
  const bytes = await streamBytes(res, onProgress);
  return JSON.parse(new TextDecoder().decode(bytes)) as RawCatalog;
}

/** True when this runtime can run the gated path (Web Crypto + gzip streams). */
function gatedSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle &&
    typeof DecompressionStream !== 'undefined'
  );
}

async function fetchGated(onProgress: Progress): Promise<RawCatalog> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error('no session');

  const keyRes = await fetch(CATALOG_KEY_FN, { headers: { Authorization: `Bearer ${token}` } });
  if (!keyRes.ok) throw new Error(`catalog-key ${keyRes.status}`);
  const { key, url } = (await keyRes.json()) as { key: string; url: string };

  const encRes = await fetch(url);
  if (!encRes.ok) throw new Error(`catalog.enc ${encRes.status}`);
  const blob = await streamBytes(encRes, onProgress);

  // 12-byte IV || AES-256-GCM ciphertext of gzip(catalog.json)
  const rawKey = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const gz = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.slice(0, 12) },
    cryptoKey,
    blob.slice(12),
  );
  const text = await new Response(
    new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).text();
  return JSON.parse(text) as RawCatalog;
}

/**
 * The kit's `catalogSource`: gated when possible, public otherwise — degrade, never block.
 * (The encrypted blob is ~0.8 MB vs the ~8.8 MB decoded public JSON, so the gated path is
 * also the faster download.)
 */
export const gatedCatalogSource: CatalogSource = async (onProgress) => {
  if (gatedSupported() && supabase) {
    try {
      return await fetchGated(onProgress);
    } catch {
      // fall through — key endpoint down / no session yet / decrypt failure
    }
  }
  return fetchPublic(onProgress);
};

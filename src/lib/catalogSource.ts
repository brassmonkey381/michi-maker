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

import { readCatalogCache, writeCatalogCache } from '@/lib/catalogCache';
import { supabase } from '@/lib/supabase';

/** The data server's edge-function origin (same project as the browse bucket/API). */
const CATALOG_KEY_FN = 'https://bmhjizcmwtmcrstadqto.supabase.co/functions/v1/catalog-key';

type Progress = ((received: number, total: number) => void) | undefined;

/** Stream a response body, reporting progress; returns the concatenated bytes. */
async function streamBytes(res: Response, onProgress: Progress): Promise<Uint8Array<ArrayBuffer>> {
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

/**
 * A CURRENT app-project access token. getSession() hands back whatever is in storage — right
 * after a page load that can be an expired/stale-kid JWT that the key endpoint's getUser()
 * rejects (a 401 even though the user is signed in) — so refresh when it's expired or close.
 */
async function freshToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 - Date.now() < 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? session.access_token;
  }
  return session.access_token;
}

/** Decrypt (AES-256-GCM) + gunzip a `catalog.enc` blob to the parsed RawCatalog. */
async function decodeCatalog(
  enc: Uint8Array<ArrayBuffer>,
  rawKey: Uint8Array<ArrayBuffer>,
): Promise<RawCatalog> {
  // 12-byte IV || AES-256-GCM ciphertext of gzip(catalog.json)
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const gz = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: enc.slice(0, 12) },
    cryptoKey,
    enc.slice(12),
  );
  const text = await new Response(
    new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).text();
  return JSON.parse(text) as RawCatalog;
}

async function fetchGated(onProgress: Progress): Promise<RawCatalog> {
  const token = await freshToken();
  if (!token) throw new Error('no session');

  // 1) Ask the key endpoint for {version, key, url}. This is the only networked step; if it fails
  //    (offline, endpoint down), fall back to the encrypted-at-rest cache before giving up.
  let keyInfo: { version: string; key: string; url: string };
  try {
    let keyRes = await fetch(CATALOG_KEY_FN, { headers: { Authorization: `Bearer ${token}` } });
    if (keyRes.status === 401 && supabase) {
      // The stored token was already invalid (expired mid-flight / signing-key rotation) —
      // force-refresh the session once and retry before giving up.
      const { data: refreshed } = await supabase.auth.refreshSession();
      const retryToken = refreshed.session?.access_token;
      if (retryToken && retryToken !== token) {
        keyRes = await fetch(CATALOG_KEY_FN, { headers: { Authorization: `Bearer ${retryToken}` } });
      }
    }
    if (!keyRes.ok) throw new Error(`catalog-key ${keyRes.status}`);
    keyInfo = (await keyRes.json()) as { version: string; key: string; url: string };
  } catch (err) {
    // Only a genuine NETWORK failure (offline) serves the encrypted-at-rest cache — `fetch`
    // rejects with a TypeError when it can't reach the host. An HTTP error status is a server
    // that spoke (403 = lost offline entitlement, 503 = catalog down): honor it and rethrow so
    // the caller degrades to the public/cold path rather than silently serving a stale copy.
    if (err instanceof TypeError) {
      const cached = await readCatalogCache();
      if (cached) {
        onProgress?.(1, 1); // no download — fill the bar's download portion
        return decodeCatalog(cached.enc, cached.key);
      }
    }
    throw err;
  }

  // 2) Online. Reuse the cached blob when its version matches — skips the ~1.3 MB re-download.
  const cached = await readCatalogCache();
  const rawKey = Uint8Array.from(atob(keyInfo.key), (c) => c.charCodeAt(0));
  if (cached && cached.version === keyInfo.version) {
    onProgress?.(1, 1);
    return decodeCatalog(cached.enc, rawKey);
  }

  // 3) No cache, or a new publish rotated the version: download, decode, and re-cache (blob +
  //    key wrapped under the device key) so the next cold start / an offline launch can reuse it.
  const encRes = await fetch(keyInfo.url);
  if (!encRes.ok) throw new Error(`catalog.enc ${encRes.status}`);
  const blob = await streamBytes(encRes, onProgress);
  const catalog = await decodeCatalog(blob, rawKey);
  await writeCatalogCache(keyInfo.version, blob, rawKey);
  return catalog;
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
    } catch (e) {
      // Fall through to the public URL — but say why, because the public catalog.json has been
      // retired upstream (the P3 protective flip): if this warning shows a gated failure, the
      // fallback will 400 and the catalog is effectively down for this user.
      console.warn(`[michi-maker] gated catalog failed: ${(e as Error).message}`);
    }
  }
  return fetchPublic(onProgress);
};

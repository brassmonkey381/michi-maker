/**
 * art-proxy — CORS-friendly image relay for the fill-sheet PDF export.
 *
 * The Print-placeholders PDF embeds the binder's artwork pixels, which means the BROWSER must
 * fetch the image bytes — and several art hosts users place from (artofpkm.com's CDN,
 * pokemoncenter.com, pinimg.com, pexels.com) send no Access-Control-Allow-Origin header, so a
 * direct fetch is blocked. This function relays those images server-side and returns them with
 * permissive CORS. The client tries a direct CORS fetch first and only falls back here.
 *
 * NOT an open proxy: only https URLs on the allowlisted art hosts below are relayed, only
 * image/* responses are returned, and bodies are capped. Public (no JWT) — it serves the same
 * public images the app already displays via <img>.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

/** Exact hostnames (or *.suffixes) art may be relayed from — the hosts real binders use. */
const ALLOWED_HOSTS = new Set([
  'www.artofpkm.com',
  'artofpkm.com',
  'cdn.artofpkm.com',
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'www.pokemoncenter.com',
  'images.pexels.com',
  'i.pinimg.com',
]);
const ALLOWED_SUFFIXES = ['.wixmp.com', '.wikimedia.org'];

const MAX_BYTES = 25 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function hostAllowed(host: string): boolean {
  return ALLOWED_HOSTS.has(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: CORS });

  const raw = new URL(req.url).searchParams.get('url') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response('bad url', { status: 400, headers: CORS });
  }
  if (target.protocol !== 'https:' || !hostAllowed(target.hostname)) {
    return new Response('host not allowed', { status: 403, headers: CORS });
  }

  const upstream = await fetch(target.toString(), {
    redirect: 'follow',
    headers: { 'user-agent': 'michi-maker-art-proxy/1.0 (+https://michi-maker.com)' },
  });
  if (!upstream.ok) {
    return new Response(`upstream ${upstream.status}`, { status: 502, headers: CORS });
  }
  const type = upstream.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) {
    return new Response('not an image', { status: 415, headers: CORS });
  }
  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return new Response('too large', { status: 413, headers: CORS });
  }
  return new Response(buf, {
    headers: {
      ...CORS,
      'Content-Type': type,
      // Art is effectively immutable (content-addressed CDNs / stable uploads) — cache hard.
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
});

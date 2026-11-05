/**
 * art-proxy — CORS-friendly image relay for the fill-sheet PDF export.
 *
 * The Print-placeholders PDF embeds the binder's artwork pixels, which means the BROWSER must
 * fetch the image bytes — and the free-photo libraries (pexels.com, pixabay.com) send no
 * Access-Control-Allow-Origin header, so a direct fetch is blocked. This function relays those
 * images server-side and returns them with permissive CORS. The client tries a direct CORS fetch
 * first and only falls back here. Since 2026-07-17 every imported picture is re-hosted in the
 * user's own bucket at import time, so this is reached at import, not at print.
 *
 * NOT an open proxy: only https URLs on the allowlisted art hosts below are relayed, only
 * image/* responses are returned, and bodies are capped. Public (no JWT) — it serves the same
 * public images the app already displays via <img>.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { publishableKey, secretKey } from '../_shared/keys.ts';

/**
 * Exact hostnames (or *.suffixes) art may be relayed from. THE BROWSER DOES THE FETCHING (owner,
 * 2026-11-05: "can we make the user's browser do the fetching instead?"): this relay serves only
 * the two free-photo libraries the app searches itself (Pexels and Pixabay, whose terms allow the
 * use) and Wikimedia Commons. Every other host is fetched by the user's own browser with a plain
 * CORS request; a site that refuses means the user saves the picture and uploads it, which is
 * the purest form of bringing their own art. The art-site hosts this list used to carry
 * (artofpkm.com, pokemoncenter.com, pinimg.com, DeviantArt's wixmp CDN) were removed with the
 * Find art directory (docs/roadmap/ART-RIGHTS.md): the app does not copy from them on anyone's
 * behalf.
 */
const ALLOWED_HOSTS = new Set([
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'images.pexels.com',
  'pixabay.com',
  'cdn.pixabay.com',
]);
const ALLOWED_SUFFIXES = ['.wikimedia.org', '.pixabay.com'];

/**
 * ADMINS ONLY (owner, 2026-11-05: "keep the fan-art hosts"): the two sites the admin-only fan-art
 * fill searches (supabase/functions/fan-art). Relayed only for a signed-in caller whose profile
 * row says `is_admin`, checked the way fan-art checks it; everyone else gets 403, the same as any
 * host not on the list. Nothing in the client can widen this.
 */
const ADMIN_HOSTS = new Set(['www.artofpkm.com', 'artofpkm.com', 'cdn.artofpkm.com']);
const ADMIN_SUFFIXES = ['.wixmp.com'];

const MAX_BYTES = 25 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function hostAllowed(host: string): boolean {
  return ALLOWED_HOSTS.has(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
}
function adminHost(host: string): boolean {
  return ADMIN_HOSTS.has(host) || ADMIN_SUFFIXES.some((s) => host.endsWith(s));
}
async function isAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || token === publishableKey()) return false;
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey());
  const { data: { user } } = await authClient.auth.getUser(token);
  if (!user) return false;
  const service = createClient(Deno.env.get('SUPABASE_URL')!, secretKey());
  const { data: profile } = await service.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  return !!profile?.is_admin;
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
  if (target.protocol !== 'https:') {
    return new Response('host not allowed', { status: 403, headers: CORS });
  }
  if (!hostAllowed(target.hostname) && !(adminHost(target.hostname) && (await isAdmin(req)))) {
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

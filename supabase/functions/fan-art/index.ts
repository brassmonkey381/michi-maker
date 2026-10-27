/**
 * fan-art — a Pokémon art search over DeviantArt and Art of Pokémon, FOR ADMINS ONLY.
 *
 * michi-maker does not supply Pokémon art to its users (docs/roadmap/ART-RIGHTS.md): the user
 * brings the picture, the app hosts it. The owner wants to TEST what an automatic fill by species
 * would look like before deciding anything (2026-10-27), so this search answers only a signed-in
 * caller whose profile row says `is_admin`. Everyone else gets 403, and nothing in the client
 * shows the control to them either (collect.tsx). If this ever opens up, ART-RIGHTS.md changes
 * first.
 *
 * Both sources are read as public pages, no keys: DeviantArt's RSS feed (the same feed the
 * persona binder script used) and Art of Pokémon's browse page, whose result tiles carry the
 * picture, its size and its title as data attributes. A hit's `url` is relayed through art-proxy
 * when the client re-hosts it (both CDNs are on its allowlist) and credited to the author and
 * source page.
 *
 * POST { q: string; source?: 'deviantart' | 'artofpkm' | 'all'; per?: number }
 *  → { hits: FanArtHit[]; providers: Record<'deviantart' | 'artofpkm', 'ok' | 'error' | 'skipped'> }
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { publishableKey, secretKey } from '../_shared/keys.ts';

interface FanArtHit {
  provider: 'deviantart' | 'artofpkm';
  id: string;
  url: string;
  width: number;
  height: number;
  thumb: string;
  author: string;
  authorUrl?: string;
  pageUrl: string;
  title?: string;
}

type Source = 'deviantart' | 'artofpkm' | 'all';
type ProviderState = 'ok' | 'error' | 'skipped';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

async function timed(url: string): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    return await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (michi-maker fan-art test)' } });
  } finally {
    clearTimeout(t);
  }
}

const unescapeHtml = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** DeviantArt's public RSS for a query: one item per deviation, with the picture's size and author. */
async function deviantart(q: string, per: number): Promise<FanArtHit[]> {
  const u = `https://backend.deviantart.com/rss.xml?type=deviation&q=${encodeURIComponent(`${q} pokemon`)}`;
  const res = await timed(u);
  if (!res.ok) throw new Error(`deviantart ${res.status}`);
  const xml = await res.text();
  const hits: FanArtHit[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    if (/<media:rating>adult/.test(it)) continue;
    const url = (it.match(/<media:content[^>]*url="([^"]+)"[^>]*medium="image"/) ?? [])[1] ?? '';
    if (!url) continue;
    const link = (it.match(/<link>([^<]*)<\/link>/) ?? [])[1] ?? '';
    const author = (it.match(/<media:credit[^>]*>([^<]*)<\/media:credit>/) ?? [])[1] ?? '';
    const thumbs = [...it.matchAll(/<media:thumbnail[^>]*url="([^"]+)"/g)].map((t) => t[1]);
    hits.push({
      provider: 'deviantart',
      id: link.split('/').pop() || url,
      url: unescapeHtml(url),
      width: Number((it.match(/<media:content[^>]*width="(\d+)"/) ?? [])[1] ?? 0),
      height: Number((it.match(/<media:content[^>]*height="(\d+)"/) ?? [])[1] ?? 0),
      thumb: unescapeHtml(thumbs[thumbs.length - 1] ?? url),
      author,
      authorUrl: author ? `https://www.deviantart.com/${encodeURIComponent(author)}` : undefined,
      pageUrl: link,
      title: unescapeHtml((it.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? ''),
    });
    if (hits.length >= per) break;
  }
  return hits;
}

/** Art of Pokémon's browse page for a query: every result tile names its picture, size and title. */
async function artofpkm(q: string, per: number): Promise<FanArtHit[]> {
  const res = await timed(`https://www.artofpkm.com/artwork/all?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`artofpkm ${res.status}`);
  const html = await res.text();
  const hits: FanArtHit[] = [];
  for (const m of html.matchAll(/<a\b[^>]*data-lightbox-src="([^"]+)"[^>]*>/g)) {
    const tag = m[0];
    const attr = (name: string) => unescapeHtml((tag.match(new RegExp(`${name}="([^"]*)"`)) ?? [])[1] ?? '');
    const url = attr('data-lightbox-src');
    const page = attr('data-lightbox-url') || attr('href');
    if (!url || !page) continue;
    // The illustrator, when the tile's row names one, sits after the tile; the page credits it either way.
    const after = html.slice(m.index! + tag.length, m.index! + tag.length + 2500);
    const illu = (after.match(/href="\/illustrators\/[^"]+"[^>]*>([^<]+)</) ?? [])[1]?.trim() ?? '';
    hits.push({
      provider: 'artofpkm',
      id: page.split('/').pop() || url,
      url,
      width: Number(attr('data-lightbox-width') || 0),
      height: Number(attr('data-lightbox-height') || 0),
      thumb: url,
      author: illu || 'Art of Pokémon',
      pageUrl: page.startsWith('http') ? page : `https://www.artofpkm.com${page}`,
      title: attr('data-lightbox-title'),
    });
    if (hits.length >= per) break;
  }
  return hits;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Who is asking, and are they an admin. The token is passed explicitly (see theme-search), and
  // the profile is read with the service client so an RLS change can never widen this.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not signed in' }, 401);
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey());
  const { data: { user } } = await authClient.auth.getUser(token);
  if (!user) return json({ error: 'not signed in' }, 401);
  const service = createClient(Deno.env.get('SUPABASE_URL')!, secretKey());
  const { data: profile } = await service.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) return json({ error: 'admins only' }, 403);

  let body: { q?: unknown; source?: unknown; per?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const q = typeof body.q === 'string' ? body.q.trim().slice(0, 80) : '';
  if (!q) return json({ error: 'q required' }, 400);
  const source: Source = (['deviantart', 'artofpkm', 'all'] as const).find((s) => s === body.source) ?? 'all';
  const per = typeof body.per === 'number' && body.per > 0 ? Math.min(Math.floor(body.per), 40) : 20;

  const providers: Record<'deviantart' | 'artofpkm', ProviderState> = { deviantart: 'skipped', artofpkm: 'skipped' };
  const tasks: Promise<FanArtHit[]>[] = [];
  if (source !== 'artofpkm') tasks.push(deviantart(q, per).then((h) => ((providers.deviantart = 'ok'), h), () => ((providers.deviantart = 'error'), [])));
  if (source !== 'deviantart') tasks.push(artofpkm(q, per).then((h) => ((providers.artofpkm = 'ok'), h), () => ((providers.artofpkm = 'error'), [])));
  const lists = await Promise.all(tasks);
  const hits: FanArtHit[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i += 1) for (const l of lists) if (l[i]) hits.push(l[i]);
  return new Response(JSON.stringify({ hits, providers }), {
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'private, max-age=600' },
  });
});

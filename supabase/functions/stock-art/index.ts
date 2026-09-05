/**
 * stock-art — one search over Pexels and Pixabay, keys kept server-side.
 *
 * The story-binder builder dresses each spread with a stock image (a snowy forest for Winter, a
 * sunrise for Dawn). Both providers need an API key, and a key shipped inside the web bundle is a
 * public key in all but name, so the searches run here: the client sends a query, this function
 * fans out to whichever providers have a key configured, and returns one normalised list.
 *
 * What the client does with a hit is unchanged from any other outside image: it re-hosts the bytes
 * into the user's own `binder-art` bucket (importArt.ts) and stamps the credit — so the image the
 * binder shows is one we serve, and the photographer is named. That also satisfies Pixabay, which
 * forbids hotlinking its CDN, and Pexels, which asks for attribution.
 *
 * Signed-in callers only (verify_jwt stays on — a plain `functions deploy` keeps it). Secrets:
 * PEXELS_API_KEY, PIXABAY_API_KEY; a missing key just drops that provider from the results.
 *
 * POST { q: string; orientation?: 'landscape' | 'portrait' | 'square'; kind?: 'photo' | 'illustration' | 'any'; per?: number }
 *  → { hits: StockHit[]; providers: Record<'pexels' | 'pixabay', 'ok' | 'no-key' | 'error' | 'skipped'> }
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

interface StockHit {
  provider: 'pexels' | 'pixabay';
  id: string;
  /** The image to download: the largest size that stays under a few MB. */
  url: string;
  width: number;
  height: number;
  /** A small preview for the sheet. */
  thumb: string;
  /** Photographer / uploader, for the credit strip. */
  author: string;
  authorUrl?: string;
  /** The page to link the credit to. */
  pageUrl: string;
  /** Provider-side tags (Pixabay) — handy for ranking a hit against the theme. */
  tags?: string;
}

type Orientation = 'landscape' | 'portrait' | 'square';
type Kind = 'photo' | 'illustration' | 'any';
type ProviderState = 'ok' | 'no-key' | 'error' | 'skipped';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

/** Give a provider six seconds; a slow provider should not stall the whole spread. */
async function timed(url: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function pexels(q: string, orientation: Orientation | undefined, per: number, key: string): Promise<StockHit[]> {
  const u = new URL('https://api.pexels.com/v1/search');
  u.searchParams.set('query', q);
  u.searchParams.set('per_page', String(Math.min(per, 40)));
  if (orientation) u.searchParams.set('orientation', orientation);
  const res = await timed(u.toString(), { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`pexels ${res.status}`);
  const body = (await res.json()) as {
    photos?: {
      id: number;
      width: number;
      height: number;
      url: string;
      photographer: string;
      photographer_url?: string;
      src: { original: string; large2x?: string; large?: string; medium?: string };
    }[];
  };
  return (body.photos ?? []).map((p) => {
    // large2x is ~1880px on the long side: plenty for a page panel, a fraction of the original.
    const scale = p.width > 0 ? Math.min(1, 1880 / Math.max(p.width, p.height)) : 1;
    return {
      provider: 'pexels' as const,
      id: String(p.id),
      url: p.src.large2x ?? p.src.large ?? p.src.original,
      width: Math.round(p.width * scale),
      height: Math.round(p.height * scale),
      thumb: p.src.medium ?? p.src.large ?? p.src.original,
      author: p.photographer,
      authorUrl: p.photographer_url,
      pageUrl: p.url,
    };
  });
}

async function pixabay(q: string, orientation: Orientation | undefined, kind: Kind, per: number, key: string): Promise<StockHit[]> {
  const u = new URL('https://pixabay.com/api/');
  u.searchParams.set('key', key);
  u.searchParams.set('q', q);
  u.searchParams.set('image_type', kind === 'illustration' ? 'illustration' : kind === 'photo' ? 'photo' : 'all');
  u.searchParams.set('orientation', orientation === 'portrait' ? 'vertical' : orientation === 'landscape' ? 'horizontal' : 'all');
  u.searchParams.set('per_page', String(Math.max(3, Math.min(per, 50))));
  u.searchParams.set('safesearch', 'true');
  const res = await timed(u.toString());
  if (!res.ok) throw new Error(`pixabay ${res.status}`);
  const body = (await res.json()) as {
    hits?: {
      id: number;
      pageURL: string;
      tags?: string;
      imageWidth: number;
      imageHeight: number;
      largeImageURL: string;
      webformatURL: string;
      user: string;
      user_id: number;
    }[];
  };
  return (body.hits ?? []).map((h) => {
    // largeImageURL is scaled to 1280px on the long side; report the size the client will get.
    const scale = h.imageWidth > 0 ? Math.min(1, 1280 / Math.max(h.imageWidth, h.imageHeight)) : 1;
    return {
      provider: 'pixabay' as const,
      id: String(h.id),
      url: h.largeImageURL,
      width: Math.round(h.imageWidth * scale),
      height: Math.round(h.imageHeight * scale),
      thumb: h.webformatURL,
      author: h.user,
      authorUrl: `https://pixabay.com/users/${encodeURIComponent(h.user)}-${h.user_id}/`,
      pageUrl: h.pageURL,
      tags: h.tags,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { q?: unknown; orientation?: unknown; kind?: unknown; per?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const q = typeof body.q === 'string' ? body.q.trim().slice(0, 120) : '';
  if (!q) return json({ error: 'q required' }, 400);
  const orientation = (['landscape', 'portrait', 'square'] as const).find((o) => o === body.orientation);
  const kind: Kind = (['photo', 'illustration', 'any'] as const).find((k) => k === body.kind) ?? 'any';
  const per = typeof body.per === 'number' && body.per > 0 ? Math.min(Math.floor(body.per), 40) : 15;

  const pexKey = Deno.env.get('PEXELS_API_KEY') ?? '';
  const pixKey = Deno.env.get('PIXABAY_API_KEY') ?? '';
  const providers: Record<'pexels' | 'pixabay', ProviderState> = { pexels: 'skipped', pixabay: 'skipped' };

  const tasks: Promise<StockHit[]>[] = [];
  // Pexels is photographs only, so an illustration search goes to Pixabay alone.
  if (kind === 'illustration') providers.pexels = 'skipped';
  else if (!pexKey) providers.pexels = 'no-key';
  else {
    tasks.push(
      pexels(q, orientation, per, pexKey).then(
        (h) => ((providers.pexels = 'ok'), h),
        () => ((providers.pexels = 'error'), []),
      ),
    );
  }
  if (!pixKey) providers.pixabay = 'no-key';
  else {
    tasks.push(
      pixabay(q, orientation, kind, per, pixKey).then(
        (h) => ((providers.pixabay = 'ok'), h),
        () => ((providers.pixabay = 'error'), []),
      ),
    );
  }

  const lists = await Promise.all(tasks);
  // Interleave so neither provider monopolises the top of the list.
  const hits: StockHit[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i += 1) for (const l of lists) if (l[i]) hits.push(l[i]);

  return new Response(JSON.stringify({ hits, providers }), {
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'private, max-age=3600' },
  });
});

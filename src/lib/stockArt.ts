/**
 * STOCK ART for story binders: search Pexels and Pixabay through the `stock-art` edge function
 * (the keys live there), choose the hit that best fits a panel, re-host it into the user's own
 * `binder-art` bucket and hand back everything `placeArtPanels` needs — the bucket URL, a
 * cover-fit crop and the credit.
 *
 * Re-hosting is not optional: Pixabay forbids hotlinking and the app's rule for every outside
 * image is "we serve what we show" (importArt.ts). The credit names the photographer and links the
 * provider page, stamped `origin: 'external'` like any other imported art so the sharing gate sees
 * exactly what happened.
 */
import type { ArtAttribution } from '@/data/artworkLibrary';
import { importRemoteArtToBucket } from '@/lib/importArt';
import { requireSupabase } from '@/lib/supabase';

export interface StockHit {
  provider: 'pexels' | 'pixabay';
  id: string;
  url: string;
  width: number;
  height: number;
  thumb: string;
  author: string;
  authorUrl?: string;
  pageUrl: string;
  tags?: string;
}

export type StockOrientation = 'landscape' | 'portrait' | 'square';
export type StockKind = 'photo' | 'illustration' | 'any';

export interface StockSearchResult {
  hits: StockHit[];
  providers: Record<'pexels' | 'pixabay', 'ok' | 'no-key' | 'error' | 'skipped'>;
}

/** One search, both providers. Throws with a readable message when the function itself fails. */
export async function searchStockArt(
  q: string,
  opts: { orientation?: StockOrientation; kind?: StockKind; per?: number } = {},
): Promise<StockSearchResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke<StockSearchResult>('stock-art', {
    body: { q, orientation: opts.orientation, kind: opts.kind ?? 'any', per: opts.per ?? 15 },
  });
  if (error) throw new Error(`Stock art search failed: ${error.message}`);
  if (!data || !Array.isArray(data.hits)) throw new Error('Stock art search returned nothing.');
  return data;
}

/** A pocket is 63×88 with a small gap between pockets; a panel's aspect follows from its span. */
export function panelAspect(rowSpan: number, colSpan: number): number {
  const gap = 4;
  return (colSpan * 63 + (colSpan - 1) * gap) / (rowSpan * 88 + (rowSpan - 1) * gap);
}

export function orientationFor(aspect: number): StockOrientation {
  if (aspect > 1.2) return 'landscape';
  if (aspect < 0.85) return 'portrait';
  return 'square';
}

/**
 * The hit that best fits the panel: closest aspect (so the cover crop keeps most of the picture),
 * big enough to print (short side ≥ 700px), and not already used in this binder. Earlier hits win
 * ties — both providers rank by relevance.
 */
export function pickStockHit(hits: StockHit[], aspect: number, used: ReadonlySet<string> = new Set()): StockHit | null {
  let bestHit: StockHit | null = null;
  let bestCost = Infinity;
  for (const [i, h] of hits.entries()) {
    if (used.has(`${h.provider}:${h.id}`)) continue;
    if (!h.width || !h.height) continue;
    if (Math.min(h.width, h.height) < 700) continue;
    const fit = Math.abs(Math.log(h.width / h.height / aspect));
    // A little weight on rank so a marginally better-shaped 12th result does not beat the 1st.
    const cost = fit + i * 0.03;
    if (cost < bestCost) {
      bestCost = cost;
      bestHit = h;
    }
  }
  return bestHit;
}

/** The centred crop (fractions of the image) that fills a panel of `aspect` without distortion. */
export function coverCrop(width: number, height: number, aspect: number): { x: number; y: number; w: number; h: number } {
  const img = width / height;
  if (img > aspect) {
    const w = aspect / img;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = img / aspect;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

export function stockAttribution(hit: StockHit): ArtAttribution {
  return {
    artist: hit.author,
    sourceName: hit.provider === 'pexels' ? 'Pexels' : 'Pixabay',
    sourceUrl: hit.pageUrl,
    origin: 'external',
  };
}

export interface PlacedStockArt {
  hit: StockHit;
  /** The re-hosted image in the user's bucket. */
  imageUrl: string;
  crop: { x: number; y: number; w: number; h: number };
  attribution: ArtAttribution;
}

/**
 * Find and re-host art for one panel. Tries each query in turn, and within a query's results up
 * to three hits (a hit can fail to download). `used` is updated with the hit taken so the same
 * picture does not appear twice in a binder. Null when nothing could be found or fetched.
 */
export function fetchStockArtForPanel(
  queries: string[],
  rowSpan: number,
  colSpan: number,
  kind: StockKind,
  used: Set<string>,
): Promise<PlacedStockArt | null> {
  return fetchStockArtForAspect(queries, panelAspect(rowSpan, colSpan), kind, used);
}

/** The same, for any box: cover decorations give their aspect directly. */
export async function fetchStockArtForAspect(queries: string[], aspect: number, kind: StockKind, used: Set<string>): Promise<PlacedStockArt | null> {
  const orientation = orientationFor(aspect);
  for (const q of queries) {
    let result: StockSearchResult;
    try {
      result = await searchStockArt(q, { orientation, kind, per: 20 });
    } catch (e) {
      console.warn('[story] stock search failed', q, e instanceof Error ? e.message : e);
      continue;
    }
    if (result.hits.length === 0) console.warn('[story] no hits', q, result.providers);
    const tried = new Set(used);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const hit = pickStockHit(result.hits, aspect, tried);
      if (!hit) break;
      tried.add(`${hit.provider}:${hit.id}`);
      try {
        const imageUrl = await importRemoteArtToBucket(hit.url);
        used.add(`${hit.provider}:${hit.id}`);
        return { hit, imageUrl, crop: coverCrop(hit.width, hit.height, aspect), attribution: stockAttribution(hit) };
      } catch (e) {
        // The download failed (CORS and proxy both refused, or a dead link): try the next hit.
        console.warn('[story] re-host failed', hit.provider, hit.url, e instanceof Error ? e.message : e);
      }
    }
  }
  return null;
}

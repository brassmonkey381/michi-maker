/**
 * FAN ART BY SPECIES, ADMIN TEST ONLY (owner, 2026-10-27).
 *
 * The `fan-art` edge function searches DeviantArt and Art of Pokémon for a species and answers
 * admins alone; this is its client, shaped like stockArt.ts so a panel is filled the same way: the
 * best-fitting hit, re-hosted into the user's bucket, credited to the author and the source page,
 * stamped external. The control that calls it is shown only to an admin profile (collect.tsx),
 * so a user never sees it and never gets a 403. docs/roadmap/ART-RIGHTS.md says why the app does
 * not supply Pokémon art; this exists so the owner can see what the fill would look like before
 * deciding whether that posture should change.
 */
import { coverCrop, panelAspect, pickStockHit, stockAttribution, type PlacedStockArt, type StockHit } from '@/lib/stockArt';
import { importRemoteArtToBucket } from '@/lib/importArt';
import { requireSupabase } from '@/lib/supabase';

export type FanArtSource = 'deviantart' | 'artofpkm' | 'all';

export const FAN_ART_SOURCES: { id: FanArtSource; label: string; blurb: string }[] = [
  { id: 'all', label: 'Both sites', blurb: 'DeviantArt and Art of Pokémon, interleaved.' },
  { id: 'deviantart', label: 'DeviantArt', blurb: 'Fan art from DeviantArt’s public feed.' },
  { id: 'artofpkm', label: 'Art of Pokémon', blurb: 'Official art from artofpkm.com.' },
];

export interface FanArtSearchResult {
  hits: StockHit[];
  providers: Record<'deviantart' | 'artofpkm', 'ok' | 'error' | 'skipped'>;
}

/** One search, the chosen source(s). Throws with a readable message when the function refuses. */
export async function searchFanArt(q: string, source: FanArtSource, per = 20): Promise<FanArtSearchResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke<FanArtSearchResult>('fan-art', { body: { q, source, per } });
  if (error) throw new Error(`Fan art search failed: ${error.message}`);
  if (!data || !Array.isArray(data.hits)) throw new Error('Fan art search returned nothing.');
  return data;
}

/**
 * Find and re-host fan art for one panel, by species. Tries each query in turn and up to three
 * hits a query; `used` keeps one picture from appearing twice in a binder. Null when nothing fits.
 */
export async function fetchFanArtForPanel(queries: string[], rowSpan: number, colSpan: number, source: FanArtSource, used: Set<string>): Promise<PlacedStockArt | null> {
  const aspect = panelAspect(rowSpan, colSpan);
  for (const q of queries) {
    let result: FanArtSearchResult;
    try {
      result = await searchFanArt(q, source);
    } catch (e) {
      console.warn('[fan-art] search failed', q, e instanceof Error ? e.message : e);
      continue;
    }
    const tried = new Set(used);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const hit = pickStockHit(result.hits, aspect, tried, 500);
      if (!hit) break;
      tried.add(`${hit.provider}:${hit.id}`);
      try {
        const imageUrl = await importRemoteArtToBucket(hit.url);
        used.add(`${hit.provider}:${hit.id}`);
        return { hit, imageUrl, crop: coverCrop(hit.width, hit.height, aspect), attribution: stockAttribution(hit) };
      } catch (e) {
        console.warn('[fan-art] re-host failed', hit.provider, hit.url, e instanceof Error ? e.message : e);
      }
    }
  }
  return null;
}

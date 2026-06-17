/**
 * Live themed-art search against a free image API, used by the editor to auto-suggest
 * artwork panels that fit the selected slot's orientation.
 *
 * Provider is chosen by whichever free, client-usable key is present (EXPO_PUBLIC_*, never a
 * secret): Pexels (photos, very hotlink-friendly) or Pixabay (illustrations). With no key the
 * feature is simply off and the bundled playground library is used instead.
 *
 * Results are mapped to the same `ArtworkAsset` shape as the playground, tagged with their
 * source + license so provenance stays auditable.
 */

import type { ArtAspect, ArtworkAsset } from '@/data/artworkLibrary';

const PEXELS_KEY = process.env.EXPO_PUBLIC_PEXELS_KEY;
const PIXABAY_KEY = process.env.EXPO_PUBLIC_PIXABAY_KEY;

export const artSearchProvider: 'pexels' | 'pixabay' | 'none' = PEXELS_KEY
  ? 'pexels'
  : PIXABAY_KEY
    ? 'pixabay'
    : 'none';

export const isArtSearchConfigured = artSearchProvider !== 'none';

interface PexelsPhoto {
  id: number;
  alt: string | null;
  src: { large: string; medium: string };
}
interface PexelsResponse {
  photos?: PexelsPhoto[];
}

interface PixabayHit {
  id: number;
  webformatURL: string;
  tags: string;
}
interface PixabayResponse {
  hits?: PixabayHit[];
}

async function searchPexels(query: string, aspect: ArtAspect): Promise<ArtworkAsset[]> {
  // Pexels orientation values (landscape | portrait | square) match ArtAspect directly.
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${aspect}&per_page=24`,
    { headers: { Authorization: PEXELS_KEY as string } },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as PexelsResponse;
  return (json.photos ?? []).map((p) => ({
    id: `pexels-${p.id}`,
    url: p.src.large,
    title: p.alt?.trim() || query,
    themes: [query],
    aspect,
    sourceDomain: 'pexels.com',
    license: 'Pexels License',
    licenseClear: true,
  }));
}

async function searchPixabay(query: string, aspect: ArtAspect): Promise<ArtworkAsset[]> {
  const orientation = aspect === 'landscape' ? 'horizontal' : aspect === 'portrait' ? 'vertical' : 'all';
  const res = await fetch(
    `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=illustration&orientation=${orientation}&safesearch=true&per_page=24`,
  );
  if (!res.ok) return [];
  const json = (await res.json()) as PixabayResponse;
  return (json.hits ?? []).map((h) => ({
    id: `pixabay-${h.id}`,
    url: h.webformatURL,
    title: (h.tags || query).split(',')[0].trim(),
    themes: (h.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    aspect,
    sourceDomain: 'pixabay.com',
    license: 'Pixabay License',
    licenseClear: true,
  }));
}

/**
 * Search the configured image API for themed art matching the slot aspect. Returns [] when
 * no key is set, the query is empty, or the request fails — never throws.
 */
export async function searchArt(query: string, aspect: ArtAspect): Promise<ArtworkAsset[]> {
  if (!query.trim()) return [];
  try {
    if (PEXELS_KEY) return await searchPexels(query, aspect);
    if (PIXABAY_KEY) return await searchPixabay(query, aspect);
  } catch {
    return [];
  }
  return [];
}

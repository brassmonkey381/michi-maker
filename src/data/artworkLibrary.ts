/**
 * Artwork asset shape + small helpers shared by the artwork sources.
 *
 * There is no longer a bundled art library — artwork comes only from what the user pastes by
 * URL and from the live Pexels / Pixabay search (see `src/data/artSearch.ts`). This module now
 * just defines the common `ArtworkAsset` shape those sources map into, plus a couple of helpers.
 */

export type ArtAspect = 'landscape' | 'portrait' | 'square';

export interface ArtworkAsset {
  id: string;
  url: string;
  title: string;
  /** Theme keywords used to match a binder's palette/title. */
  themes: string[];
  /** The art's natural aspect (so it can be suggested for slots it fills cleanly). */
  aspect: ArtAspect;
  sourceDomain: string;
  license: string;
  /** false ⇒ provenance/licence unverified; review/remove before publishing. */
  licenseClear: boolean;
}

/** The aspect bucket a slot footprint falls into (cover-fit "fits" any, but this sorts best matches first). */
export function slotAspect(rows: number, cols: number): ArtAspect {
  return cols > rows ? 'landscape' : rows > cols ? 'portrait' : 'square';
}

/** Host of a URL, for tagging the provenance of pasted (unverified) art. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

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
  /** Structured provenance to STAMP on a slot when this asset is placed (so the credit is
   *  captured at import, not re-derived from the URL later). */
  attribution?: ArtAttribution;
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

/**
 * Structured provenance for one artwork. When a slice is imported we STORE this on the slot
 * (authoritative — the artist a domain can't tell you), and fall back to deriving what we can
 * from the source URL for slots that predate it. See `deriveAttribution`.
 */
export interface ArtAttribution {
  /** The illustrator, when known: "suyari", "Extra Vision", "VERONICA LODGE". */
  artist?: string;
  /** The platform/source name: "The Art of Pokémon", "Pinterest", "official card art". */
  sourceName: string;
  /** The specific page to credit/link (an artofpkm artwork page, a Pinterest pin), when known. */
  sourceUrl?: string;
  /**
   * Provenance class for the SHARING gate (not the credit):
   *  - 'external' — pulled from an outside URL (we can't verify the user's rights). PRIVATE: a
   *    binder containing this art can never be made public/shared.
   *  - 'upload' — a file the user brought from their device. Public-eligible (with attestation).
   * Absent ⇒ legacy/official content (card art, our own AI art) — not treated as private.
   */
  origin?: 'external' | 'upload';
}

const PLATFORM_NAMES: Record<string, string> = {
  'artofpkm.com': 'The Art of Pokémon',
  'pinterest.com': 'Pinterest',
  'pin.it': 'Pinterest',
  'deviantart.com': 'DeviantArt',
  'artstation.com': 'ArtStation',
  'twitter.com': 'X (Twitter)',
  'x.com': 'X (Twitter)',
  'pixiv.net': 'pixiv',
  'tumblr.com': 'Tumblr',
};

function platformName(domain: string): string {
  for (const [suffix, name] of Object.entries(PLATFORM_NAMES)) {
    if (domain === suffix || domain.endsWith(`.${suffix}`)) return name;
  }
  return domain;
}

/**
 * Resolve an artwork's provenance to a structured citation. A STORED attribution (captured at
 * import — the only place the artist is knowable) always wins; otherwise we derive what the URL
 * itself reveals: an artofpkm artwork page links back to itself, a Pinterest pin links to the
 * pin, uploads are the user's, the card pipeline is official art. The artist is left blank when
 * we genuinely don't know it (a bare domain can't name an illustrator).
 */
export function deriveAttribution(url: string, stored?: ArtAttribution | null): ArtAttribution {
  if (stored && (stored.artist || stored.sourceUrl || stored.sourceName)) {
    return { ...stored, sourceName: stored.sourceName || platformName(domainOf(url)) };
  }
  if (/^(blob|data):/i.test(url) || url.includes('/binder-art/')) {
    return { sourceName: 'your upload' };
  }
  const domain = domainOf(url);
  if (domain === 'unknown') return { sourceName: 'custom art' };
  if (domain.endsWith('tcgplayer.com') || url.includes('/card-imgs/')) {
    return { sourceName: 'official card art' };
  }
  // artofpkm: the artwork detail page IS the citation — link it when the url carries the id.
  if (domain.endsWith('artofpkm.com')) {
    const m = /\/artwork\/(\d+)/.exec(url);
    return {
      sourceName: 'The Art of Pokémon',
      sourceUrl: m ? `https://www.artofpkm.com/artwork/${m[1]}` : undefined,
    };
  }
  return { sourceName: platformName(domain) };
}

/** One-line human label: "artist · source" when the artist is known, else just the source. */
export function attributionLabel(a: ArtAttribution): string {
  return a.artist ? `${a.artist} · ${a.sourceName}` : a.sourceName;
}

/**
 * Short human attribution for a custom artwork URL — kept for callers that only have the URL.
 * Prefer `deriveAttribution` + `attributionLabel` when the slot's stored attribution is at hand.
 */
export function artAttribution(url: string): string {
  return attributionLabel(deriveAttribution(url));
}

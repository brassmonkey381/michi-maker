/**
 * Catalog data-source configuration — the app-side shim for the shared
 * `tcgscan-browse` package.
 *
 * Expo inlines EXPO_PUBLIC_* env only in APP source (never in node_modules), so
 * this module reads the env and injects it into the package exactly once, at
 * import time. Everything else in the app keeps importing from here — the
 * package's helpers are re-exported below, so this stays the single seam.
 *
 * ⚠️ NATIVE: a bare `/browse` path has no origin on iOS/Android — set
 * EXPO_PUBLIC_CATALOG_BROWSE_URL to an absolute URL for native builds.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cardThumbUrl,
  configureBrowse,
  getApiKey,
  getApiUrl,
  hydrateImageManifest,
  resolveImageUrl,
  useImageManifest,
} from 'tcgscan-browse';

/** Base URL the catalog JSON (and prices/alternates) are served from. */
export const browseUrl: string = process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL ?? '/browse';

/** Base prepended to site-root-relative card image paths ('' on local web). */
export const imgBase: string = process.env.EXPO_PUBLIC_CATALOG_IMG_BASE ?? '';

// Inject once at import time — package fetches read this lazily, so any module
// that imports this shim (directly or transitively) is configured in time.
configureBrowse({
  browseUrl,
  imgBase,
  apiUrl: process.env.EXPO_PUBLIC_CATALOG_API_URL,
  apiKey: process.env.EXPO_PUBLIC_CATALOG_API_KEY ?? '',
  // Persist the content-hashed image manifest across launches so the home
  // screen resolves covers (cardThumbUrl) instantly without the ~25MB catalog.
  // AsyncStorage is async KV, which is exactly the ManifestCache shape.
  cache: {
    getItem: (k) => AsyncStorage.getItem(k),
    setItem: (k, v) => AsyncStorage.setItem(k, v),
  },
});

export { cardThumbUrl, resolveImageUrl, hydrateImageManifest, useImageManifest };

/** PostgREST endpoint + publishable key (resolved by the package config). */
export const catalogApiUrl: string = getApiUrl();
export const catalogApiKey: string = getApiKey();

/**
 * Catalog data-source configuration seam.
 *
 * The catalog (taxonomy JSON + card images) is served from Expo's static `public/`
 * dir in dev. Keeping the source URLs here means switching to a Supabase Storage /
 * remote origin later is a one-file change — `loadCatalog` and the DemoCard adapter
 * both route through this module. Mirrors the `browseUrl` config seam in the sibling
 * tcgscan-expo app (its src/config.ts).
 *
 * EXPO_PUBLIC_* vars are inlined at build time (see src/lib/env.ts for the same
 * pattern), so these are constant per build and overridable without code changes.
 */

/**
 * Base URL the catalog JSON + images are served from.
 *
 * Default `'/browse'` is a site-root-relative path: it resolves correctly on **web**,
 * where Expo serves `public/` at the site root and `fetch('/browse/catalog.json')`
 * hits the dev server / deployed static site.
 *
 * ⚠️ NATIVE: a bare `/browse` path has no origin on iOS/Android, so `fetch` will fail.
 * On native builds you MUST set `EXPO_PUBLIC_CATALOG_BROWSE_URL` to an **absolute URL**
 * (e.g. `https://michi-maker.com/browse` or a Supabase Storage bucket URL) so the fetch
 * has a host to resolve against.
 */
export const browseUrl: string =
  process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL ?? '/browse';

/**
 * Base URL prepended to card image paths. The catalog stores images as local paths
 * (e.g. `/card-imgs/...`) which already resolve at the site root on web, so the
 * default is empty. Set `EXPO_PUBLIC_CATALOG_IMG_BASE` to an absolute origin when the
 * images live elsewhere (native builds, CDN, Supabase Storage).
 */
export const imgBase: string = process.env.EXPO_PUBLIC_CATALOG_IMG_BASE ?? '';

/**
 * Resolve a raw catalog image path to a fully-usable image URL. Absolute URLs
 * (`http(s)://…`) pass through untouched; site-root-relative paths get `imgBase`
 * prepended so a later origin swap is centralized here.
 */
export function resolveImageUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${imgBase}${path}`;
}

/**
 * The data server's REST (PostgREST) endpoint + publishable key — for dynamic
 * queries the static catalog can't answer (e.g. the find_similar embedding RPC).
 * The URL derives from the browse origin when it's absolute; both are
 * overridable. Empty when running purely on local static files.
 */
export const catalogApiUrl: string =
  process.env.EXPO_PUBLIC_CATALOG_API_URL ??
  (() => {
    try {
      return `${new URL(browseUrl).origin}/rest/v1`;
    } catch {
      return '';
    }
  })();

export const catalogApiKey: string = process.env.EXPO_PUBLIC_CATALOG_API_KEY ?? '';

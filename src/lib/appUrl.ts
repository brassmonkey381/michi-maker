/**
 * Absolute app URLs for shareable links. On web the origin is the current host;
 * on native it comes from EXPO_PUBLIC_APP_URL (falling back to the production domain),
 * since a native build has no `window.location`.
 */
import { Platform } from 'react-native';

const FALLBACK_ORIGIN = 'https://michi-maker.com';

export function appOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return process.env.EXPO_PUBLIC_APP_URL ?? FALLBACK_ORIGIN;
}

/**
 * The public, shareable URL for a binder (the `/binder/[id]` route).
 *
 * `?v=` is the binder's share_version, and it exists for the scrapers rather than for us. Discord,
 * Slack and iMessage cache an unfurl against the URL that was posted, for a day or more, and
 * nothing in the page can shorten that: busting the IMAGE url (see ogImageUrl) does nothing for a
 * scraper that never re-fetches the PAGE. A different v is a URL they have not seen, so the new
 * preview shows immediately instead of after their cache expires.
 *
 * The version changes only when the preview changes (any edit, or a change to the featured
 * pages), so copying the same unedited binder twice yields the same link. Omitting it is safe and
 * resolves identically: nothing in the app reads `v`.
 */
export function binderShareUrl(id: string, shareVersion?: number | null): string {
  const base = `${appOrigin()}/binder/${id}`;
  return shareVersion && shareVersion > 1 ? `${base}?v=${shareVersion}` : base;
}

/**
 * Ask the server to render this binder's link-preview image and park it in the CDN, so a link
 * posted moments later unfurls with a picture.
 *
 * Composing that image takes seconds (up to eighteen full-size card JPEGs, then a 2880×1512
 * raster) and no link scraper waits that long — it shows no image instead. Warming moves the cost
 * off the scraper and onto us, before the link is anywhere.
 *
 * Call it whenever a share link is about to be handed over, INCLUDING repeatedly for the same
 * binder: the preview URL is keyed on the binder's updated_at, so any edit puts it back on a cold
 * cache and the next call re-arms it rather than wasting a round trip. An already-warm binder
 * costs a CDN hit.
 *
 * Resolves when the image is actually in the CDN, so the share UI can say whether a link posted
 * right now would carry a picture. Nothing should BLOCK on it — the link works immediately either
 * way; a cold preview only means the first scraper to see it may get no image.
 */
export async function warmBinderPreview(id: string): Promise<'ready' | 'failed'> {
  if (!id) return 'failed';
  try {
    // keepalive: the request must survive the tab navigating away right after a copy.
    const res = await fetch(`${appOrigin()}/api/og-warm?id=${encodeURIComponent(id)}`, {
      keepalive: true,
    });
    const body = await res.json().catch(() => null);
    return res.ok && body && body.warmed ? 'ready' : 'failed';
  } catch {
    /* offline, or the render timed out — the preview just falls back to rendering on demand */
    return 'failed';
  }
}

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

/** The public, shareable URL for a binder (the `/binder/[id]` route). */
export function binderShareUrl(id: string): string {
  return `${appOrigin()}/binder/${id}`;
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

/**
 * Shared helpers for the Open Graph (link-preview) functions in this directory.
 *
 * michi-maker ships as a client-rendered SPA (app.json `web.output: "single"`),
 * so meta tags injected by JS never reach link-unfurling crawlers — they don't
 * run JavaScript. These functions hand those crawlers a tiny HTML document whose
 * <head> carries real Open Graph / Twitter tags. Only crawler user-agents are
 * routed here (see the `rewrites` in vercel.json); humans keep hitting the
 * untouched SPA, so this never sits on the interactive path.
 *
 * Files whose name starts with "_" are treated as private modules by Vercel and
 * are NOT exposed as routes, so this shared file is safe to keep alongside the
 * endpoints.
 */

// Runtime env — Vercel exposes every project env var (including the EXPO_PUBLIC_*
// ones the client bundle uses) to Serverless Functions, so nothing new to set up.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const IMG_BASE = process.env.EXPO_PUBLIC_CATALOG_IMG_BASE || '';
const SITE = process.env.EXPO_PUBLIC_APP_URL || 'https://michi-maker.com';
const SITE_NAME = 'michi-maker';

/** Escape a value for safe interpolation into an HTML attribute or text node. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A card id → its hosted 640px thumbnail (the tier the binder-page view uses).
 * Mirrors `cardThumbUrl(id, 640)` in src/lib/catalogConfig.ts. The app falls back
 * to the flat jpg if a thumb is missing; a crawler preview just wants one good URL.
 */
function cardImage(cardId) {
  if (!cardId || !IMG_BASE) return null;
  return `${IMG_BASE}/card-thumbs/640/${encodeURIComponent(cardId)}.webp`;
}

/**
 * PostgREST read with the publishable (anon) key. RLS exposes only public rows to
 * an anonymous caller, so a private binder/profile simply comes back empty and the
 * caller falls back to a generic preview. Returns the parsed JSON array, or null on
 * any failure (missing config, network, non-2xx) — callers treat null as "no data".
 */
async function sbSelect(path) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The minimal HTML document a crawler receives: meta in <head>, a human link in <body>. */
function ogHtml({ title, description, image, url, imageAlt, imageWidth, imageHeight }) {
  const t = esc(title);
  const d = esc(description);
  const u = esc(url);
  const img = image ? esc(image) : '';
  const dims =
    imageWidth && imageHeight
      ? `
    <meta property="og:image:width" content="${imageWidth}" />
    <meta property="og:image:height" content="${imageHeight}" />`
      : '';
  const imageTags = img
    ? `
    <meta property="og:image" content="${img}" />${dims}
    <meta property="og:image:alt" content="${esc(imageAlt || title)}" />
    <meta name="twitter:image" content="${img}" />
    <meta name="twitter:card" content="summary_large_image" />`
    : `
    <meta name="twitter:card" content="summary" />`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <link rel="canonical" href="${u}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(SITE_NAME)}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${u}" />${imageTags}
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
  </head>
  <body>
    <h1>${t}</h1>
    <p>${d}</p>
    <p><a href="${u}">Open in ${esc(SITE_NAME)}</a></p>
  </body>
</html>`;
}

/**
 * Send an HTML response with a short CDN cache. `s-maxage` lets Vercel's edge serve
 * a cached preview while `stale-while-revalidate` refreshes it — so a binder edited
 * or unshared after the fact updates its unfurl within a day without a per-request hit.
 */
function sendHtml(res, html, { status = 200, maxAge = 300 } = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=86400`,
  );
  res.end(html);
}

module.exports = { SITE, SITE_NAME, esc, cardImage, sbSelect, ogHtml, sendHtml };

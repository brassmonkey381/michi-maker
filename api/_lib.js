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

/**
 * Collapse a description to something that unfurls on ONE line, ellipsised.
 *
 * Scrapers wrap the description themselves and no tag caps the line count, so the only lever is
 * the string: cut it short enough that no client has anything to wrap. 60 is sized to Discord's
 * embed column (~57-62 characters at its default width), the narrowest of the places these links
 * get shared; iMessage and Slack are wider and simply have room to spare. Cuts on a word boundary
 * when there is one in the last third, so the ellipsis follows a whole word.
 */
function oneLine(s, max = 60) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const kept = space > max * 0.66 ? cut.slice(0, space) : cut;
  return `${kept.replace(/[\s,.;:—-]+$/, '')}…`;
}

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
 * Revision of the composed-image RENDER. Image scrapers cache og:image BY URL, so changing what
 * the renderer outputs without changing the URL keeps serving the stale copy forever. Bump this
 * on any visible change to api/og-image-binder.js — and note that doing so goes cold for EVERY
 * binder at once, which is what `npm run warm:og` exists to repair after a deploy.
 *
 *   r5  1.95× render, 2340×1229 PNG
 *   r6  michi-maker.com + logo stamped into the footer
 *   r7  JPEG at 2.4× (2880×1512) — bigger picture, a fifth the bytes
 *   r8  single featured page gets its own 1800×1512 canvas over a blurred backdrop
 *   r9  single-page disclaimer runs wider, two lines instead of three
 *   r10 a binder whose preview is ONE page gets the narrow canvas even with nothing featured
 *   r11 single-page chrome: a coin flip per render between the blurred collage and cream bands,
 *       ink measured against the backdrop so it reads on any art, a hairline round the page, and
 *       a picker that prefers two pages over one
 */
const OG_IMAGE_REV = 11;

/**
 * The two canvases the renderer knows how to draw. A SPREAD needs the width for two facing pages;
 * a single page is about 0.75:1 and left roughly two thirds of the wide frame empty, so it gets a
 * canvas cut to its own shape. See the header of api/og-image-binder.js.
 */
const OG_SPREAD = { w: 2880, h: 1512 };
const OG_SINGLE = { w: 1800, h: 1512 };

/**
 * Would the renderer draw ONE page rather than an open spread? Mirrors `pickPages` in
 * api/og-image-binder.js — keep the two in step.
 *
 * THIS USED TO BE "share_page_ids has exactly one entry", which was wrong for the commonest case
 * of all: a binder with a single page and nothing explicitly featured got the wide frame and its
 * empty margins. The reason given was that knowing the auto-pick meant pulling pages and slots on
 * the path a scraper hits first. Measured on the largest public binder, 21 pages: the extra costs
 * 9ms and 9.5KB. The concern was assumed rather than checked, and it did not survive checking.
 *
 * A disagreement with `pickPages` can only ever be COSMETIC, never a broken preview: the renderer
 * is handed the canvas in the URL and draws that, using only the first page whenever the narrow one
 * is asked for. So the declared size and the rendered size cannot drift apart — the worst case is
 * a page laid out on a frame that suits it slightly less well.
 */
/**
 * The page or pages a shared preview draws, in page order.
 *
 * PREFER TWO. An open spread is more of the binder and it fills the wide frame; a single page is
 * the fallback for a binder that has nothing to pair. The two are chosen by how much art is
 * actually ON them, not by position, so the fullest work leads.
 *
 * WHY THE OLD 18-POCKET CEILING WENT. It compared page CAPACITY (cols x rows), so a 4x3 page beside
 * a 3x3 came to 21 and fell back to one page even when the two together held fewer cards than a
 * pair of full 3x3s. Capacity was never the thing worth bounding: what costs render time is the
 * number of full-size card JPEGs fetched, which is the FILLED count. Measured against every public
 * binder on 2026-08-27, the fullest two pages come to at most 19 filled pockets, and 18 (two full
 * 3x3s) ships routinely today. So the cap is now on fetches, set above every real binder with room
 * to spare, and it exists only as a backstop against a page shape nobody has made yet. If large
 * pages become common, measure the render again before raising it rather than assuming.
 *
 * ONE SOURCE OF TRUTH, deliberately. The meta tags declare og:image:width/height and the renderer
 * has to draw exactly that shape; when this rule lived in two files it could drift, and a drift
 * means a preview whose declared size and real size disagree. api/og-image-binder.js imports this.
 */
const PREVIEW_FETCH_CAP = 24;

function choosePreviewPages(binder) {
  const pages = ((binder && binder.binder_pages) || []).slice().sort((a, b) => a.position - b.position);
  const filled = (p) => (p.binder_slots || []).filter((s) => s.card_id || s.image_url).length;

  // An explicit selection wins outright: the owner featuring one page in Share is a decision, not
  // a shortfall, and no cap applies to what they asked for.
  const chosen = Array.isArray(binder && binder.share_page_ids) ? binder.share_page_ids : null;
  if (chosen && chosen.length) {
    const picked = pages.filter((p) => chosen.includes(p.id) && filled(p) > 0).slice(0, 2);
    if (picked.length) return picked;
  }

  const withArt = pages.filter((p) => filled(p) > 0);
  if (withArt.length <= 1) return withArt;
  const topTwo = withArt.slice().sort((a, b) => filled(b) - filled(a)).slice(0, 2);
  if (filled(topTwo[0]) + filled(topTwo[1]) > PREVIEW_FETCH_CAP) return [topTwo[0]];
  return topTwo.sort((a, b) => a.position - b.position);
}

/**
 * Narrow canvas or wide? True for one page (and for none, where the renderer falls back to the
 * cover image and narrow is the better guess). Derived from the choice above so the two can never
 * disagree about what is being drawn.
 */
function previewIsSingle(binder) {
  return choosePreviewPages(binder).length <= 1;
}

/** The page/slot columns `previewIsSingle` needs, for callers building their select. */
const OG_PAGES_SELECT = 'binder_pages(id,position,rows,cols,binder_slots(card_id,image_url))';

/**
 * The composed-page image URL for a binder, and the size it will be. ONE definition, shared by the
 * meta tags and the warmer, because the two must agree exactly — a warmer that heats a URL the
 * meta tags don't emit is worse than no warmer at all, since it looks like it worked.
 *
 * THE SIZE TRAVELS IN THE URL. og:image:width/height is a promise, and the renderer is the only
 * thing that could break it; passing the chosen canvas as `w`/`h` means the renderer draws what was
 * declared rather than deciding for itself and possibly disagreeing.
 *
 * `binder` is the row, not just its id: `previewIsSingle` reads its pages to decide the shape, so
 * callers must include OG_PAGES_SELECT in their select.
 *
 * `t` is the binder's updated_at, so editing a binder (or changing its featured share pages, which
 * bumps updated_at via the binders_set_updated_at trigger) changes the URL and a re-shared link
 * re-fetches instead of unfurling the old layout. It also means every edit puts the preview back
 * on a cold cache — see `api/og-warm.js`.
 */
function ogImageUrl(id, updatedAt, binder) {
  const stamp = updatedAt ? Date.parse(updatedAt) || 0 : 0;
  const single = previewIsSingle(binder);
  const size = single ? OG_SINGLE : OG_SPREAD;
  const url =
    `${SITE}/api/og-image-binder?id=${encodeURIComponent(id)}` +
    `&r=${OG_IMAGE_REV}&t=${stamp}&w=${size.w}&h=${size.h}`;
  return { url, width: size.w, height: size.h };
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

/**
 * The minimal HTML document a crawler receives: meta in <head>, a human link in <body>.
 *
 * `ogDescription` is the UNFURL copy and `description` the SEO copy — they are deliberately
 * allowed to differ. An embed shows a line or two and reads better trimmed to one; a search
 * snippet has ~155 characters to work with and is worse for being cut to 60. Callers that want
 * a one-line embed pass `ogDescription: oneLine(description)` and keep the full text here.
 *
 * NO `og:site_name`: Discord and Slack render it as a provider line ABOVE the title, and every
 * title here already ends in "· michi-maker", so it read as the word twice in a row. The brand
 * now rides on the composed image instead (see api/og-image-binder.js).
 */
function ogHtml({ title, description, ogDescription, image, url, imageAlt, imageWidth, imageHeight }) {
  const t = esc(title);
  const d = esc(description);
  const od = esc(ogDescription == null ? description : ogDescription);
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
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${od}" />
    <meta property="og:url" content="${u}" />${imageTags}
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${od}" />
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

module.exports = {
  SITE,
  OG_PAGES_SELECT,
  previewIsSingle,
  choosePreviewPages,
  SITE_NAME,
  esc,
  oneLine,
  cardImage,
  ogImageUrl,
  sbSelect,
  ogHtml,
  sendHtml,
};

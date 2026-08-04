/**
 * Open Graph preview for a shared binder (`/binder/:id`). Fetches the public binder
 * and emits meta tags so a Discord / iMessage / X / Slack / Reddit unfurl shows the
 * binder's title, description, and a composed image of its fullest page (rendered by
 * api/og-image-binder.js). A private or missing binder falls back to a generic
 * michi-maker preview.
 *
 * To revert to the single-cover-card image (e.g. if the composer misbehaves), point
 * `image` at the cover thumbnail instead — see git history for the pickImage() helper.
 */
const { SITE, SITE_NAME, sbSelect, ogHtml, sendHtml } = require('./_lib');

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  const url = `${SITE}/binder/${id}`;
  const fallback = {
    title: `A michi binder · ${SITE_NAME}`,
    description: 'Aesthetically curated Pokémon card binders — plan it, price it, print it.',
    image: null,
    url,
  };
  if (!id) return sendHtml(res, ogHtml(fallback));

  const rows = await sbSelect(
    `binders?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=id,title,description`,
  );
  const binder = Array.isArray(rows) ? rows[0] : null;
  if (!binder) return sendHtml(res, ogHtml(fallback));

  const title = binder.title ? `${binder.title} · ${SITE_NAME}` : fallback.title;
  const description =
    binder.description || 'A michi-method Pokémon binder on michi-maker. Open to see the full layout.';
  // The composed page image (1200×630). It self-heals to the cover card on any error.
  // `r` is a manual cache-bust: image scrapers (Discord, etc.) cache the og:image BY URL, so when
  // the image OUTPUT changes but the URL doesn't, they keep serving the stale copy. Bump this
  // whenever the composed image changes so re-shared links re-fetch. (r5: 1.95× render, 2340×1229 —
  // pushed as high as possible below the ~4MB size Discord balked on.)
  const image = `${SITE}/api/og-image-binder?id=${encodeURIComponent(id)}&r=5`;
  return sendHtml(
    res,
    ogHtml({ title, description, image, imageWidth: 2340, imageHeight: 1229, url, imageAlt: binder.title }),
  );
};

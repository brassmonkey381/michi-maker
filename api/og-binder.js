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
const { SITE, SITE_NAME, oneLine, ogImageUrl, sbSelect, ogHtml, sendHtml } = require('./_lib');

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  // The version the visitor arrived with, echoed into og:url below. Scrapers CANONICALISE to
  // og:url: emit the bare path here and Discord folds ?v=3 back onto the entry it already cached
  // for /binder/<id>, which undoes the whole point of versioning the link. Read from the request
  // rather than the row so the tag always matches the URL that was actually posted, including an
  // older v someone re-shares.
  const v = String((req.query && req.query.v) || '').trim();
  /** Append the binder's current version to a bare link. v=1 is the default and adds nothing. */
  const withVersion = (base, n) => (Number(n) > 1 ? `${base}?v=${Number(n)}` : base);
  const url = /^[0-9]{1,9}$/.test(v) ? `${SITE}/binder/${id}?v=${v}` : `${SITE}/binder/${id}`;
  // Both canned descriptions are written to fit oneLine()'s 60 characters, so a generic preview
  // reads as a finished sentence instead of an ellipsis.
  const fallback = {
    title: `A michi binder · ${SITE_NAME}`,
    description: 'Curated Pokémon binders — plan it, price it, print it.',
    image: null,
    url,
  };
  if (!id) return sendHtml(res, ogHtml(fallback));

  // share_page_ids rides along on the row we already fetch: one featured page means the image gets
  // the narrower canvas cut to a single page's shape. Free — no extra query.
  const rows = await sbSelect(
    `binders?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=id,title,description,updated_at,share_page_ids,share_version`,
  );
  const binder = Array.isArray(rows) ? rows[0] : null;
  if (!binder) return sendHtml(res, ogHtml(fallback));

  // The link this preview belongs to: the v the visitor arrived with, or the binder's current one
  // when they arrived bare. Either way og:url matches a URL that stays valid, so the entry a
  // scraper caches is the entry the next share will hit.
  const canonical = v ? url : withVersion(`${SITE}/binder/${id}`, binder.share_version);
  const title = binder.title ? `${binder.title} · ${SITE_NAME}` : fallback.title;
  const description =
    binder.description || 'A michi-method Pokémon binder. Open to see the layout.';
  // The composed page image (see `ogImageUrl` for how the URL busts caches). Self-heals to the
  // cover card on any error.
  const image = ogImageUrl(id, binder.updated_at, binder.share_page_ids);
  return sendHtml(
    res,
    ogHtml({
      title,
      description,
      // One line in the embed; the full text still carries the SEO <meta name="description">.
      ogDescription: oneLine(description),
      image: image.url,
      imageWidth: image.width,
      imageHeight: image.height,
      url: canonical,
      imageAlt: binder.title,
    }),
  );
};

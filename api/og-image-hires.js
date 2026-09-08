/**
 * A public binder's share image at POSTER SCALE, as a download: the same composition the link
 * preview uses (api/og-image-binder.js: full-size card art, the blurred backdrop, the brand stamp)
 * drawn at twice the scale, so someone who opens the file on Reddit or in a chat can zoom into the
 * card text. 4280x2520 for a spread, 3000x2520 for a single page: 4x, not the 4.8x the local script
 * uses, because a 3x4 spread at 4.8x did not finish inside the function's 60s on Vercel (37s on a
 * desktop), and a render that times out is a button that fails.
 *
 * ON DEMAND ONLY, when the owner presses the button in the Share sheet (owner decision 2026-09-08:
 * manual, no background job). It takes half a minute or more, which is why it is not the preview:
 * a link scraper would time out, a person who pressed a button and was told to wait will not.
 *
 * SAME MODULE, DIFFERENT SCALE. The renderer reads its scale from OG_SCALE when it loads, and each
 * api file is its own function on Vercel, so setting the variable here before the require gives
 * this function a renderer at 4.8x while the preview function keeps 2.4x. Cached at the CDN by the
 * binder's updated_at, so a second press of the same version is instant.
 */
process.env.OG_SCALE = process.env.OG_HIRES_SCALE || '4';
process.env.OG_SHARPEN = process.env.OG_HIRES_SHARPEN || '0.6';

const { __tooling } = require('./og-image-binder.js');
const { fetchBinder, fetchManifest, pickPages, loadArt, render } = __tooling;

const CACHE = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

function slug(s) {
  return String(s || 'binder')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'binder';
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'id required' }));
  }
  try {
    const [binder, manifest] = await Promise.all([fetchBinder(id), fetchManifest()]);
    if (!binder) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ error: 'not a public binder' }));
    }
    const pages = pickPages(binder);
    if (!pages.length) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ error: 'nothing to draw' }));
    }
    const art = await loadArt(pages);
    const { body, type } = await render(pages, manifest, art, pages.length === 1);
    res.setHeader('content-type', type);
    res.setHeader('cache-control', CACHE);
    res.setHeader(
      'content-disposition',
      `attachment; filename="michi-maker-${slug(binder.title)}-${id.slice(0, 8)}.${type === 'image/jpeg' ? 'jpg' : 'png'}"`,
    );
    return res.end(body);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'render failed' }));
  }
};

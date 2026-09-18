/**
 * A QUICK LOOK at the share image (2026-09-15): the same composition as the link preview, drawn
 * at 1x and a lighter JPEG, so the Share sheet can show the owner what a share will look like in
 * a few seconds instead of asking them to wait for the preview to warm or the poster to render.
 * Not cached at the CDN for long, and keyed by the binder's updated_at, so a backdrop pasted a
 * moment ago shows up on the next press.
 *
 * SAME MODULE, DIFFERENT SCALE: the renderer reads OG_SCALE when it loads and each api file is its
 * own function on Vercel (see og-image-hires.js for the same trick at the other end).
 */
process.env.OG_SCALE = process.env.OG_QUICK_SCALE || '1';
process.env.OG_SHARPEN = '0';
process.env.OG_JPEG_QUALITY = process.env.OG_QUICK_QUALITY || '72';

const { __tooling } = require('./og-image-binder.js');
const { fetchBinder, fetchManifest, pickPages, loadArt, render, completeManifest } = __tooling;

const CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  if (!/^[0-9a-f-]{8,}$/i.test(id)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'id required' }));
  }
  try {
    const [binder, pokemon] = await Promise.all([fetchBinder(id), fetchManifest()]);
    const manifest = await completeManifest(pokemon, binder);
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
    const art = await loadArt(pages, binder);
    const { body, type } = await render(pages, manifest, art, pages.length === 1, undefined, { look: true, binder });
    res.setHeader('content-type', type);
    res.setHeader('cache-control', CACHE);
    return res.end(body);
  } catch {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'render failed' }));
  }
};

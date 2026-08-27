/**
 * Pre-render a binder's link-preview image into the CDN cache: `GET /api/og-warm?id=:id`.
 *
 * WHY THIS EXISTS. Composing the preview is expensive — it fetches up to eighteen full-size card
 * JPEGs and rasterises a 2880×1512 frame, several seconds on a cold cache. A link scraper does not
 * wait several seconds; it gives up and the share unfurls with no image. So the render has to
 * happen BEFORE the link is posted, paid for by us rather than by Discord's crawler.
 *
 * The image URL carries the binder's updated_at, so a cache entry is only ever valid for one
 * version of the binder: EDITING A BINDER PUTS ITS PREVIEW BACK ON A COLD CACHE. That is why the
 * app calls this when the share sheet opens and again when the link is actually copied, rather
 * than once when a binder is first made public — by design, warming and re-arming are the same
 * call, and the freshest one wins.
 *
 * Fire-and-forget from the client (nobody waits on the response), but it still awaits the fetch
 * and reports what happened, because `scripts/warm-og.mjs` warms every public binder after a
 * deploy and needs to know which ones actually rendered.
 *
 * Not a mutation and not authenticated: it can only cause a PUBLIC binder's own preview to be
 * rendered, which is exactly what any scraper does anyway.
 */
const { ogImageUrl, OG_PAGES_SELECT, sbSelect } = require('./_lib');

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    // Never cache the warmer itself — caching it would defeat the whole point.
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(body));
  };
  if (!id) return send(400, { warmed: false, reason: 'no id' });

  // RLS exposes only public binders to the anon key, so a private or missing one lands here rather
  // than warming something nobody can share.
  // share_page_ids matters here as much as updated_at: it decides which CANVAS the meta tags point
  // at, and warming the other one would heat a URL nobody ever requests while looking like success.
  const rows = await sbSelect(
    `binders?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=id,updated_at,share_page_ids,${OG_PAGES_SELECT}`,
  );
  const binder = Array.isArray(rows) ? rows[0] : null;
  if (!binder) return send(404, { warmed: false, reason: 'not public' });

  const { url } = ogImageUrl(id, binder.updated_at, binder);
  const started = Date.now();
  try {
    // Through the public URL, NOT by calling the renderer in-process: the point is to populate the
    // CDN entry that the scraper will hit, and only a request through the edge does that.
    const r = await fetch(url);
    const bytes = r.ok ? (await r.arrayBuffer()).byteLength : 0;
    return send(r.ok ? 200 : 502, {
      warmed: r.ok,
      status: r.status,
      type: r.headers.get('content-type'),
      // `HIT` means it was already warm and this call cost nothing.
      cache: r.headers.get('x-vercel-cache'),
      bytes,
      ms: Date.now() - started,
    });
  } catch (e) {
    return send(502, { warmed: false, reason: String((e && e.message) || e) });
  }
};

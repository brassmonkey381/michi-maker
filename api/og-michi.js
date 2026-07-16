/**
 * Open Graph preview for the Michi Method explainer / credit page (`/michi-method`).
 * The page's content is static, so this hands crawlers fixed meta with a long CDN
 * cache — no data fetch.
 *
 * TODO: add a branded 1200×630 image at public/og/michi-method.png and set it as the
 * og:image below, so shares of this page carry a visual (see docs/OPEN-GRAPH.md).
 */
const { SITE, SITE_NAME, ogHtml, sendHtml } = require('./_lib');

module.exports = async (req, res) => {
  const url = `${SITE}/michi-method`;
  sendHtml(
    res,
    ogHtml({
      title: `The Michi Method — a guide & credit · ${SITE_NAME}`,
      description:
        'The Michi Method, created by the collector Michi (@peeplop), turns a binder page into a canvas — anchor pages, single-Pokémon spreads, colour themes, and art sliced across pockets. Learn it and build your own on michi-maker.',
      image: null,
      url,
      imageAlt: 'The Michi Method',
    }),
    { maxAge: 86400 },
  );
};

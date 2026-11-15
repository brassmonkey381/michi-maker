/**
 * `/sitemap.xml`: every page worth indexing, regenerated on request and cached an hour.
 *
 * Google will not discover thousands of binders by following links from the home page — they are
 * behind a scroll of tiles that only exists after JavaScript. The sitemap names each public binder
 * (with its `updated_at`, so a re-edited binder is recrawled) and each public profile, alongside
 * the static pages. Submit once in Search Console and forget it.
 *
 * The publishable key sees only public rows under RLS, so nothing private can leak into the list.
 *
 * ONLY PAGES THAT ARE PAGES (MIC-037). A binder is listed only when api/_index.js says it is
 * indexable: never a hidden (daily puzzle) binder, whose pages are future answers; never a thin or
 * unnamed one; and pictures count only once the MIC-029 safety check approved them. The static
 * list is the routes that serve their own title and text to a crawler. /browse, /plans,
 * /whats-new, /search-guide and /feedback served the home shell under home's title, so they read as
 * copies of the home page and are out until they have pages of their own. Profiles (/u/<id>) are
 * out too: a person's page is noindex (vercel.json headers).
 * Sitemaps are capped at 50,000 URLs by the protocol; well above today, and the query limit
 * below keeps the response bounded if that ever changes (split into an index then).
 */
const { SITE } = require('./_lib');
const { indexableBinders } = require('./_index');
const seo = require('./_seo.json');
// The /sets pilot (MIC-037 phase B): static pages built from scripts/seo/set-pages.json; this is
// their slug list, written by the same snapshot, and lastmod is the day that snapshot was taken.
const setPages = require('./_sets.json');

const STATIC = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/michi-method', priority: '0.9', changefreq: 'monthly' },
  { path: '/learn', priority: '0.8', changefreq: 'monthly' },
  ...seo.guides.map((g) => ({ path: `/learn/${g.slug}`, priority: '0.8', changefreq: 'monthly' })),
  { path: '/auto-fill-methods', priority: '0.5', changefreq: 'yearly' },
  { path: '/sets', priority: '0.8', changefreq: 'monthly', lastmod: setPages.taken },
  ...setPages.sets.map((s) => ({ path: `/sets/${s.slug}`, priority: '0.7', changefreq: 'monthly', lastmod: setPages.taken })),
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

function urlTag({ loc, lastmod, changefreq, priority }) {
  return (
    `  <url>\n    <loc>${esc(loc)}</loc>` +
    (lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '') +
    (changefreq ? `\n    <changefreq>${changefreq}</changefreq>` : '') +
    (priority ? `\n    <priority>${priority}</priority>` : '') +
    `\n  </url>`
  );
}

module.exports = async (req, res) => {
  const binders = await indexableBinders(5000);
  const entries = [
    ...STATIC.map((s) => ({ loc: `${SITE}${s.path}`, lastmod: s.lastmod || seo.generatedOn, changefreq: s.changefreq, priority: s.priority })),
    ...binders.map((b) => ({
      loc: `${SITE}/binder/${b.id}`,
      lastmod: day(b.updated_at),
      changefreq: 'weekly',
      priority: '0.7',
    })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(urlTag).join('\n')}\n</urlset>\n`;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.end(xml);
};
// For the tests (src/data/setPages.test.ts): the fixed part of the list.
module.exports.STATIC = STATIC;

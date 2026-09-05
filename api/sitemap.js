/**
 * `/sitemap.xml`: every page worth indexing, regenerated on request and cached an hour.
 *
 * Google will not discover thousands of binders by following links from the home page — they are
 * behind a scroll of tiles that only exists after JavaScript. The sitemap names each public binder
 * (with its `updated_at`, so a re-edited binder is recrawled) and each public profile, alongside
 * the static pages. Submit once in Search Console and forget it.
 *
 * The publishable key sees only public rows under RLS, so nothing private can leak into the list.
 * Sitemaps are capped at 50,000 URLs by the protocol; well above today, and the query limit
 * below keeps the response bounded if that ever changes (split into an index then).
 */
const { SITE, sbSelect } = require('./_lib');
const seo = require('./_seo.json');

const STATIC = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/michi-method', priority: '0.9', changefreq: 'monthly' },
  { path: '/learn', priority: '0.8', changefreq: 'monthly' },
  ...seo.guides.map((g) => ({ path: `/learn/${g.slug}`, priority: '0.8', changefreq: 'monthly' })),
  { path: '/search-guide', priority: '0.6', changefreq: 'monthly' },
  { path: '/plans', priority: '0.6', changefreq: 'monthly' },
  { path: '/whats-new', priority: '0.5', changefreq: 'weekly' },
  { path: '/browse', priority: '0.5', changefreq: 'weekly' },
  { path: '/auto-fill-methods', priority: '0.5', changefreq: 'yearly' },
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
  const [binders, profiles] = await Promise.all([
    sbSelect('binders?is_public=eq.true&removed_at=is.null&select=id,updated_at&order=updated_at.desc&limit=20000'),
    sbSelect('profiles?is_public=eq.true&select=id,updated_at&limit=10000'),
  ]);
  const entries = [
    ...STATIC.map((s) => ({ loc: `${SITE}${s.path}`, lastmod: seo.generatedOn, changefreq: s.changefreq, priority: s.priority })),
    ...(Array.isArray(binders) ? binders : []).map((b) => ({
      loc: `${SITE}/binder/${b.id}`,
      lastmod: day(b.updated_at),
      changefreq: 'weekly',
      priority: '0.7',
    })),
    ...(Array.isArray(profiles) ? profiles : []).map((p) => ({
      loc: `${SITE}/u/${p.id}`,
      lastmod: day(p.updated_at),
      changefreq: 'weekly',
      priority: '0.4',
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

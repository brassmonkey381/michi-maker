/**
 * `/binder/:id` FOR EVERYONE: the app shell with this binder's own head and a readable body.
 *
 * Until now a binder URL served the home page's title and description, and its contents existed
 * only after JavaScript ran. This hands every visitor — person, Googlebot, Bingbot, a reader with
 * scripts off — the same shell with:
 *   - <title> and description from the binder ("Eeveelutions · 3×3 Pokémon binder · michi-maker"),
 *     so a public binder can rank for what is IN it rather than for the brand alone;
 *   - canonical + Open Graph pointing at the same composed image the social crawlers get;
 *   - JSON-LD (CollectionPage with an ItemList of pages) so a search engine understands it is a
 *     collection with N parts, not a blank app;
 *   - a plain body: h1, description, one heading per page with the cards on it, each card a link
 *     to the catalog search for that card. React replaces it on mount.
 *
 * Social scrapers never reach this: the user-agent rewrite in vercel.json still sends them to
 * api/og-binder.js, whose lean document is tuned for unfurls. Same title, same image, same URL.
 *
 * A private or unknown binder gets the untouched shell (the app shows its own not-found/private
 * state) with a `noindex` so a dead link falls out of the index instead of being indexed as the
 * home page. Card names come from the catalog server when EXPO_PUBLIC_CATALOG_API_KEY is present
 * (pages still index by title without them).
 */
const { SITE, SITE_NAME, esc, oneLine, ogImageUrl, OG_PAGES_SELECT, sbSelect, ogHtml, sendHtml } = require('./_lib');
const { getShell, compose, seoBodyStyle } = require('./_shell');

const BROWSE_URL = process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL || '';
const API_KEY = process.env.EXPO_PUBLIC_CATALOG_API_KEY || '';

function apiUrl() {
  try {
    return `${new URL(BROWSE_URL).origin}/rest/v1`;
  } catch {
    return '';
  }
}

/** id → { name, set } for the cards on the pages we describe. Empty map on any failure. */
async function cardNames(ids) {
  const base = apiUrl();
  if (!base || !API_KEY || !ids.length) return new Map();
  try {
    const list = [...new Set(ids)].slice(0, 400).map(encodeURIComponent).join(',');
    const res = await fetch(`${base}/cards?select=id,name,set_name&id=in.(${list})`, {
      headers: { apikey: API_KEY, 'user-agent': 'michi-page/1' },
    });
    if (!res.ok) return new Map();
    const rows = await res.json();
    return new Map(rows.map((r) => [r.id, { name: r.name, set: r.set_name }]));
  } catch {
    return new Map();
  }
}

/** "3×3" for a binder whose pages agree, "3×3 and 3×4" when they do not. */
function shapeLabel(pages) {
  const shapes = [...new Set(pages.map((p) => `${p.cols}×${p.rows}`))];
  if (!shapes.length) return '3×3';
  return shapes.length <= 2 ? shapes.join(' and ') : `${shapes[0]} and more`;
}

/** The catalog search that shows this card: the same link the card labels use. */
function cardSearchHref(name, set) {
  const q = set ? `"${name}" set:"${set}"` : name;
  return `${SITE}/browse?q=${encodeURIComponent(q)}`;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  const shell = await getShell(req);
  const url = `${SITE}/binder/${encodeURIComponent(id)}`;

  // The row every other decision reads. `removed_at` null: a binder in the trash is not a page.
  const rows = id
    ? await sbSelect(
        `binders?id=eq.${encodeURIComponent(id)}&is_public=eq.true&removed_at=is.null` +
          `&select=id,title,description,updated_at,created_at,share_page_ids,share_key,` +
          OG_PAGES_SELECT.replace('binder_pages(', 'binder_pages(title,'),
      )
    : null;
  const binder = Array.isArray(rows) ? rows[0] : null;

  if (!binder) {
    // Not public (or not a binder). The app decides what to show; search engines are told not to
    // keep it. Without the shell we still answer with a page, never an error.
    const head = `<title>Michi-Maker</title>\n    <meta name="robots" content="noindex" />`;
    if (!shell) {
      return sendHtml(
        res,
        ogHtml({ title: 'A michi binder · michi-maker', description: 'This binder is private or has moved.', url }),
        { status: 404, maxAge: 60 },
      );
    }
    return sendHtml(res, compose(shell, { head, body: '' }), { maxAge: 60 });
  }

  const pages = (binder.binder_pages || []).slice().sort((a, b) => a.position - b.position);
  const slotsOf = (p) => (p.binder_slots || []).filter((s) => s.card_id || s.image_url);
  const cardIds = pages.flatMap((p) => slotsOf(p).map((s) => s.card_id).filter(Boolean));
  const names = await cardNames(cardIds);
  const cardCount = cardIds.length;
  const shape = shapeLabel(pages);

  const title = `${binder.title} · ${shape} Pokémon binder · ${SITE_NAME}`;
  const firstNames = [...new Set(cardIds.map((c) => names.get(c) && names.get(c).name).filter(Boolean))].slice(0, 4);
  const description =
    binder.description ||
    `A michi-method Pokémon card binder: ${plural(pages.length, 'page')}, ${plural(cardCount, 'card')}` +
      (firstNames.length ? `, with ${firstNames.join(', ')}.` : '.') +
      ' Open it to turn the pages, then build your own for free.';
  const image = ogImageUrl(binder.id, binder.updated_at, binder);
  // Two URLs, on purpose. og:url carries the share key like api/og-binder.js does, so a scraper's
  // cache entry matches the link people actually post. The CANONICAL is the bare address: it is
  // what search engines consolidate on, and it must not change every time the key rotates.
  const shared = binder.share_key ? `${url}?v=${encodeURIComponent(binder.share_key)}` : url;
  const canonical = url;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: binder.title,
    description,
    url: canonical,
    sameAs: shared,
    image: image.url,
    dateModified: binder.updated_at,
    datePublished: binder.created_at,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE },
    about: { '@type': 'Thing', name: 'Pokémon trading card binder' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: pages.length,
      itemListElement: pages.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title || `Page ${i + 1}`,
        description: `${p.cols}×${p.rows} page, ${slotsOf(p).length} pockets filled`,
      })),
    },
  };

  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(oneLine(description))}" />`,
    `<meta property="og:url" content="${esc(shared)}" />`,
    `<meta property="og:image" content="${esc(image.url)}" />`,
    `<meta property="og:image:width" content="${image.width}" />`,
    `<meta property="og:image:height" content="${image.height}" />`,
    `<meta property="og:image:alt" content="${esc(binder.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(oneLine(description))}" />`,
    `<meta name="twitter:image" content="${esc(image.url)}" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ]
    .map((l) => `    ${l}`)
    .join('\n');

  const pageHtml = pages
    .map((p, i) => {
      const cards = slotsOf(p)
        .map((s) => {
          if (!s.card_id) return `<li>Custom artwork</li>`;
          const c = names.get(s.card_id);
          if (!c) return null;
          const set = c.set ? ` <span class="muted">· ${esc(c.set)}</span>` : '';
          return `<li><a href="${esc(cardSearchHref(c.name, c.set))}">${esc(c.name)}</a>${set}</li>`;
        })
        .filter(Boolean)
        .join('');
      const heading = `${esc(p.title || `Page ${i + 1}`)} <span class="muted">· ${p.cols}×${p.rows}</span>`;
      return `<h2>${heading}</h2>${cards ? `<ul>${cards}</ul>` : ''}`;
    })
    .join('');

  const body = `${seoBodyStyle}<main id="seo">
<p class="k">A michi binder · ${esc(shape)} · ${plural(pages.length, 'page')} · ${plural(cardCount, 'card')}</p>
<h1>${esc(binder.title)}</h1>
<p>${esc(description)}</p>
<nav><a href="${SITE}/">Build your own Pokémon binder</a><a href="${SITE}/michi-method">What is a michi binder?</a><a href="${SITE}/learn/print-binder">Print a binder at true size</a></nav>
${pageHtml}
<p class="muted">Made with ${esc(SITE_NAME)}, the free Pokémon binder builder. Card images belong to their respective owners.</p>
</main>`;

  if (!shell) {
    return sendHtml(
      res,
      ogHtml({
        title,
        description,
        ogDescription: oneLine(description),
        image: image.url,
        imageWidth: image.width,
        imageHeight: image.height,
        url: shared,
        imageAlt: binder.title,
      }),
    );
  }
  return sendHtml(res, compose(shell, { head, body }), { maxAge: 300 });
};

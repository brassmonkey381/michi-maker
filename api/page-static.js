/**
 * THE EXPLAINER AND THE GUIDES, WITH THEIR OWN HEADS ON.
 *
 * `/michi-method`, `/learn`, and `/learn/:slug` are the pages people would actually search for
 * ("what is a michi binder", "how to print a pokemon binder at true size"), and they were all
 * titled "michi-maker: build beautiful Pokémon card binders" until JavaScript ran. Same treatment
 * as api/page-binder.js: the app shell for everyone, the head swapped for the page's own, and a
 * plain body a crawler can read — here with structured data of the kind Google draws rich
 * results from: FAQPage for the explainer, HowTo (with its steps) for each guide.
 *
 * The guide text is `api/_seo.json`, generated from src/data/guides.ts by
 * scripts/build-seo-data.mjs so the two cannot disagree (the build runs it; a test checks it).
 */
const { SITE, SITE_NAME, esc, ogHtml, sendHtml } = require('./_lib');
const { getShell, compose, seoBodyStyle } = require('./_shell');
const seo = require('./_seo.json');

const OG_IMAGE = `${SITE}/og.png`;

function headFor({ title, description, url, jsonLd, image = OG_IMAGE }) {
  const t = `${title} · ${SITE_NAME}`;
  const lines = [
    `<title>${esc(t)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${esc(t)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(t)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ];
  if (jsonLd) lines.push(`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`);
  return lines.map((l) => `    ${l}`).join('\n');
}

const nav =
  `<nav><a href="${SITE}/">Build a Pokémon binder for free</a>` +
  `<a href="${SITE}/michi-method">The michi method</a>` +
  `<a href="${SITE}/learn">How-to guides</a></nav>`;

/* ---- /michi-method: the explainer, with the questions people type answered in the open. */
function michiMethod() {
  const url = `${SITE}/michi-method`;
  const faqs = seo.michiFaq;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  const head = headFor({
    title: 'What is a michi binder? The michi method explained',
    description:
      'A michi binder treats every Pokémon binder page as a canvas: anchor pages, single-Pokémon spreads, colour themes, and art sliced across pockets. The method, its creator, and how to build one for free.',
    url,
    jsonLd,
  });
  const body = `${seoBodyStyle}<main id="seo">
<p class="k">A way of seeing a binder page</p>
<h1>What is a michi binder?</h1>
<p>A <strong>michi binder</strong> is a Pokémon card binder built the way the collector Michi (@peeplop) builds them: every page is composed rather than sorted. Cards, printed art, deliberate empty pockets and one picture sliced across several pockets are arranged so the page reads as a single image. This page explains the <strong>michi method</strong>, its page types, and how to build one yourself.</p>
${nav}
${faqs.map((f) => `<h2>${esc(f.q)}</h2><p>${esc(f.a)}</p>`).join('')}
<h2>The page types</h2>
<ul>${seo.michiLayouts.map((l) => `<li><strong>${esc(l.name)}</strong>: ${esc(l.body)}</li>`).join('')}</ul>
<p class="muted">Michi-Maker is a free fan-made binder builder. Card images belong to their respective owners.</p>
</main>`;
  return { head, body, maxAge: 3600 };
}

/* ---- /learn: the hub. */
function learnHub() {
  const url = `${SITE}/learn`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Pokémon binder how-to guides',
    itemListElement: seo.guides.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}/learn/${g.slug}`,
      name: g.title,
    })),
  };
  const head = headFor({
    title: 'Pokémon binder how-to guides: fill, slice, print, search',
    description:
      'Short illustrated guides to building a Pokémon binder the michi way: fill a page around one card, cut art into pockets, print at true card size, and search your cards.',
    url,
    jsonLd,
  });
  const body = `${seoBodyStyle}<main id="seo">
<p class="k">How-to guides</p>
<h1>Pokémon binder how-to guides</h1>
<p>Short, illustrated walkthroughs of the craft: building a page, cutting art into pockets, and getting it onto paper at true size.</p>
${nav}
<ul>${seo.guides.map((g) => `<li><a href="${SITE}/learn/${g.slug}">${esc(g.title)}</a>: ${esc(g.lede)}</li>`).join('')}</ul>
</main>`;
  return { head, body, maxAge: 3600 };
}

/* ---- /learn/:slug: one guide as a HowTo. */
function guide(slug) {
  const g = seo.guides.find((x) => x.slug === slug);
  if (!g) return null;
  const url = `${SITE}/learn/${g.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: g.title,
    description: g.lede,
    datePublished: seo.guidesPublished,
    dateModified: seo.generatedOn,
    totalTime: `PT${Math.max(2, g.steps.length)}M`,
    step: g.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.title,
      text: s.body,
      url: `${url}#step-${i + 1}`,
    })),
    tool: [{ '@type': 'HowToTool', name: 'Michi-Maker (free, in the browser)' }],
  };
  const head = headFor({ title: g.title, description: g.lede, url, jsonLd });
  const others = seo.guides.filter((x) => x.slug !== g.slug);
  const body = `${seoBodyStyle}<main id="seo">
<p class="k">How-to guide · ${g.steps.length} steps</p>
<h1>${esc(g.title)}</h1>
<p>${esc(g.lede)}</p>
${nav}
<ol>${g.steps.map((s, i) => `<li id="step-${i + 1}"><strong>${esc(s.title)}.</strong> ${esc(s.body)}</li>`).join('')}</ol>
${g.tip ? `<p><strong>Tip.</strong> ${esc(g.tip)}</p>` : ''}
<h2>More guides</h2>
<ul>${others.map((o) => `<li><a href="${SITE}/learn/${o.slug}">${esc(o.title)}</a></li>`).join('')}</ul>
</main>`;
  return { head, body, maxAge: 3600 };
}

module.exports = async (req, res) => {
  const route = String((req.query && req.query.route) || '').trim();
  const slug = String((req.query && req.query.slug) || '').trim();
  let page = null;
  if (route === 'michi-method') page = michiMethod();
  else if (route === 'learn') page = slug ? guide(slug) : learnHub();
  const shell = await getShell(req);
  if (!page) {
    // Unknown guide: the app's own not-found, unindexed.
    const head = `<title>Michi-Maker</title>\n    <meta name="robots" content="noindex" />`;
    if (!shell) {
      return sendHtml(res, ogHtml({ title: 'Not found · michi-maker', description: 'That page has moved.', url: SITE }), {
        status: 404,
        maxAge: 60,
      });
    }
    return sendHtml(res, compose(shell, { head, body: '' }), { maxAge: 60 });
  }
  if (!shell) {
    const standalone = `<!doctype html><html lang="en"><head><meta charset="utf-8" />${page.head}</head><body>${page.body}</body></html>`;
    return sendHtml(res, standalone, { maxAge: page.maxAge });
  }
  return sendHtml(res, compose(shell, page), { maxAge: page.maxAge });
};

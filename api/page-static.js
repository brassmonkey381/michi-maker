/**
 * THE FRONT DOOR, THE EXPLAINER AND THE GUIDES, WITH THEIR OWN HEADS ON.
 *
 * `/michi-method`, `/learn`, and `/learn/:slug` are the pages people would actually search for
 * ("what is a michi binder", "how to print a pokemon binder at true size"), and they were all
 * titled "michi-maker: build beautiful Pokémon card binders" until JavaScript ran. Same treatment
 * as api/page-binder.js: the app shell for everyone, the head swapped for the page's own, and a
 * plain body a crawler can read. React replaces the body on mount; a person and a crawler are sent
 * the same bytes at the same URL (no user-agent branch anywhere in this file).
 *
 * THE HOME PAGE (MIC-037) is built from `homePage()` below, but not served from here: `/` is a
 * static file, so the ad landing stays an edge-cached file with no function in front of it.
 * scripts/build-home.mjs composes homePage() onto the shell at build time into dist/index.html.
 *
 * NOT FOUND (MIC-037): `?route=404` is the end of vercel.json's rewrites. Any path that is not a
 * route the app has gets the app shell with status 404 and noindex, so the app still draws its own
 * not-found screen and a crawler is told the truth. `/llms.txt` lands here too.
 *
 * The guide text is `api/_seo.json`, generated from src/data/guides.ts by
 * scripts/build-seo-data.mjs so the two cannot disagree (the build runs it; a test checks it).
 */
const { SITE, SITE_NAME, esc, ogHtml, sendHtml } = require('./_lib');
const { getShell, compose, seoBodyStyle } = require('./_shell');
const { indexableBinders, filledCount } = require('./_index');
const seo = require('./_seo.json');

const OG_IMAGE = `${SITE}/og.png`;
const MICHI_INSTAGRAM = 'https://www.instagram.com/peeplop/';

function headFor({ title, description, url, jsonLd, image = OG_IMAGE, type = 'article', fullTitle = null }) {
  const t = fullTitle || `${title} · ${SITE_NAME}`;
  const lines = [
    `<title>${esc(t)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
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

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const guideLinks = () =>
  `<ul>${seo.guides.map((g) => `<li><a href="${SITE}/learn/${g.slug}">${esc(g.title)}</a>: ${esc(g.lede)}</li>`).join('')}</ul>`;

/** The fact list shared by home and the explainer: page shapes and the printed size. */
const SIZES_HTML =
  `<ul>` +
  `<li><strong>3×3 page, 9 pockets.</strong> The classic binder page, and the shape most michi pages are built on.</li>` +
  `<li><strong>3×4 page, 12 pockets.</strong> For larger binders: three rows of four.</li>` +
  `<li><strong>Printed pieces are true card size:</strong> 2.5 by 3.5 inches (63 by 88 mm), printed at 100 percent with no scaling, so each one fits a standard pocket.</li>` +
  `</ul>`;

/* ---- / : the front door. Composed at build time by scripts/build-home.mjs (see the header). */
function homePage() {
  const url = `${SITE}/`;
  const description =
    'Plan Pokémon card binder pages for free: lay out 9-pocket and 12-pocket pages with real cards, build a page around one card, and print true-size fill sheets.';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Any (web browser)',
    description,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  const head = headFor({
    fullTitle: `${SITE_NAME}: free Pokémon card binder planner and page builder`,
    description,
    url,
    jsonLd,
    type: 'website',
  });
  const body = `${seoBodyStyle}<main id="seo">
<p class="k">${esc(SITE_NAME)} · free Pokémon card binder planner</p>
<h1>Plan Pokémon binder pages worth staring at</h1>
<p>${esc(SITE_NAME)} is a free planner for Pokémon card binders that runs in your browser. Lay out 9-pocket and 12-pocket pages with real cards, build a whole page around one card you love, and print true-size fill sheets so the binder fills in as the cards arrive.</p>
<nav><a href="${SITE}/new-binder">Start a binder</a><a href="${SITE}/discover">See binders other collectors made</a><a href="${SITE}/michi-method">What is a michi binder?</a></nav>
<h2>Pages you can build</h2>
<ul>${seo.michiLayouts.map((l) => `<li><strong>${esc(l.name)}</strong>: ${esc(l.body)}</li>`).join('')}</ul>
<h2>How it works</h2>
<ol>
<li><strong>Pick a page shape.</strong> 3×3 is the classic; 3×4 suits larger binders.</li>
<li><strong>Place one card.</strong> Search the catalog by name, set, artist or what the artwork shows.</li>
<li><strong>Build the page around it.</strong> The same Pokémon, its evolution line, its artist, or cards that share its colours.</li>
<li><strong>Print it at true size.</strong> Slide the paper pieces into the pockets and swap in the real cards as you collect them.</li>
</ol>
<h2>Page shapes and sizes</h2>
${SIZES_HTML}
<h2>How-to guides</h2>
${guideLinks()}
<p><a href="${SITE}/auto-fill-methods">Build a page around one card: eight ways, each shown as a finished page</a></p>
<p class="muted">${esc(SITE_NAME)} is a free fan-made binder planner, not affiliated with or endorsed by Nintendo, Creatures Inc., or GAME FREAK inc. Pokémon and all related card artwork are © their respective owners. <a href="${SITE}/legal/terms">Terms</a> · <a href="${SITE}/legal/privacy">Privacy</a></p>
</main>`;
  return { head, body, maxAge: 3600 };
}

/**
 * Example binders for the explainer: the fullest indexable public binders (api/_index.js), so a
 * link never leads to a hidden puzzle binder, an empty one, or a page that says noindex.
 */
async function exampleBinders(n = 8) {
  try {
    const list = await indexableBinders(400);
    return list
      .map((b) => ({ id: b.id, title: b.title, pages: (b.binder_pages || []).length, filled: filledCount(b) }))
      .sort((a, b) => b.filled - a.filled)
      .slice(0, n);
  } catch {
    return [];
  }
}

/* ---- /michi-method: the complete answer. */
async function michiMethod({ examples } = {}) {
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
  const list = examples || (await exampleBinders());
  const examplesHtml = list.length
    ? `<h2>Example michi binders</h2>
<p>Real binders collectors have shared. Open one to turn its pages.</p>
<ul>${list
        .map((b) => `<li><a href="${SITE}/binder/${encodeURIComponent(b.id)}">${esc(b.title)}</a> <span class="muted">· ${plural(b.pages, 'page')}, ${plural(b.filled, 'card')}</span></li>`)
        .join('')}</ul>`
    : '';
  const body = `${seoBodyStyle}<main id="seo">
<p class="k">A way of seeing a binder page</p>
<h1>What is a michi binder?</h1>
<p>A <strong>michi binder</strong> is a Pokémon card binder built the way the collector Michi (@peeplop) builds them: every page is composed rather than sorted. Cards, printed art, deliberate empty pockets and one picture sliced across several pockets are arranged so the page reads as a single image. This page explains the <strong>michi method</strong>, its page types, the sizes involved, and how to build one yourself.</p>
${nav}
<h2>Who created the michi method?</h2>
<p>The Michi Method is credited to the collector Michi (<a href="${MICHI_INSTAGRAM}">@peeplop on Instagram</a>), who created and popularised it. The name, the style, and the idea of treating a binder page as a composition are theirs. ${esc(SITE_NAME)} exists to make the method easier to plan and is not affiliated with or endorsed by Michi.</p>
${faqs.map((f) => `<h2>${esc(f.q)}</h2><p>${esc(f.a)}</p>`).join('')}
<h2>The page types</h2>
<ul>${seo.michiLayouts.map((l) => `<li><strong>${esc(l.name)}</strong>: ${esc(l.body)}</li>`).join('')}</ul>
<h2>Page shapes and sizes</h2>
${SIZES_HTML}
${examplesHtml}
<h2>Learn the craft</h2>
${guideLinks()}
<p><a href="${SITE}/auto-fill-methods">Build a page around one card: eight ways, each shown as a finished page</a></p>
<p class="muted">Method credited to Michi (@peeplop). ${esc(SITE_NAME)} is a free fan-made binder planner and is not affiliated with or endorsed by Michi, Nintendo, Creatures Inc., or GAME FREAK inc. Pokémon and all related card artwork are © their respective owners.</p>
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
${guideLinks()}
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
    tool: [{ '@type': 'HowToTool', name: `${SITE_NAME} (free, in the browser)` }],
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

const NOT_FOUND_HEAD = `<title>Page not found · ${SITE_NAME}</title>\n    <meta name="robots" content="noindex" />`;

async function handler(req, res) {
  const route = String((req.query && req.query.route) || '').trim();
  const slug = String((req.query && req.query.slug) || '').trim();
  let page = null;
  if (route === 'michi-method') page = await michiMethod();
  else if (route === 'learn') page = slug ? guide(slug) : learnHub();
  const shell = await getShell(req);
  if (!page) {
    // Unknown guide, or (route=404) a path no route claims: the app's own not-found, unindexed,
    // with a real 404 status. The splash stays in #root, so the app mounts exactly as before.
    if (!shell) {
      return sendHtml(res, ogHtml({ title: `Not found · ${SITE_NAME}`, description: 'That page has moved.', url: SITE }), {
        status: 404,
        maxAge: 60,
      });
    }
    return sendHtml(res, compose(shell, { head: NOT_FOUND_HEAD, body: '' }), { status: 404, maxAge: 60 });
  }
  if (!shell) {
    const standalone = `<!doctype html><html lang="en"><head><meta charset="utf-8" />${page.head}</head><body>${page.body}</body></html>`;
    return sendHtml(res, standalone, { maxAge: page.maxAge });
  }
  return sendHtml(res, compose(shell, page), { maxAge: page.maxAge });
}

module.exports = handler;
// For scripts/build-home.mjs and the tests (src/data/seoShell.test.ts).
module.exports.pages = { homePage, michiMethod, learnHub, guide, NOT_FOUND_HEAD };

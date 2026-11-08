/**
 * Inject social/share meta into the exported SPA shell (dist/index.html).
 *
 * The web build is `output: "single"`, so there's one static HTML file and share
 * scrapers (Discord, X, iMessage, Facebook) never run the JS that sets per-route
 * <Head> tags — whatever is in the shell is what a shared michi-maker.com link shows.
 * Runs as part of `npm run build:web`, after `expo export`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = path.join(root, 'dist/index.html');

const TITLE = 'michi-maker: build beautiful Pokémon card binders';
const DESCRIPTION =
  'Compose curated Pokémon card binder pages and print true-size fill sheets to build the real thing.';
const ORIGIN = 'https://michi-maker.com';

/**
 * The brand as one entity for search: the site, its logo, and the profiles that belong to it.
 * `sameAs` is how Google ties michimakerofficial on Instagram and YouTube to this domain (the
 * same link Search Console's "platform accounts" makes from the other side), which is what a
 * brand needs before its posts and a knowledge panel show up for a search of its name.
 */
const SOCIAL = ['https://www.instagram.com/michimakerofficial/', 'https://www.youtube.com/@michimakerofficial'];
const ORG_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${ORIGIN}/#org`,
      name: 'Michi-Maker',
      alternateName: 'michi-maker',
      url: `${ORIGIN}/`,
      logo: `${ORIGIN}/og.png`,
      sameAs: SOCIAL,
    },
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#site`,
      name: 'Michi-Maker',
      url: `${ORIGIN}/`,
      description: DESCRIPTION,
      publisher: { '@id': `${ORIGIN}/#org` },
    },
  ],
};

const META = `
    <meta name="description" content="${DESCRIPTION}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="michi-maker" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${ORIGIN}/" />
    <meta property="og:image" content="${ORIGIN}/og.png" />
    <meta property="og:image:width" content="2400" />
    <meta property="og:image:height" content="1260" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${ORIGIN}/og.png" />
    <script type="application/ld+json">${JSON.stringify(ORG_LD).replace(/</g, '\u003c')}</script>`;

let html = fs.readFileSync(shell, 'utf8');
if (html.includes('property="og:title"')) {
  console.log('inject-meta: og tags already present, skipping');
  process.exit(0);
}
// A human-readable default title too — the app retitles itself once the JS boots.
if (!/<title>/.test(html)) {
  html = html.replace('</head>', `    <title>${TITLE}</title>\n  </head>`);
}
// NO SAFARI ZOOM ON A TAPPED INPUT (owner, 2026-10-29). The web build is `output: single`, so
// Expo's own template writes the viewport and app/+html.tsx is never consulted; this is the one
// place the shell can be changed. maximum-scale=1 stops mobile Safari zooming the page into a
// focused input, and iOS still allows a pinch zoom with it set.
const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no, viewport-fit=cover" />';
html = html.replace(/<meta name="viewport" content="[^"]*" \/>/, VIEWPORT);
if (!html.includes('maximum-scale=1')) throw new Error('inject-meta: the viewport meta was not found in dist/index.html');
html = html.replace('</head>', `${META}\n  </head>`);
// SOMETHING ON SCREEN BEFORE THE APP RUNS (MIC-017, 2026-11-07). With `output: single` the body is
// an empty #root until 1.6 MB of JavaScript arrives and runs: on a phone over good 4G that was
// 3.3 s of white, and the median ad visitor who never tapped left at 2.7 s. The mark and the name
// are drawn by the HTML now, at once; React replaces #root's children when it mounts, so this
// costs nothing after that. Plain CSS, no image or font to wait for.
const SPLASH = `<div id="boot" aria-label="Loading michi-maker" role="status">
      <div class="bm"><i></i><i></i><i></i><i class="w"></i><i></i><i></i><i></i><i></i></div>
      <div class="bn">Michi-Maker</div>
      <div class="bs">Loading</div>
    </div>`;
const SPLASH_CSS = `<style id="boot-css">
      html, body { background: #ffffff; }
      #boot { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1D1A15; }
      #boot .bm { width: 64px; height: 64px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; animation: bootpulse 1.4s ease-in-out infinite; }
      #boot .bm i { border-radius: 4px; background: rgba(128,128,128,0.35); }
      #boot .bm i.w { grid-column: span 2; background: #3B82F6; }
      #boot .bn { font-family: Fraunces, Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: 700; }
      #boot .bs { font-size: 14px; color: #6E675C; }
      @keyframes bootpulse { 50% { opacity: 0.55; } }
      @media (prefers-reduced-motion: reduce) { #boot .bm { animation: none; } }
      @media (prefers-color-scheme: dark) { html, body { background: #131417; } #boot { color: #ffffff; } #boot .bs { color: #C4C8CE; } }
    </style>`;
html = html.replace('</head>', `    ${SPLASH_CSS}\n  </head>`);
const rootRe = /<div id="root">\s*<\/div>/;
if (!rootRe.test(html)) throw new Error('inject-meta: <div id="root"></div> was not found in dist/index.html');
html = html.replace(rootRe, `<div id="root">\n    ${SPLASH}\n  </div>`);
fs.writeFileSync(shell, html);
console.log('inject-meta: og/twitter meta written to dist/index.html');

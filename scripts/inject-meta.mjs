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
  'Compose curated Pokémon card binder pages: rarity ladders, color spreads, artist galleries. Print true-size fill sheets and build the real thing. Free while in beta.';
const ORIGIN = 'https://michi-maker.com';

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
    <meta name="twitter:image" content="${ORIGIN}/og.png" />`;

let html = fs.readFileSync(shell, 'utf8');
if (html.includes('property="og:title"')) {
  console.log('inject-meta: og tags already present, skipping');
  process.exit(0);
}
// A human-readable default title too — the app retitles itself once the JS boots.
if (!/<title>/.test(html)) {
  html = html.replace('</head>', `    <title>${TITLE}</title>\n  </head>`);
}
html = html.replace('</head>', `${META}\n  </head>`);
fs.writeFileSync(shell, html);
console.log('inject-meta: og/twitter meta written to dist/index.html');

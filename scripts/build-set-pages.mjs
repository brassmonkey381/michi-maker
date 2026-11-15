/**
 * /sets AND /sets/<slug> (MIC-037, SEO plan action 9 pilot). Runs in `buildCommand` (vercel.json).
 *
 * Renders scripts/seo/set-pages.json (committed; refreshed by scripts/seo/snapshot-set-pages.mjs)
 * into static files the CDN serves before any rewrite:
 *   dist/sets/index.html     the hub        -> /sets
 *   dist/sets/<slug>.html    one per set    -> /sets/<slug> (cleanUrls)
 * No network, no function. The sitemap lists the same slugs from api/_sets.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderHub, renderSetPage } from './seo/setPage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { taken, sets } = JSON.parse(fs.readFileSync(path.join(root, 'scripts/seo/set-pages.json'), 'utf8'));
const out = path.join(root, 'dist/sets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), renderHub(sets, { taken }));
for (const s of sets) fs.writeFileSync(path.join(out, `${s.slug}.html`), renderSetPage(s, { taken }));
console.log(`build-set-pages: /sets and ${sets.length} set planners -> dist/sets/`);

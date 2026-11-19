/**
 * Time the binder share image on the shipping path, split into load (binder, manifest, card art)
 * and render (Satori raster + JPEG), at whatever OG_SCALE / OG_JPEG_QUALITY the env sets.
 *
 *   node scripts/og-time.mjs <binder-id> [<binder-id>...]
 *   OG_SCALE=1.2 node scripts/og-time.mjs <id>
 *
 * Needs the EXPO_PUBLIC_* env the function has (read from .env here). GET only.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const require = createRequire(import.meta.url);
const { __tooling: t } = require('../api/og-image-binder.js');
const { previewIsSingle } = require('../api/_lib.js');

const out = new URL('../state/out/og-time/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const id of process.argv.slice(2)) {
  const t0 = Date.now();
  const [binder, pokemon] = await Promise.all([t.fetchBinder(id), t.fetchManifest()]);
  const manifest = await t.completeManifest(pokemon, binder);
  const pages = t.pickPages(binder);
  t.attachStyles(pages, binder);
  const [art] = await Promise.all([t.loadArt(pages, binder), t.loadFacts(pages)]);
  const t1 = Date.now();
  const single = previewIsSingle(binder);
  const { body, type } = await t.render(pages, manifest, art, single, undefined, { look: true, binder });
  const t2 = Date.now();
  writeFileSync(new URL(`${id.slice(0, 8)}-s${process.env.OG_SCALE || 'default'}.jpg`, out), body);
  console.log(`${id.slice(0, 8)} scale=${process.env.OG_SCALE || 'default'} ${single ? 'single' : 'spread'} load=${t1 - t0}ms render=${t2 - t1}ms bytes=${body.length} ${type}`);
}
process.exitCode = 0;

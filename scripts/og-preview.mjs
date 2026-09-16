/**
 * Render a binder's real share image to a file, so a design change is judged on the shipping path
 * rather than on a mock: same Satori layout, same blurred backdrop from the page's own art, same
 * JPEG encode.
 *
 *   node scripts/og-preview.mjs <binder-id> [outDir]
 *   node scripts/og-preview.mjs --contrast <id,id,id>
 *
 * `--contrast` skips rendering and instead reports what chromeInk measured for each binder's
 * backdrop: the ground behind the lockup and the disclaimer, the ink it chose, and the ratio it
 * scored. That is the check behind the claim that the chrome stays legible over any art, so it is
 * worth being able to re-run whenever the scrim, the inks, or the blur change.
 *
 * Needs the same env the deployed function has (EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY /
 * _CATALOG_BROWSE_URL).
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { __tooling } = require('../api/og-image-binder.js');
const {
  fetchBinder,
  fetchManifest,
  pickPages,
  loadArt,
  render,
  blurBackdrop,
  backdropSource,
  chromeInk,
  SCRIM,
} = __tooling;

const args = process.argv.slice(2);

if (args[0] === '--contrast') {
  const ids = (args[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!ids.length) {
    console.log('FAILED: pass a comma-separated list of binder ids');
    process.exit(2);
  }
  const manifest = await fetchManifest();
  let worst = Infinity;
  let haloed = 0;
  let samples = 0;
  for (const id of ids) {
    const binder = await fetchBinder(id);
    if (!binder) continue;
    const pages = pickPages(binder);
    if (!pages.length) continue;
    const art = await loadArt(pages);
    const backdrop = await blurBackdrop(backdropSource(pages[0], manifest, art));
    if (!backdrop) continue;
    for (const [where, bg] of [
      ['header', backdrop.top],
      ['footer', backdrop.bottom],
    ]) {
      const r = chromeInk(bg, SCRIM);
      samples += 1;
      if (r.halo) haloed += 1;
      worst = Math.min(worst, r.ratio);
      console.log(
        `  ${String(binder.title).slice(0, 28).padEnd(28)} ${where.padEnd(6)} ${r.ink.padEnd(18)} ${r.ratio.toFixed(2)}:1${r.halo ? '  +halo' : ''}`,
      );
    }
  }
  console.log(`\nsamples ${samples} · worst ${worst.toFixed(2)}:1 · needed a halo ${haloed}/${samples}`);
  process.exit(0);
}

// Production never passes a face: render() flips a coin per render (see flipChrome). Forcing one
// here is the only way to look at a specific face on purpose, which is what this script is for.
// `--v2` draws the binder's look (page style, zip, spine, sleeves, backgrounds) — the 2026-09-15
// experiment — so the two versions can be judged side by side from the same binder.
const v2 = args.includes('--v2');
// `--page N` renders page N alone on the narrow canvas, the way a shared page link does;
// `--backdrop URL` stands in for the binder's own share_backdrop, to try a picture without saving it.
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const pageNo = opt('--page') ? Number(opt('--page')) : undefined;
const backdropOverride = opt('--backdrop');
// `--preset id` renders as that named binder (see src/data/binderPresets.ts) without saving it.
const presetOverride = opt('--preset');
const skip = new Set(['--v2', '--page', '--backdrop', '--preset', opt('--page'), opt('--backdrop'), opt('--preset')].filter(Boolean));
const [id, outDir = '.', ...faces] = args.filter((a) => !skip.has(a));
if (!id) {
  console.log('FAILED: pass a binder id [outDir] [collage|bands ...] [--v2] [--page N] [--backdrop URL]');
  process.exit(2);
}
const [binder, manifest] = await Promise.all([fetchBinder(id), fetchManifest()]);
if (!binder) {
  console.log(`FAILED: no binder ${id} (is it public?)`);
  process.exit(3);
}
if (backdropOverride) binder.share_backdrop = backdropOverride;
if (presetOverride) {
  const preset = (await import('../api/_binderPresets.js')).default.find((p) => p.id === presetOverride);
  if (!preset) {
    console.log(`FAILED: no binder preset ${presetOverride}`);
    process.exit(5);
  }
  binder.page_style = { ...(binder.page_style || {}), binder: preset.id, details: { zip: preset.zipper ? {} : undefined, spine: preset.spine || undefined } };
  for (const p of binder.binder_pages || []) p.background_color = preset.cloth;
}
let pages = pickPages(binder);
if (pageNo) {
  const all = (binder.binder_pages || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  const one = all[pageNo - 1];
  if (!one) {
    console.log(`FAILED: no page ${pageNo} (binder has ${all.length})`);
    process.exit(4);
  }
  pages = [one];
}
const art = await loadArt(pages, v2 ? binder : null);
const single = pages.length === 1;
console.log(`"${binder.title}" -> ${pages.length} page(s), ${single ? 'narrow 1800x1512' : 'spread 2880x1512'}${v2 ? ', v2 look' : ''}`);

mkdirSync(outDir, { recursive: true });
for (const face of faces.length ? faces : [undefined]) {
  const { body, type } = await render(pages, manifest, art, single, face, { look: v2, binder });
  const label = (face || 'flipped') + (v2 ? '-v2' : '');
  const file = join(outDir, `og-${id.slice(0, 8)}-${label}.${type === 'image/jpeg' ? 'jpg' : 'png'}`);
  writeFileSync(file, body);
  console.log(`  ${label.padEnd(8)} ${String(Math.round(body.length / 1024)).padStart(5)} KB  ${file}`);
}
console.log('DONE.');

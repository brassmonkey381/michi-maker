/**
 * Generate the brand PNGs from the logo design (see src/components/brand/LogoMark.tsx —
 * keep the two in sync if the mark changes):
 *
 *   assets/images/favicon.png  64×64, transparent — the browser-tab icon
 *   public/og.png              1200×630 — the og:image / twitter:image share card
 *
 * Usage: node scripts/brand-assets.mjs   (needs Edge installed, like scripts/screenshots.mjs)
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontUrl = pathToFileURL(path.join(root, 'public/fonts/fraunces-latin-var.woff2')).href;

const ACCENT = '#3B82F6';
const POCKET_DARK = 'rgba(90,95,105,0.55)'; // favicon pockets — visible on light AND dark tabs
const CREAM = '#faf7f2';
const INK = '#171513';

/** The mark as CSS grid: 3×3 pockets, one art tile spanning two — the michi move. */
function markHtml(cell, gap, radius, pocketColor, accent = ACCENT) {
  const p = `width:${cell}px;height:${cell}px;border-radius:${radius}px;background:${pocketColor}`;
  const a = `width:${cell * 2 + gap}px;height:${cell}px;border-radius:${radius}px;background:${accent}`;
  const row = (inner) => `<div style="display:flex;gap:${gap}px">${inner}</div>`;
  return `<div style="display:flex;flex-direction:column;gap:${gap}px">
    ${row(`<div style="${p}"></div><div style="${p}"></div><div style="${p}"></div>`)}
    ${row(`<div style="${a}"></div><div style="${p}"></div>`)}
    ${row(`<div style="${p}"></div><div style="${p}"></div><div style="${p}"></div>`)}
  </div>`;
}

const faviconPage = `<!doctype html><body style="margin:0;background:transparent">
  <div id="mark" style="display:inline-block">${markHtml(18, 5, 4.5, POCKET_DARK)}</div>
</body>`;

const ogPage = `<!doctype html><head><style>
  @font-face { font-family: Fraunces; src: url('${fontUrl}') format('woff2'); font-weight: 100 1000; }
  body { margin: 0; width: 1200px; height: 630px; background: ${CREAM}; overflow: hidden;
         font-family: Fraunces, Georgia, serif; color: ${INK}; }
  .wrap { display: flex; align-items: center; justify-content: space-between;
          height: 100%; padding: 0 96px; box-sizing: border-box; }
</style></head><body>
  <div class="wrap">
    <div style="max-width:640px">
      <div style="margin-bottom:36px">${markHtml(26, 7, 6, '#ddd6c9')}</div>
      <div style="font-weight:900;font-size:78px;line-height:1.02;letter-spacing:-1px">
        Binder pages worth staring&nbsp;at.</div>
      <div style="font-family:system-ui,sans-serif;font-size:28px;line-height:1.4;color:#5a554d;margin-top:26px">
        michi-maker · curated Pokémon card binders, printed true size</div>
    </div>
    <div style="transform:rotate(-2deg)">${markHtml(88, 22, 20, '#e9e3d6')}</div>
  </div>
</body>`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await browser.newContext({ deviceScaleFactor: 2 })).newPage();

await page.setViewportSize({ width: 200, height: 200 });
await page.setContent(faviconPage);
const mark = page.locator('#mark');
await mark.screenshot({ path: path.join(root, 'assets/images/favicon.png'), omitBackground: true });
console.log('wrote assets/images/favicon.png');

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(ogPage, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(root, 'public/og.png') });
console.log('wrote public/og.png');

await browser.close();

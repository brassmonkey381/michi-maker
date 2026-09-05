/**
 * EXPORT A PUBLIC BINDER FOR INSTAGRAM.
 *
 * Stills: one 1080×1350 JPEG per page (Instagram's portrait post, the crop that gets the most
 * screen in the feed), the page centred on a mat with the binder title and michi-maker.com in
 * the corner. Up to ten, because a carousel holds ten. Reel: a 1080×1920 recording of the binder
 * turning through those pages, ready to trim in the Instagram editor.
 *
 * Nothing is signed in and nothing is written: it opens the public binder page the way a visitor
 * would, so only a public binder exports. Runs against production by default so no dev server is
 * needed. One headless browser, closed when done.
 *
 *   node scripts/export-instagram.mjs --binder <id> [--pages 6] [--out <dir>] [--video] [--base https://michi-maker.com]
 *
 * The Reel comes out as WebM (what the browser records). Instagram wants MP4: if ffmpeg is on
 * PATH the script converts; if not it says how to install it and leaves the WebM.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
const BINDER = args.binder;
if (!BINDER) {
  console.log('FAILED: --binder <id> is required');
  process.exit(2);
}
const BASE = args.base ?? 'https://michi-maker.com';
const PAGES = Math.min(10, Math.max(1, Number(args.pages ?? 6)));
const OUT = args.out ?? join(process.cwd(), 'state', 'instagram', BINDER.slice(0, 8));
const VIDEO = args.video === 'true';
mkdirSync(OUT, { recursive: true });

const W = 1080;
const H = 1350;
const MAT = '#F3EEE3';
const INK = '#2B2A27';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let ok = true;
try {
  // ---- stills
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  console.log(`Step 1/3: opening ${BASE}/binder/${BINDER}`);
  await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForSelector('[data-testid="binder-page-current"]', { timeout: 120000 });
  await p.waitForTimeout(3500); // images
  const title = (await p.locator('[data-testid="binder-title"]').first().innerText().catch(() => '')).trim() || 'A michi binder';
  console.log(`  binder: ${title}`);

  // A compositor page: the page screenshot on a mat, the caption in the corner.
  const comp = await ctx.newPage();
  await comp.setViewportSize({ width: W, height: H });
  await comp.setContent(`<canvas id="c" width="${W}" height="${H}"></canvas>`);

  const pageTitleOf = async () =>
    (await p.locator('[data-testid="binder-page-current"] [data-testid^="binder-page-title"]').first().innerText().catch(() => '')).trim();

  console.log(`Step 2/3: ${PAGES} page still(s)`);
  let lastTitle = null;
  for (let i = 0; i < PAGES; i++) {
    const grid = p.locator('[data-testid="binder-page-current"] [data-binder-page]').first();
    if (!(await grid.count())) {
      console.log('  no page grid found; stopping');
      break;
    }
    const pageTitle = await pageTitleOf();
    const shot = await grid.screenshot({ type: 'png' });
    const dataUrl = 'data:image/png;base64,' + shot.toString('base64');
    const jpeg = await comp.evaluate(
      async ({ dataUrl, W, H, MAT, INK, title, pageTitle }) => {
        const c = document.getElementById('c');
        const g = c.getContext('2d');
        g.fillStyle = MAT;
        g.fillRect(0, 0, W, H);
        const img = new Image();
        await new Promise((r) => {
          img.onload = r;
          img.src = dataUrl;
        });
        const pad = 72;
        const maxW = W - pad * 2;
        const maxH = H - pad * 2 - 90;
        const s = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * s;
        const h = img.height * s;
        const x = (W - w) / 2;
        const y = pad + (maxH - h) / 2;
        g.shadowColor = 'rgba(0,0,0,0.18)';
        g.shadowBlur = 40;
        g.shadowOffsetY = 18;
        g.fillStyle = '#fff';
        g.fillRect(x, y, w, h);
        g.shadowColor = 'transparent';
        g.drawImage(img, x, y, w, h);
        g.fillStyle = INK;
        g.font = '600 30px "Segoe UI", system-ui, sans-serif';
        g.textBaseline = 'alphabetic';
        g.fillText(pageTitle ? `${title} · ${pageTitle}` : title, pad, H - pad + 8);
        g.font = '500 24px "Segoe UI", system-ui, sans-serif';
        g.fillStyle = '#6B6459';
        const mark = 'michi-maker.com';
        const mw = g.measureText(mark).width;
        g.fillText(mark, W - pad - mw, H - pad + 8);
        return c.toDataURL('image/jpeg', 0.92);
      },
      { dataUrl, W, H, MAT, INK, title, pageTitle },
    );
    const file = join(OUT, `page-${String(i + 1).padStart(2, '0')}.jpg`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, Buffer.from(jpeg.split(',')[1], 'base64'));
    console.log(`  ${file}  (${pageTitle || 'untitled'})`);
    // Turn the page; stop when the title stops changing (the end of the binder).
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(1800);
    const now = await pageTitleOf();
    if (now === pageTitle && lastTitle === pageTitle) break;
    lastTitle = pageTitle;
  }
  await ctx.close();

  // ---- the reel
  if (VIDEO) {
    console.log('Step 3/3: recording the page turns (1080×1920)');
    const vctx = await browser.newContext({
      viewport: { width: 1080, height: 1920 },
      deviceScaleFactor: 1,
      recordVideo: { dir: OUT, size: { width: 1080, height: 1920 } },
    });
    const vp = await vctx.newPage();
    await vp.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await vp.waitForSelector('[data-testid="binder-page-current"]', { timeout: 120000 });
    await vp.waitForTimeout(3000);
    await vp.mouse.click(540, 900); // a gesture, so a soundtrack may start
    await vp.waitForTimeout(1200);
    for (let i = 0; i < PAGES; i++) {
      await vp.keyboard.press('ArrowRight');
      await vp.waitForTimeout(2200);
    }
    await vp.waitForTimeout(1500);
    const video = vp.video();
    await vctx.close();
    const webm = await video.path();
    const target = join(OUT, 'reel.webm');
    if (existsSync(target)) renameSync(target, join(OUT, `reel-old-${Date.now()}.webm`));
    renameSync(webm, target);
    console.log(`  ${target}`);
    const ff = spawnSync('ffmpeg', ['-y', '-i', target, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, 'reel.mp4')], { stdio: 'ignore' });
    if (ff.status === 0) console.log(`  ${join(OUT, 'reel.mp4')}  (Instagram-ready)`);
    else console.log('  ffmpeg not found: Instagram needs MP4. Install once with  winget install Gyan.FFmpeg  and re-run, or convert reel.webm yourself.');
  } else {
    console.log('Step 3/3: skipped (pass --video for the Reel)');
  }
} catch (e) {
  ok = false;
  console.log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser.close();
}
console.log(ok ? `Done. Files in ${OUT}` : 'Stopped with a failure.');
process.exit(ok ? 0 : 1);

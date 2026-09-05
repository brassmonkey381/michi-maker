/**
 * EXPORT A PUBLIC BINDER FOR INSTAGRAM.
 *
 * Stills: one 1080×1350 JPEG per page (Instagram's portrait post, the crop that gets the most
 * screen in the feed), the page centred on a mat with the binder title and the handle in the
 * corner. Up to ten, because a carousel holds ten. Reel: a desktop-shaped (1600×900) recording of
 * the binder turning through those pages, ready to trim in the Instagram editor.
 *
 * PAGES TURN BY CLICKING THE RAIL. The public viewer has no keyboard shortcuts (those live in the
 * owner's editor), so the script clicks each page's thumbnail in the rail, exactly as a visitor
 * does, and waits for the turn to land. It stops when there is no such thumbnail.
 *
 * Nothing is signed in and nothing is written: it opens the public binder page the way a visitor
 * would, so only a public binder exports. Runs against production by default so no dev server is
 * needed. One headless browser, closed when done.
 *
 *   node scripts/export-instagram.mjs --binder <id> [--pages 6] [--out <dir>] [--video] [--seconds 13] [--base https://michi-maker.com]
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
/** How long the Reel should run from first page to last, whatever the page count. */
const REEL_SECONDS = Number(args.seconds ?? 13);
/** The app's page-turn animation (src/components/binder/pageTurn.tsx TURN_MS). Keep in step. */
const TURN_MS = 620;
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

  const pageTitleOf = async (pg = p) =>
    (await pg.locator('[data-testid="binder-page-current"] [data-testid^="binder-page-title"]').first().innerText().catch(() => '')).trim();
  /**
   * Go to page `n` (1-based) by clicking its thumbnail in the rail, as a visitor does. False when
   * there is no such thumbnail (past the last page). The rail's thumbs are gesture-handler taps,
   * so this is a real mouse click at the thumb's centre, not a synthetic DOM event.
   */
  const goTo = async (n, pg = p, settle = 1900) => {
    const thumb = pg.locator(`[data-testid="binder-strip-page-${n}"]`).first();
    if (!(await thumb.count())) return false;
    await thumb.scrollIntoViewIfNeeded().catch(() => {});
    const box = await thumb.boundingBox();
    if (!box) return false;
    await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await pg.waitForTimeout(settle); // the turn animation, then the page settles
    return true;
  };

  console.log(`Step 2/3: up to ${PAGES} page still(s)`);
  let pagesFound = 0;
  for (let i = 0; i < PAGES; i++) {
    pagesFound = i + 1;
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
        const mark = 'michi-maker.com · @michimakerofficial';
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
    if (i + 1 < PAGES && !(await goTo(i + 2))) {
      console.log('  last page reached');
      break;
    }
  }
  await ctx.close();

  // ---- the reel
  if (VIDEO) {
    console.log('Step 3/3: recording the page turns (1600×900)');
    const vctx = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      recordVideo: { dir: OUT, size: { width: 1600, height: 900 } },
    });
    const vp = await vctx.newPage();
    await vp.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const t0 = Date.now(); // the recording began with the context
    await vp.waitForSelector('[data-testid="binder-page-current"]', { timeout: 120000 });
    await vp.waitForTimeout(2500);
    await vp.mouse.click(800, 40); // a gesture on the top bar, so a soundtrack may start

    // WARM EVERY PAGE FIRST. A page turned to for the first time fetches its card images, and the
    // pockets paint white for the instant before they arrive: the flash seen mid-reel. Visiting each
    // page once, off the clock, fills the cache; the timed pass then turns onto pages that are
    // already drawn. This footage is trimmed away below (or by hand in the editor).
    const n = Math.max(1, pagesFound);
    for (let i = 2; i <= n; i++) if (!(await goTo(i, vp, 900))) break;
    await goTo(1, vp, 1200);

    // PACE TO THE TARGET. Whatever the page count, the reel runs REEL_SECONDS from first page to
    // last: a hold on page one, then every turn takes an equal share of what remains, the app's
    // own turn animation included, then a hold on the last page. Two pages dwell long; ten flick.
    const introMs = 1800;
    const outroMs = 1500;
    const turns = n - 1;
    const perTurn = turns ? (REEL_SECONDS * 1000 - introMs - outroMs) / turns : 0;
    const dwell = Math.max(250, Math.round(perTurn - TURN_MS));
    console.log(`  ${n} page(s), ${turns} turn(s): ${(perTurn / 1000).toFixed(2)}s per turn, ${dwell}ms on each page`);
    const tStart = Date.now();
    await vp.waitForTimeout(introMs);
    for (let i = 2; i <= n; i++) {
      if (!(await goTo(i, vp, TURN_MS + dwell))) break;
    }
    await vp.waitForTimeout(outroMs);
    const tEnd = Date.now();

    const video = vp.video();
    await vctx.close();
    const webm = await video.path();
    const target = join(OUT, 'reel.webm');
    if (existsSync(target)) renameSync(target, join(OUT, `reel-old-${Date.now()}.webm`));
    renameSync(webm, target);
    const trimFrom = ((tStart - t0) / 1000).toFixed(2);
    const length = ((tEnd - tStart) / 1000).toFixed(1);
    console.log(`  ${target}  (full recording; the reel is the last ${length}s, from ${trimFrom}s)`);
    const ff = spawnSync(
      'ffmpeg',
      ['-y', '-ss', trimFrom, '-i', target, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, 'reel.mp4')],
      { stdio: 'ignore' },
    );
    if (ff.status === 0) console.log(`  ${join(OUT, 'reel.mp4')}  (${length}s, trimmed, Instagram-ready)`);
    else console.log(`  ffmpeg not found: Instagram needs MP4 and the load/warm-up needs cutting. Install once with  winget install Gyan.FFmpeg  and re-run, or trim reel.webm from ${trimFrom}s in the editor.`);
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

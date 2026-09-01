/**
 * RE-CAPTURE THE WELCOME_V2 HERO CLIP from the live /welcome page.
 *
 * The hero on welcome_v2 is a real recording of the real binder, not a mockup, so it has to be
 * re-taken whenever the page turn changes. This drives a local export of the app, frames tightly on
 * the binder itself, and records it turning.
 *
 * WHY IT FRAMES BY MEASUREMENT. The previous capture used hand-tuned pixel offsets
 * (CLIP {x:570,y:210,w:1210,h:780}) which left paper margins around the binder and drifted every
 * time the landing layout moved. This finds the binder by its testID, measures it, and scales the
 * page so that box exactly fills the frame. The measured box is written to a JSON sidecar so the
 * page's own live-iframe clip can use the same numbers instead of a second set of guesses.
 *
 * Usage (from the repo root, with dist/ already built by `npx expo export -p web`):
 *   node state/cap-welcome-hero.mjs [seconds]
 *
 * Output: state/out/hero.webm and state/out/hero-frame.json, plus hero.jpg (the poster).
 * The wrapper cap-welcome-hero.ps1 builds, runs this, and transcodes if ffmpeg is present.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'state', 'out');
// ONE FULL WALK, COUNTED FROM THE MOMENT THE BINDER IS FRAMED. The auto-flip steps through the
// spreads and then reverses, so exactly one walk of content loops seamlessly whatever phase it
// starts on: 4 frames, 6 steps, 3.6s of dwell each. Everything before the framing is the browser
// opening a web page, and it is cut off the front, so the clip opens on a binder and nothing else.
const SECONDS = Number(process.argv[2] || 21.6);
/** When to take the poster, counted from the framing. Past the cover, onto a full spread. */
const POSTER_AT = 4.6;
/** Playwright's own ffmpeg. A VP8-only build, which is all the trim needs. */
const FFMPEG = join(homedir(), 'AppData', 'Local', 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe');
/** The frame's long edge. 1440 keeps it crisp on a 2x display without a huge file. */
const TARGET_W = 1440;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('FAILED: no dist/index.html. Run `npx expo export -p web` first.');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.map': 'application/json',
};

// A plain static server with SPA fallback: the export is a single-page app, so any route that is
// not a file on disk is index.html and the router sorts it out.
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const direct = join(DIST, url);
  let file = null;
  if (url !== '/' && existsSync(direct) && !direct.endsWith('/')) file = direct;
  else if (existsSync(direct + '.html')) file = direct + '.html';
  else file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
console.log(`[1/6] serving dist on ${base}`);

const browser = await chromium.launch({ channel: 'msedge', headless: true });

// ── Measure first, in a throwaway page: how big is the binder, and where? ───────────────────────
console.log('[2/6] measuring the hero binder');
const probe = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await probe.goto(`${base}/welcome`, { waitUntil: 'networkidle' });
await probe.waitForSelector('[data-testid="welcome-hero-binder"]', { timeout: 30000 });
// Let the art load and the reveal animation settle before trusting the box.
await probe.waitForTimeout(3500);
const box = await probe.evaluate(() => {
  const el = document.querySelector('[data-testid="welcome-hero-binder"]');
  const r = el.getBoundingClientRect();
  return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
});
await probe.close();
if (!box || box.w < 100 || box.h < 100) {
  console.error(`FAILED: implausible binder box ${JSON.stringify(box)}`);
  await browser.close(); server.close(); process.exit(3);
}
// Even dimensions: video encoders reject odd ones.
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const outW = even(TARGET_W);
const outH = even((TARGET_W * box.h) / box.w);
console.log(`      binder ${Math.round(box.w)}x${Math.round(box.h)} at ${Math.round(box.x)},${Math.round(box.y)} -> frame ${outW}x${outH}`);

// ── Record, with the page scaled so the binder alone fills the frame ────────────────────────────
console.log(`[3/6] recording ${SECONDS}s`);
const ctx = await browser.newContext({
  viewport: { width: outW, height: outH },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: outW, height: outH } },
});
// The video's clock starts here, with the context. Everything between this and the framing below
// is the page loading, and is cut off the front once the recording is closed.
const recordingStarted = Date.now();
const page = await ctx.newPage();
await page.goto(`${base}/welcome`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="welcome-hero-binder"]', { timeout: 30000 });

// THE FRAMING. The page is scaled and shifted as a whole so the measured box lands exactly on the
// viewport. Nothing is reparented: moving the binder in the DOM would remount it and lose the very
// animation being filmed. The scroll bars and the page ground go with it.
await page.addStyleTag({
  content: `
    html { overflow: hidden !important; background: transparent !important; }
    body { overflow: hidden !important; background: transparent !important; }
    ::-webkit-scrollbar { display: none !important; }
  `,
});
await page.evaluate(({ outW, outH }) => {
  const el = document.querySelector('[data-testid="welcome-hero-binder"]');
  const r = el.getBoundingClientRect();
  const s = Math.max(outW / r.width, outH / r.height);
  const root = document.documentElement;
  root.style.transformOrigin = '0 0';
  root.style.transform = `scale(${s}) translate(${-(r.x + window.scrollX)}px, ${-(r.y + window.scrollY)}px)`;
}, { outW, outH });
// How much of the recording is page-load rather than binder. A small margin on top, because the
// transform lands in the next painted frame rather than in this one.
const leadIn = (Date.now() - recordingStarted) / 1000 + 0.2;
console.log('      framed after ' + leadIn.toFixed(2) + 's of page load, which comes off the front');
// THE POSTER IS NOT THE FIRST FRAME. The walk starts on the cover, which faces nothing, so a
// poster taken at t=0 is a binder half empty. Wait past the first turn and catch a full spread.
await page.waitForTimeout(POSTER_AT * 1000);
await page.screenshot({ path: join(OUT, 'hero.jpg'), quality: 88, type: 'jpeg' });
console.log('[4/6] poster written, on a full spread');
await page.waitForTimeout(Math.max(0, SECONDS - POSTER_AT) * 1000);

const video = page.video();
await ctx.close();
const raw = await video.path();
const webm = join(OUT, 'hero.webm');
rmSync(webm, { force: true });

// CUT THE PAGE LOAD OFF THE FRONT. It has to be a re-encode rather than a stream copy: Playwright's
// VP8 carries almost no keyframes, so seeking without one lands back at the beginning and the trim
// does nothing, which is exactly what a stream copy produced here (a file of the same size). VP8 is
// the only encoder this ffmpeg has, which is fine, since VP8 is what the file already is.
if (existsSync(FFMPEG)) {
  try {
    execFileSync(
      FFMPEG,
      ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(leadIn), '-i', raw,
       '-c:v', 'libvpx', '-crf', '30', '-b:v', '2M', '-deadline', 'good', '-cpu-used', '1', '-an', webm],
      { stdio: 'inherit' },
    );
    rmSync(raw, { force: true });
  } catch (e) {
    console.error('      trim failed (' + e.message + '), keeping the untrimmed recording');
    renameSync(raw, webm);
  }
} else {
  console.error('      no ffmpeg at ' + FFMPEG + ', keeping the untrimmed recording');
  renameSync(raw, webm);
}
console.log('[5/6] hero.webm written, ' + (statSync(webm).size / 1048576).toFixed(2) + ' MB');

writeFileSync(
  join(OUT, 'hero-frame.json'),
  JSON.stringify({ clip: box, out: { w: outW, h: outH }, capturedAt: new Date().toISOString() }, null, 2),
);
await browser.close();
server.close();
console.log('[6/6] done. state/out/hero.webm, hero.jpg, hero-frame.json');

/** Load welcome_v2 from the local export and screenshot the hero, to check the new framing. */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const DIST = resolve('dist');
const OUT = resolve('state/out');
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm' };

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const direct = join(DIST, url);
  let file = join(DIST, 'index.html');
  if (url !== '/' && existsSync(direct) && !direct.endsWith('/')) file = direct;
  else if (existsSync(direct + '.html')) file = direct + '.html';
  const h = { 'content-type': TYPES[extname(file)] || 'application/octet-stream' };
  if (file.endsWith('.webm') || file.endsWith('.mp4')) h['content-length'] = statSync(file).size;
  res.writeHead(200, h);
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
const bad = [];
page.on('console', (m) => m.type() === 'error' && bad.push(m.text()));
page.on('requestfailed', (r) => bad.push(`${r.failure()?.errorText} ${r.url()}`));
await page.goto(`${base}/welcome_v2`, { waitUntil: 'networkidle' });
await page.waitForSelector('#liveHero');

// Before the iframe takes over: this is the recorded clip in its frame.
await page.waitForTimeout(600);
await page.locator('#liveHero').screenshot({ path: join(OUT, 'v2-video.jpg'), type: 'jpeg', quality: 88 });
// After: the live binder, clipped by the same numbers.
await page.waitForTimeout(6000);
await page.locator('#liveHero').screenshot({ path: join(OUT, 'v2-live.jpg'), type: 'jpeg', quality: 88 });
const live = await page.evaluate(() => document.getElementById('liveHero')?.classList.contains('live'));
console.log(`live iframe took over: ${live}`);
console.log(bad.length ? `page problems:\n  ${bad.slice(0, 8).join('\n  ')}` : 'no console errors, no failed requests');
await browser.close();
server.close();

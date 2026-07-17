// Repro: queued Fast Refresh updates applied on tab refocus block the main thread.
// Loads the app, freezes the page (CDP lifecycle), edits a source file N times so Metro
// queues N hot updates, unfreezes, and measures how long the main thread blocks.
import { chromium } from 'playwright-core';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const APP = 'http://localhost:8081';
const TARGET = 'src/data/rarityCode.ts'; // low-traffic, currently clean file
const EDITS = 12;

const original = readFileSync(TARGET, 'utf8');
try {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newContext().then((c) => c.newPage());
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForTimeout(8000); // let the app settle + HMR socket connect
  const cdp = await page.context().newCDPSession(page);

  console.log('freezing page (simulates a backgrounded tab)…');
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });

  console.log(`making ${EDITS} edits to ${TARGET} (Metro pushes a hot update per save)…`);
  for (let i = 0; i < EDITS; i++) {
    appendFileSync(TARGET, `\n// hmr-repro ${i}\n`);
    await new Promise((r) => setTimeout(r, 1500)); // let Metro build each update
  }
  await new Promise((r) => setTimeout(r, 4000));

  console.log('unfreezing (simulates refocus) and probing responsiveness…');
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  const t0 = Date.now();
  let last = Date.now();
  const gaps = [];
  while (Date.now() - t0 < 90000) {
    await page.evaluate('1').catch(() => {});
    const now = Date.now();
    if (now - last > 1000) gaps.push({ at: ((last - t0) / 1000).toFixed(1), blockedS: ((now - last) / 1000).toFixed(1) });
    last = now;
    await new Promise((r) => setTimeout(r, 200));
    if (gaps.length && Date.now() - t0 > 30000) break;
  }
  console.log('main-thread blocks after unfreeze:', gaps.length ? gaps : 'none detected');
  await browser.close();
} finally {
  writeFileSync(TARGET, original); // always restore the file
  console.log('restored', TARGET);
}

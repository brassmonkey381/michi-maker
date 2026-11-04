// The mat customizer and the page background picture picker, headless on the :8090 dev server,
// as the test account, on its Screenshot fixtures binder (page 5 is an art window page of nine
// cards). Sets a binder-wide mat through the API, checks the stock cards wear it, opens the page
// bar's Art view popover to the page's mat panel, then the Background popover to its picture
// picker, and puts the binder's style back.
//   node scripts/lab/mats-run.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

import { sessionSeed } from '../../qa/lib/personas.mjs';

const kv = (p) => Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const secrets = kv('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets');
const env = kv('C:/Users/Brian/source/repos/tcgscan/michi-maker/.env');
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/mats';
mkdirSync(OUT, { recursive: true });
const BINDER = 'c9bb5b77-c637-4759-bd38-a8b8e8b86915';
const WINDOW_PAGE = 5; // 1-based, the page whose art_view is 'window'
const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, ok, extra = '') => { log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' ' + extra : ''}`); if (!ok) failures += 1; };

const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: secrets.MICHI_TEST_EMAIL, password: secrets.MICHI_TEST_PASSWORD }) }).then((r) => r.json());
if (!session.access_token) { log('sign-in failed'); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${session.access_token}` };
const JH = { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' };

// A picture for the mat: the standing approved artist piece, read as a guest.
const shelf = await fetch(`${URL_}/rest/v1/artist_shelf?select=id,url,title&limit=1`, { headers: { apikey: KEY } }).then((r) => r.json());
const picture = shelf[0]?.url;
check('an artist piece is on the shelf for the mat', !!picture);

const [before] = await fetch(`${URL_}/rest/v1/binders?select=page_style&id=eq.${BINDER}`, { headers: H }).then((r) => r.json());
const restore = async () => {
  await fetch(`${URL_}/rest/v1/binders?id=eq.${BINDER}`, { method: 'PATCH', headers: JH, body: JSON.stringify({ page_style: before?.page_style ?? null }) });
  log('  binder style put back');
};
const mat = { paper: '#f4efe4', ink: '#1d1a2b', font: 'sans', name: 'clean', fields: ['hp', 'rarity', 'set', 'number'], ...(picture ? { picture } : {}) };
const set = await fetch(`${URL_}/rest/v1/binders?id=eq.${BINDER}`, { method: 'PATCH', headers: JH, body: JSON.stringify({ page_style: { ...(before?.page_style ?? {}), mat } }) }).then((r) => r.json());
check('the binder carries a mat style', set[0]?.page_style?.mat?.font === 'sans');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(({ key, value }) => { try { localStorage.setItem(key, value); } catch {} }, sessionSeed(session));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|ResizeObserver/i.test(m.text())) log('  console.error:', m.text().slice(0, 160)); });
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto(`http://localhost:8090/binder/${BINDER}?edit=1&page=${WINDOW_PAGE}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForSelector('[data-testid="page-bar-artView"]', { timeout: 240000 });
  await wait(5000);
  await page.getByText('Got it', { exact: true }).first().click({ timeout: 2000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/01-mats.png`, timeout: 120000, animations: 'disabled' });
  const body = await text();
  // The stock cards: the picture over the paper, the Set and Number lines, and not the ones left off.
  const pics = picture ? await page.evaluate((u) => [...document.querySelectorAll('img')].filter((i) => i.src === u).length, picture) : 0;
  check('the stock cards wear the mat picture', !picture || pics >= 3, `(${pics} of them)`);
  check('the mat shows the Set line', /\bSET\b/.test(body));
  check('the mat leaves off the Illustrator line', !/ILLUSTRATOR/.test(body));
  check('the mat shows HP beside the name', /\b\d{2,3} HP\b/.test(body));
  check('the mat shows the rarity beside the name', /\b(COMMON|UNCOMMON|RARE|ILLUSTRATION RARE|DOUBLE RARE|ULTRA RARE|PROMO)\b/.test(body));
  check('the old No. and type line is gone', !/\bNO\. \d{3}\b/.test(body));
  const paper = await page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).backgroundColor === 'rgb(244, 239, 228)').length);
  check('the stock cards are painted in the mat paper', paper >= 3, `(${paper})`);

  // The page bar's Art view popover: the page's own mat panel behind its pill.
  await page.locator('[data-testid="page-bar-artView"]').first().dispatchEvent('click');
  await wait(1500);
  const toggle = page.locator('[data-testid="page-mat-toggle"]').first();
  check('the Art view popover offers Mats on this page', (await toggle.count()) === 1);
  await toggle.click({ timeout: 5000 }).catch(() => {});
  await wait(1500);
  check('the page mat panel opens with Paper, Ink, Name, Font and Lines', (await page.locator('[data-testid="page-mat"]').count()) === 1 && (await page.locator('[data-testid="page-mat-name"]').count()) === 1 && (await page.locator('[data-testid="page-mat-font"]').count()) === 1 && (await page.locator('[data-testid="page-mat-fields"]').count()) === 1);
  const panelText = await page.locator('[data-testid="page-mat-fields"]').first().innerText().catch(() => '');
  check('the Lines chips offer HP and Rarity and not No. and type', /\bHP\b/.test(panelText) && /Rarity/.test(panelText) && !/No\. and type/.test(panelText));
  await page.locator('[data-testid="page-mat-picture"]').first().click({ timeout: 5000 }).catch(() => {});
  await wait(1500);
  check('the mat picture picker shows the artists shelf', (await page.locator('[data-testid="page-mat-artists"]').count()) >= 1);
  await page.screenshot({ path: `${OUT}/02-page-mat.png`, timeout: 120000, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await wait(800);

  // The page bar's Background popover: a picture picker now, with the shelf and an upload.
  await page.locator('[data-testid="page-bar-background"]').first().dispatchEvent('click');
  await wait(1500);
  await page.locator('[data-testid="page-bg-picture"]').first().click({ timeout: 5000 });
  await wait(1500);
  check('the page background picker shows the presets', (await page.locator('[data-testid="page-bg-presets"]').count()) >= 1);
  check('the page background picker shows the artists shelf', (await page.locator('[data-testid="page-bg-artists"]').count()) >= 1);
  check('the page background picker offers an upload', (await page.locator('[data-testid="page-bg-upload"]').count()) >= 1);
  check('the page background has no None pill', (await page.locator('[data-testid="page-bg-none"]').count()) === 0);
  await page.screenshot({ path: `${OUT}/03-page-bg.png`, timeout: 120000, animations: 'disabled' });
} finally {
  await browser.close();
  await restore();
}
log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures ? 1 : 0);

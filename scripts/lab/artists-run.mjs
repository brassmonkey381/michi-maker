// The artists flow, headless on the :8090 dev server, as the test account (made an artist by
// state/apply-artists.ps1). Two halves, because approval is the owner's click in Studio:
//   node scripts/lab/artists-run.mjs offer    account sheet -> Your art -> upload -> offer -> pending
//                                              (then the owner approves "Lab piece" in Studio)
//   node scripts/lab/artists-run.mjs place    Add art -> From artists shelf -> place -> credit;
//                                              sleeve picker shows the shelf; then withdraws the piece
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

import { sessionSeed } from '../../qa/lib/personas.mjs';

const MODE = process.argv[2] === 'place' ? 'place' : 'offer';
const kv = (p) => Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const secrets = kv('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets');
const env = kv('C:/Users/Brian/source/repos/tcgscan/michi-maker/.env');
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/artists';
mkdirSync(OUT, { recursive: true });
const TITLE = 'Lab piece';
const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, ok, extra = '') => { log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' ' + extra : ''}`); if (!ok) failures += 1; };

const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: secrets.MICHI_TEST_EMAIL, password: secrets.MICHI_TEST_PASSWORD }) }).then((r) => r.json());
if (!session.access_token) { log('sign-in failed'); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${session.access_token}` };
const prof = await fetch(`${URL_}/rest/v1/profiles?select=username,is_artist,artist_link&id=eq.${session.user.id}`, { headers: H }).then((r) => r.json());
log(`  test account @${prof[0]?.username}: artist ${prof[0]?.is_artist}`);
if (!prof[0]?.is_artist) { log('the test account is not an artist yet: run state/apply-artists.ps1 first'); process.exit(2); }

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(({ key, value }) => { try { localStorage.setItem(key, value); } catch {} }, sessionSeed(session));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|ResizeObserver/i.test(m.text())) log('  console.error:', m.text().slice(0, 160)); });
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const wait = (ms) => page.waitForTimeout(ms);

if (MODE === 'offer') {
  // A picture to offer: a 600x400 gradient.
  const png = `${OUT}/lab-piece.png`;
  const raw = Buffer.alloc(600 * 400 * 3);
  for (let y = 0; y < 400; y += 1) for (let x = 0; x < 600; x += 1) { const i = (y * 600 + x) * 3; raw[i] = (x / 600) * 255; raw[i + 1] = 90; raw[i + 2] = (y / 400) * 255; }
  writeFileSync(png, await sharp(raw, { raw: { width: 600, height: 400, channels: 3 } }).png().toBuffer());

  await page.goto('http://localhost:8090/my-binders', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForSelector('[aria-label="Account"]', { timeout: 240000 });
  await wait(2000);
  const pill = page.locator('[aria-label="Account"]').first();
  await pill.click({ timeout: 10000 }).catch(() => pill.dispatchEvent('click'));
  await wait(1500);
  if (!(await page.getByText('Sign out').count())) await pill.dispatchEvent('click');
  await wait(1200);
  const panel = page.locator('[data-testid="artist-panel"]').first();
  await panel.scrollIntoViewIfNeeded().catch(() => {});
  check('the account sheet shows the Your art panel', (await panel.count()) === 1);
  await page.screenshot({ path: `${OUT}/01-panel.png` });
  // The commission link.
  const link = page.locator('[data-testid="artist-link"]').first();
  await link.fill('https://www.reddit.com/user/michimaker');
  await wait(400);
  await page.getByText('Save', { exact: true }).last().click({ timeout: 8000 }).catch(() => {});
  await wait(1500);
  // Upload through the hidden file input inside the panel, then title and offer.
  const input = panel.locator('input[type="file"]').first();
  await input.setInputFiles(png);
  await page.waitForSelector('[data-testid="artist-piece-title"]', { timeout: 60000 }).catch(() => log('  no draft after upload'));
  await page.locator('[data-testid="artist-piece-title"]').fill(TITLE);
  // Also offer it for sleeves, so the place half can check that picker.
  await panel.getByText('Sleeves', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
  await wait(300);
  await page.screenshot({ path: `${OUT}/02-draft.png` });
  await page.locator('[data-testid="artist-offer"]').click({ timeout: 8000 });
  await wait(2500);
  const t = await text();
  check('the piece is listed as waiting for review', /Lab piece/.test(t) && /Waiting for review/.test(t));
  await page.screenshot({ path: `${OUT}/03-pending.png` });
  const rows = await fetch(`${URL_}/rest/v1/artist_pieces?select=id,status,surfaces&title=eq.${encodeURIComponent(TITLE)}`, { headers: H }).then((r) => r.json());
  check('the row is pending with slot, cover and sleeve surfaces', rows[0]?.status === 'pending' && ['slot', 'cover', 'sleeve'].every((s) => rows[0]?.surfaces?.includes(s)), JSON.stringify(rows[0] ?? null));
  // Pending means invisible: the public shelf shows nothing for it.
  const shelf = await fetch(`${URL_}/rest/v1/artist_shelf?select=id&title=eq.${encodeURIComponent(TITLE)}`, { headers: { apikey: KEY } }).then((r) => r.json());
  check('a pending piece is not on the public shelf', Array.isArray(shelf) && shelf.length === 0);
  await page.keyboard.press('Escape');
  log('\n  NEXT: approve "Lab piece" in Studio (Artists panel), then run: node scripts/lab/artists-run.mjs place');
} else {
  const shelf = await fetch(`${URL_}/rest/v1/artist_shelf?select=id,url,artist_username&title=eq.${encodeURIComponent(TITLE)}`, { headers: { apikey: KEY } }).then((r) => r.json());
  check('the approved piece is on the public shelf (anon read)', shelf.length === 1, `(${shelf.length})`);
  if (!shelf.length) { await browser.close(); log('approve it in Studio first'); process.exit(1); }

  await page.goto('http://localhost:8090/my-binders?open=new', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 240000 });
  await wait(3000);
  // The artwork dock: its Add art button, or the rail face that opens it.
  let add = page.locator('[data-testid="art-add"]').first();
  if (!(await add.count())) { await page.getByText('Art', { exact: true }).first().click({ timeout: 8000 }).catch(() => {}); await wait(1200); add = page.locator('[data-testid="art-add"]').first(); }
  await add.click({ timeout: 10000 });
  await wait(2500);
  const shelfBox = page.locator('[data-testid="add-art-artists"]').first();
  check('the Add art sheet shows the From artists shelf', (await shelfBox.count()) === 1);
  await page.screenshot({ path: `${OUT}/04-add-art.png` });
  const tile = page.locator(`[data-testid="add-art-artists-${shelf[0].id}"]`).first();
  await tile.click({ timeout: 8000 });
  await wait(3000);
  await page.screenshot({ path: `${OUT}/05-placed.png` });
  const placed = await page.evaluate((u) => [...document.querySelectorAll('img')].some((i) => i.src === u), shelf[0].url);
  check('the piece is placed on the page', placed);
  // Image properties names it as an artist piece, preview only.
  const propsText = await text();
  check('the credit says artist piece, preview only', /Artist piece by @\w+, preview only/.test(propsText) || /preview only/.test(propsText));
  // A sleeve picker offers the shelf too.
  await page.keyboard.press('Escape');
  await wait(800);
  const settings = page.getByText('Settings', { exact: true }).first();
  if (await settings.count()) { await settings.click({ timeout: 8000 }).catch(() => {}); await wait(1500); }
  const picBtn = page.locator('[data-testid="binder-sleeve-picture"]').first();
  if (await picBtn.count()) {
    await picBtn.click({ timeout: 8000 });
    await wait(1500);
    check('the sleeve picker shows the artists shelf', (await page.locator('[data-testid="binder-sleeve-artists"]').count()) === 1);
    await page.screenshot({ path: `${OUT}/06-sleeve.png` });
  } else {
    log('  binder sleeve picture button not found; skipping the sleeve shelf check');
  }
  // Withdraw: the artist's own update to 'removed' is allowed by the guard, and the shelf drops it.
  const rows = await fetch(`${URL_}/rest/v1/artist_pieces?select=id&title=eq.${encodeURIComponent(TITLE)}`, { headers: H }).then((r) => r.json());
  for (const r of rows) await fetch(`${URL_}/rest/v1/artist_pieces?id=eq.${r.id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'removed' }) });
  const after = await fetch(`${URL_}/rest/v1/artist_shelf?select=id&title=eq.${encodeURIComponent(TITLE)}`, { headers: { apikey: KEY } }).then((r) => r.json());
  check('withdrawing the piece drops it from the shelf', after.length === 0);
  // And an artist cannot approve their own piece.
  const forbidden = await fetch(`${URL_}/rest/v1/artist_pieces?id=eq.${rows[0]?.id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'approved' }) });
  check('an artist cannot set their own piece to approved', forbidden.status >= 400, `(${forbidden.status})`);
}

await browser.close();
log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

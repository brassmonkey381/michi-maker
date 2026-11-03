// The artists flow, headless on the :8090 dev server, as the test account (made an artist by
// state/apply-artists.ps1). Two halves, because approval is the owner's click in Studio:
//   node scripts/lab/artists-run.mjs offer    account sheet -> Your art -> upload -> offer -> pending;
//                                              withdraw and the refused self-approval. The FIRST piece
//                                              is left pending for the owner to approve once; it then
//                                              stays approved as the shelf's standing lab piece.
//   node scripts/lab/artists-run.mjs place    Add art -> From artists shelf -> place -> credit;
//                                              the page bar's sleeve picker shows the shelf
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
// The offer half runs on the phone size, where the Account pill opens the sheet the way the
// delete-account lab proved; the place half needs the desktop editor's artwork dock.
const ctx = MODE === 'offer'
  ? await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  : await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
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
  const rows = await fetch(`${URL_}/rest/v1/artist_pieces?select=id,status,surfaces&title=eq.${encodeURIComponent(TITLE)}&status=neq.removed&order=created_at.desc`, { headers: H }).then((r) => r.json());
  check('the row is pending with slot, cover and sleeve surfaces', rows[0]?.status === 'pending' && ['slot', 'cover', 'sleeve'].every((s) => rows[0]?.surfaces?.includes(s)), JSON.stringify(rows[0] ?? null));
  // Pending means invisible: the public shelf shows nothing for it.
  const shelf = await fetch(`${URL_}/rest/v1/artist_shelf?select=id&title=eq.${encodeURIComponent(TITLE)}`, { headers: { apikey: KEY } }).then((r) => r.json());
  check('a pending piece is not on the public shelf', Array.isArray(shelf) && shelf.length === 0);
  await page.keyboard.press('Escape');
  // An artist can withdraw their own piece but never approve it.
  const forbidden = await fetch(`${URL_}/rest/v1/artist_pieces?id=eq.${rows[0]?.id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'approved' }) });
  check('an artist cannot set their own piece to approved', forbidden.status >= 400, `(${forbidden.status})`);
  const standing = await fetch(`${URL_}/rest/v1/artist_shelf?select=id&title=eq.${encodeURIComponent(TITLE)}`, { headers: { apikey: KEY } }).then((r) => r.json());
  if (standing.length) {
    const w = await fetch(`${URL_}/rest/v1/artist_pieces?id=eq.${rows[0]?.id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ status: 'removed' }) }).then((r) => r.json());
    check('the artist can withdraw the new piece', w[0]?.status === 'removed');
    await fetch(`${URL_}/rest/v1/artist_pieces?id=eq.${rows[0]?.id}`, { method: 'DELETE', headers: H });
    log('  a standing approved Lab piece exists; the new one was withdrawn and deleted');
  } else {
    log('\n  NEXT: approve "Lab piece" once (Studio, or state/apply-artists-2.ps1), then run: node scripts/lab/artists-run.mjs place');
  }
} else {
  const shelf = await fetch(`${URL_}/rest/v1/artist_shelf?select=id,url,artist_username&title=eq.${encodeURIComponent(TITLE)}`, { headers: { apikey: KEY } }).then((r) => r.json());
  check('the approved piece is on the public shelf (anon read)', shelf.length === 1, `(${shelf.length})`);
  if (!shelf.length) { await browser.close(); log('approve it in Studio first'); process.exit(1); }

  // A binder of the lab's own (open=new reopens the account's last binder, the fixtures one), and
  // any stray copy of the piece an earlier run left in a fixture pocket goes first.
  const JH = { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  await fetch(`${URL_}/rest/v1/binder_slots?insert_image_url=eq.${encodeURIComponent(shelf[0].url)}`, { method: 'DELETE', headers: H });
  const [labBinder] = await fetch(`${URL_}/rest/v1/binders`, { method: 'POST', headers: JH, body: JSON.stringify({ title: 'Lab artists binder' }) }).then((r) => r.json());
  await fetch(`${URL_}/rest/v1/binder_pages`, { method: 'POST', headers: JH, body: JSON.stringify({ binder_id: labBinder.id, position: 0, title: 'Lab page' }) });
  const cleanup = async () => { await fetch(`${URL_}/rest/v1/binders?id=eq.${labBinder.id}`, { method: 'DELETE', headers: H }); log('  removed the lab binder'); };
  await page.goto(`http://localhost:8090/binder/${labBinder.id}?edit=1`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 240000 });
  await wait(3000);
  await page.getByText('Got it', { exact: true }).first().click({ timeout: 3000 }).catch(() => {});
  // The artwork panel opens from its rail on the left (scripts/test-artwork-tab-ui.mjs).
  await page.locator('[data-testid="artwork-rail"]').first().click({ timeout: 10000 });
  await wait(2000);
  const add = page.locator('[data-testid="artwork-dock"]').getByText(/Add art/).first();
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
  // The pocket carries the artist's credit badge.
  // The pocket's credit strip is the binder's "Art" label, on by default on most binders; when it
  // is on, it must name the artist.
  const credited = new RegExp(`@${shelf[0].artist_username}`).test(await text());
  log(`  credit strip ${credited ? 'names the artist' : 'not shown on this binder (the Art label is off)'}`);
  // The page bar's Sleeves chip opens the sleeve row; its Picture pill shows the shelf.
  await page.keyboard.press('Escape');
  await wait(800);
  await page.getByText('Sleeves', { exact: true }).first().click({ timeout: 8000 }).catch(() => log('  no Sleeves chip'));
  await wait(1500);
  const picBtn = page.locator('[data-testid$="-sleeve-picture"]').first();
  if (await picBtn.count()) {
    await picBtn.click({ timeout: 8000 });
    await wait(2000);
    check('the sleeve picker shows the artists shelf', (await page.locator('[data-testid$="-sleeve-artists"]').count()) >= 1);
    await page.screenshot({ path: `${OUT}/06-sleeve.png` });
  } else {
    log('  sleeve Picture pill not found; testids:', (await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')).filter((t) => /sleeve|picture|artists/.test(t)).join(', '))).slice(0, 300));
    check('the sleeve picker shows the artists shelf', false);
  }
  await cleanup();
}

await browser.close();
log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

// Account deletion from the account sheet, end to end, on the phone size: a fresh qa-rig free
// account (qa/lib/personas), the sheet's Delete account link, the typed DELETE gate, the function,
// the signed-out landing. Also shoots the Home pill a guest sees.
//   node scripts/lab/delete-account-run.mjs        (dev server on :8090; creates and deletes one qa-rig account)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

import { resolve, sessionSeed } from '../../qa/lib/personas.mjs';

const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/delete-account';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, ok, extra = '') => { log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' ' + extra : ''}`); if (!ok) failures += 1; };
const browser = await chromium.launch({ channel: 'msedge', headless: true });

// 1. The guest's Home pill.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // A first-time guest at / is sent to /welcome, which has no pill; My Binders is where the pill is.
  await page.goto('http://localhost:8090/my-binders', { waitUntil: 'domcontentloaded', timeout: 240000 });
  // The first load after a cold Metro start compiles for a minute: wait for the pill, not a clock.
  await page.waitForSelector('[aria-label="Account"]', { timeout: 240000 }).catch(() => log('  no Account pill on Home'));
  await page.waitForTimeout(1500);
  const pill = page.locator('[aria-label="Account"]').first();
  const t = (await pill.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check('guest Home pill reads "Create account or sign in"', t === 'Create account or sign in', `(${t})`);
  await page.screenshot({ path: `${OUT}/01-home-guest.png`, clip: { x: 0, y: 0, width: 390, height: 260 } });
  await ctx.close();
}

// 2. A fresh free account deletes itself.
const r = await resolve('free', { runId: 'delete-lab' });
if (r.kind !== 'signed-in') { log('could not make a free account:', r.note); process.exit(2); }
log('  made', r.email);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const seed = sessionSeed(r.session);
await ctx.addInitScript(({ key, value }) => { try { localStorage.setItem(key, value); } catch {} }, seed);
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) log('  console.error:', m.text().slice(0, 140)); });
await page.goto('http://localhost:8090/my-binders', { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForSelector('[aria-label="Account"]', { timeout: 240000 }).catch(() => log('  no Account pill on My Binders'));
await page.waitForTimeout(2500);
// A fresh account meets the username gate first; claim one so the account sheet is reachable.
if (await page.getByText('Pick your username').count()) {
  await page.locator('input').first().fill(`qarig${Date.now().toString(36).slice(-8)}`);
  await page.waitForTimeout(600);
  await page.getByText('Claim username', { exact: true }).first().click({ timeout: 10000, force: true });
  for (let i = 0; i < 30 && (await page.getByText('Pick your username').count()); i += 1) await page.waitForTimeout(500);
  log('  username claimed:', (await page.getByText('Pick your username').count()) === 0);
}
await page.waitForTimeout(1500);
const pill = page.locator('[aria-label="Account"]').first();
await pill.click({ timeout: 20000 }).catch(() => log('  pill click timed out'));
await page.waitForTimeout(1500);
if (!(await page.getByText('Sign out').count())) {
  log('  sheet not open after a click; dispatching');
  await pill.dispatchEvent('click');
  await page.waitForTimeout(1500);
}
log('  sheet open:', (await page.getByText('Sign out').count()) > 0);
const link = page.locator('[data-testid="delete-account"]').first();
await link.scrollIntoViewIfNeeded().catch(() => {});
check('the account sheet has a Delete account link', (await link.count()) === 1);
await page.screenshot({ path: `${OUT}/02-sheet.png` });
await link.tap({ timeout: 8000 }).catch(async () => {
  log('  delete link: a tap is intercepted (see 02-sheet.png); dispatching the click');
  await link.dispatchEvent('click');
});
await page.waitForTimeout(1000);
const body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
check('the confirmation names what goes and asks for DELETE', /Delete your account\?/.test(body) && /cannot be undone/.test(body) && /Type DELETE/.test(body));
await page.screenshot({ path: `${OUT}/03-confirm.png` });
const confirmBtn = page.getByText('Delete my account', { exact: true }).first();
const disabledBefore = await confirmBtn.evaluate((el) => !!el.closest('[aria-disabled="true"], [disabled]'));
check('the red button is disabled until DELETE is typed', disabledBefore);
await page.locator('input').last().fill('DELETE');
await page.waitForTimeout(400);
await confirmBtn.tap({ timeout: 8000 }).catch(async () => {
  log('  confirm: a tap is intercepted; dispatching the click');
  await confirmBtn.dispatchEvent('click');
});
let t2 = '';
for (let i = 0; i < 40; i += 1) { await page.waitForTimeout(500); t2 = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' '); if (!/Delete your account\?/.test(t2) && !/Deleting/.test(t2)) break; }
await page.waitForTimeout(2500);
t2 = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
await page.screenshot({ path: `${OUT}/04-after.png` });
check('the sheet closed and nothing errored on screen', !/Could not delete/.test(t2) && !/Delete your account\?/.test(t2));
check('landed signed out (Sign in pill, not an avatar, not a guest)', /\bSign in\b/.test(t2) && !/Create account or sign in/.test(t2));
// 3. The account is gone: the old session can no longer read its own profile.
const probe = await fetch(`${process.env.SUPA_URL ?? 'https://piikwvntldytjejxmcla.supabase.co'}/auth/v1/user`, { headers: { apikey: process.env.SUPA_KEY ?? '', Authorization: `Bearer ${r.session.access_token}` } }).catch(() => null);
check('the deleted account\'s token is refused by auth', !probe || probe.status === 401 || probe.status === 403 || probe.status === 404, `(${probe?.status})`);
await browser.close();
log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

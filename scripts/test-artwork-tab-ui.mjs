// The Artwork tab is the slice tray now, not the Slice Studio.
//
// It used to embed the whole studio, which was the wrong thing in the wrong place twice over: the
// studio is a workspace that wants 800px before its two-column layout unstacks, so the tab had a
// special case forcing it back to a full-width sheet and it could never dock — and it put the
// CUTTING tool where you go to PLACE art, when the studio cannot place anything. It saves pieces;
// the tray is the only surface that can put one in a pocket.
//
// So this checks the three things that change:
//   * the tab shows the tray (pieces, or the empty-state that points at the studio), not a canvas;
//   * it DOCKS on a wide screen, where it used to force a full-width sheet;
//   * the studio is still reachable, as a button on it.
//
// It opens the studio and closes it again; it saves nothing and places nothing.
//
//   node scripts/test-artwork-tab-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'artwork-tab';
// Overridable so a run can point at a second dev server — two agents sharing this repo
// means port 8081 is not always ours, and not always alive.
const BASE = process.env.MICHI_BASE ?? 'http://localhost:8081';
const PROJECT = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

const raw = readFileSync(SECRETS, 'utf8');
const read = (k) => {
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(`${k}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim() : null;
};
const anon = read('APP_PUBLISHABLE_KEY');
const session = await (
  await fetch(`https://${PROJECT}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: read('MICHI_TEST_EMAIL'), password: read('MICHI_TEST_PASSWORD') }),
  })
).json();
if (!session.access_token) {
  console.log('FAILED: could not mint a session for the test account');
  process.exit(1);
}
const mine = await (
  await fetch(`https://${PROJECT}.supabase.co/rest/v1/binders?owner_id=eq.${session.user.id}&select=id&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` },
  })
).json();
if (!Array.isArray(mine) || !mine.length) {
  console.log('FAILED: the test account owns no binders — seed one first');
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await ctx.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
  key: `sb-${PROJECT}-auth-token`,
  value: JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: session.user,
  }),
});
const p = await ctx.newPage();
const settle = (ms) => p.waitForTimeout(ms);
const fail = async (msg) => {
  console.log(`FAIL — ${msg}`);
  await p.screenshot({ path: `${OUT}-fail.png` });
  await browser.close();
  process.exit(1);
};

await p.goto(`${BASE}/binder/${mine[0].id}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
await settle(4500);
for (let i = 0; i < 30 && (await p.getByText('Edit', { exact: false }).count()) === 0; i++) await settle(1000);
let entered = false;
for (let a = 0; a < 4 && !entered; a++) {
  try { await p.getByText('Edit', { exact: false }).first().click({ timeout: 10000 }); entered = true; }
  catch { await settle(6000); }
}
if (!entered) await fail('never got into edit mode');
await settle(3000);

// Open the picker on an empty pocket, then switch to Artwork.
const plus = p.locator('[data-testid="binder-page-current"]').getByText('+', { exact: true }).first();
if ((await plus.count()) === 0) await fail('no empty pocket to open the picker from');
await plus.scrollIntoViewIfNeeded({ timeout: 8000 });
await plus.click({ timeout: 8000 });
for (let i = 0; i < 25 && !(await p.locator('[data-testid="card-picker-dock"]').count()); i++) await settle(1000);
// The artwork side is its own dock on the left now, not a tab inside the card picker.

await settle(1500);
// The artwork panel opens from its rail on the left, which is always there while editing.
await p.locator('[data-testid="artwork-rail"]').first().click({ timeout: 8000 });
await settle(2500);
await p.screenshot({ path: `${OUT}-1-artwork.png` });

let ok = true;

// 1. IT DOCKS. This is the exception that goes away: the tab used to force a full-width sheet.
const docked = (await p.locator('[data-testid="artwork-dock"]').count()) > 0;
const pageVisible = await p.evaluate(() => {
  const el = document.querySelector('[data-testid="binder-page-current"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 200 && r.left < window.innerWidth && r.right > 0;
});
console.log(`docked      : ${docked}, binder still visible: ${pageVisible}`);
if (!docked) { console.log('FAIL — the Artwork tab did not dock; it still forces a sheet'); ok = false; }
if (!pageVisible) { console.log('FAIL — the binder is hidden behind the Artwork panel'); ok = false; }

// 2. IT IS THE TRAY. Either it lists pieces, or it says why there are none — but it is not a canvas.
const body = await p.evaluate(() => document.body.innerText);
const looksLikeTray = /Artwork/.test(body) && (/No pieces yet/.test(body) || /Drag a piece into a pocket/.test(body));
const looksLikeStudio = /Scale to fit/.test(body) || /Slice into/.test(body) || /paste an image URL/.test(body);
console.log(`tray copy   : ${looksLikeTray}, studio chrome present: ${looksLikeStudio}`);
if (!looksLikeTray) { console.log('FAIL — the Artwork tab does not read as a tray'); ok = false; }
if (looksLikeStudio) { console.log('FAIL — the studio is still embedded in the tab'); ok = false; }

// 3. THE STUDIO IS STILL REACHABLE, as a button on the tray.
// Scoped to the artwork dock, which is where the tray and its studio button live.
const newBtn = p.locator('[data-testid="artwork-dock"]').getByText(/Slice new art/).first();
if ((await newBtn.count()) === 0) {
  console.log('FAIL — no way to open the Slice Studio from the Artwork tab');
  ok = false;
} else {
  await newBtn.click({ timeout: 8000 });
  for (let i = 0; i < 20 && !(await p.getByText('Slice studio', { exact: true }).count()); i++) await settle(1000);
  const studioOpen = (await p.getByText('Slice studio', { exact: true }).count()) > 0;
  console.log(`studio opens: ${studioOpen}`);
  if (!studioOpen) { console.log('FAIL — the button did not open the studio'); ok = false; }
  await p.screenshot({ path: `${OUT}-2-studio.png` });
  await p.getByText('Close', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
  await settle(1500);
}

console.log(ok ? 'PASS — the Artwork tab is a dockable tray with the studio one button away' : 'FAIL');
if (!ok) process.exitCode = 1;
await browser.close();

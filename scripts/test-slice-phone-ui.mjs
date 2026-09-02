// The Slice Studio on a phone.
//
// Two things the audit called out, both invisible on a desktop and both about the one screen whose
// whole job is looking at art.
//
// CANVAS FIRST. Stacked into one column, the controls came first and the canvas sat below them —
// so on the device with the least room you scrolled past every control in the studio to reach the
// thing you came to look at, and framed in a ~300px window at the bottom of a long page. This
// checks the canvas is actually ABOVE the controls once the layout stacks.
//
// A HEADER THAT FITS. Close, the title, help and Save shared a space-between row with no minimum
// separation, so at phone width they ran into each other and read as "CloseSlice studio". This
// checks Close and the title do not overlap.
//
// Credentials come from tcgscan.secrets and are never printed. It only looks: it opens the studio,
// loads an image by URL, measures, and closes without saving.
//
//   node scripts/test-slice-phone-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'slice-phone';
// Overridable so a run can point at a second dev server — two agents sharing this repo
// means port 8081 is not always ours, and not always alive.
const BASE = process.env.MICHI_BASE ?? 'http://localhost:8081';
const PROJECT = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
// Narrow enough to stack (TWO_COL_MIN is 800), and a real phone size rather than a contrived one.
const VIEWPORT = { width: 414, height: 896 };

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
const BINDER = mine[0].id;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
  await p.screenshot({ path: `${OUT}-fail.png`, fullPage: true });
  await browser.close();
  process.exit(1);
};

await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
await settle(5000);
for (let i = 0; i < 30 && (await p.getByText('Edit', { exact: false }).count()) === 0; i++) await settle(1000);
let entered = false;
for (let a = 0; a < 4 && !entered; a++) {
  try { await p.getByText('Edit', { exact: false }).first().click({ timeout: 10000 }); entered = true; }
  catch { await settle(6000); }
}
if (!entered) await fail('never got into edit mode');
await settle(3000);

const artUrl = await p.evaluate(() => {
  const img = [...document.querySelectorAll('img')].find((el) => (el.getAttribute('src') || '').includes('http'));
  return img ? img.getAttribute('src') : null;
});
if (!artUrl) await fail('no card image on the page to borrow a URL from');

// The tray's own entry point — the standalone studio, which is the one with the header row.
await p.getByText('Slice new art', { exact: false }).first().click({ timeout: 12000 });
for (let i = 0; i < 25 && !(await p.getByText('Slice studio', { exact: true }).count()); i++) await settle(1000);
await settle(2000);

// --- the header fits ----------------------------------------------------------------------------
const header = await p.evaluate(() => {
  const pick = (text) =>
    [...document.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && (el.textContent || '').trim() === text,
    );
  const close = pick('Close');
  const title = pick('Slice studio');
  if (!close || !title) return null;
  const c = close.getBoundingClientRect();
  const t = title.getBoundingClientRect();
  return {
    closeRight: Math.round(c.right),
    titleLeft: Math.round(t.left),
    sameRow: Math.abs(c.top - t.top) < 12,
  };
});
console.log('header      :', JSON.stringify(header));
let ok = true;
if (!header) {
  console.log('FAIL — could not find Close and the title to measure');
  ok = false;
} else if (header.sameRow && header.titleLeft < header.closeRight) {
  console.log(`FAIL — Close and the title overlap ("CloseSlice studio"): close ends ${header.closeRight}, title starts ${header.titleLeft}`);
  ok = false;
}

await p.getByPlaceholder(/paste an image URL/i).fill(artUrl);
await p.getByText('Load', { exact: true }).first().click({ timeout: 8000 });
for (let i = 0; i < 25 && !(await p.getByText('Scale to fit', { exact: true }).count()); i++) await settle(1000);
await settle(3000);
await p.screenshot({ path: `${OUT}-1-stacked.png`, fullPage: true });

// --- the canvas comes first ---------------------------------------------------------------------
// Measured against the "Slice into" label, which is the top of the controls: the canvas must start
// above it. Page coordinates, not viewport — the whole point is what you reach first when scrolling.
const order = await p.evaluate(() => {
  const img = [...document.querySelectorAll('img')]
    .map((i) => ({ i, r: i.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 150)
    .sort((a, c) => c.r.width - a.r.width)[0];
  const label = [...document.querySelectorAll('*')].find(
    (el) => el.children.length === 0 && (el.textContent || '').trim() === 'Slice into',
  );
  if (!img || !label) return null;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  return {
    canvasTop: Math.round(img.r.top + y),
    controlsTop: Math.round(label.getBoundingClientRect().top + y),
    canvasW: Math.round(img.r.width),
  };
});
console.log('order       :', JSON.stringify(order));
if (!order) {
  console.log('FAIL — could not find the canvas and the controls to compare');
  ok = false;
} else if (!(order.canvasTop < order.controlsTop)) {
  console.log(`FAIL — the controls are above the canvas (canvas ${order.canvasTop}, controls ${order.controlsTop})`);
  ok = false;
}

// --- and the framing controls are reachable ------------------------------------------------------
// Canvas-first is only half the fix: the "get art in and credit it" block used to sit between the
// canvas and the framing bar, so having loaded a picture you scrolled past the loader you had just
// used, two paragraphs of rights guidance and two credit fields to reach the zoom. It folds away
// once there IS art, so the controls should now be within about a screen of the canvas.
const gap = order ? order.controlsTop - (order.canvasTop + Math.round(order.canvasW * (88 / 63))) : null;
const reopen = await p.getByText(/Bring in other art/).count();
console.log(`controls    : ${gap}px below the canvas, source block folded=${reopen > 0}`);
if (gap != null && gap > 260) {
  console.log(`FAIL — ${gap}px of chrome between the art and the controls; the source block is not folding`);
  ok = false;
}
await p.screenshot({ path: `${OUT}-2-folded.png`, fullPage: true });

if (ok) console.log('PASS — on a phone the art comes first, the controls follow it, and the header fits');
else process.exitCode = 1;
await browser.close();

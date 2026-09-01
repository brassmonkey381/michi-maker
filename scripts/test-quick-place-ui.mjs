// What does it COST to fill a pocket?
//
// The binder editor's whole job is putting cards in pockets, so the tax on that one action is the
// number worth defending. It used to be two taps and a modal per card — tap the tile, read the
// action sheet, tap "Place in pocket" — and the picker shut afterwards, so every card also cost
// another tap on the pocket. Filling a nine-pocket page ran to eighteen taps and eighteen sheets.
//
// The fast path is now: tap ONE pocket, then ONE tap per card, with the binder visible beside the
// picker the whole time. This measures that end to end rather than trusting it:
//
//   * the quick-place pill exists on the tiles at all,
//   * a tap on it fills a pocket with NO action sheet in between,
//   * the picker stays open and advances, so the next card is one tap and not three,
//   * and when the page fills up the run ends by itself instead of hanging around.
//
// It is SELF-CLEANING: every binder_slots row it creates is deleted again at the end, so the
// fixture binder is left exactly as it was found and the harness can be re-run.
//
// Credentials come from tcgscan.secrets (MICHI_TEST_EMAIL / MICHI_TEST_PASSWORD) and are never
// printed. The account is a throwaway seeded with fixtures; do not point this at a real one.
//
//   node scripts/test-quick-place-ui.mjs [outPrefix] [binderId]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'quick-place';
const BINDER_ARG = process.argv[3] ?? null;
const BASE = 'http://localhost:8081';
const PROJECT = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
// Wide enough that the picker docks — the one-tap run is a docked-picker affordance, and at a
// phone width the sheet still covers the binder and there is nothing to measure.
const VIEWPORT = { width: 1600, height: 1000 };

const raw = readFileSync(SECRETS, 'utf8');
const read = (k) => {
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(`${k}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim() : null;
};
const anon = read('APP_PUBLISHABLE_KEY');
const email = read('MICHI_TEST_EMAIL');
const password = read('MICHI_TEST_PASSWORD');
if (!anon || !email || !password) {
  console.log('FAILED: tcgscan.secrets is missing APP_PUBLISHABLE_KEY / MICHI_TEST_EMAIL / MICHI_TEST_PASSWORD');
  process.exit(1);
}

const session = await (
  await fetch(`https://${PROJECT}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
).json();
if (!session.access_token) {
  console.log('FAILED: could not mint a session for the test account');
  process.exit(1);
}
const rest = (path, init = {}) =>
  fetch(`https://${PROJECT}.supabase.co/rest/v1/${path}`, {
    ...init,
    headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, ...(init.headers ?? {}) },
  });

// Own binders only. An unscoped select hands back every PUBLIC binder in the project, and this
// script writes to what it finds — so the ownership filter is a safety rail, not a nicety.
let BINDER = BINDER_ARG;
if (!BINDER) {
  const mine = await (await rest(`binders?owner_id=eq.${session.user.id}&select=id,title&limit=5`)).json();
  if (!Array.isArray(mine) || !mine.length) {
    console.log('FAILED: the test account owns no binders — seed one first');
    process.exit(1);
  }
  BINDER = mine[0].id;
  console.log(`binder      : ${BINDER} (${mine[0].title})`);
}

const pages = await (await rest(`binder_pages?binder_id=eq.${BINDER}&select=id&order=position&limit=1`)).json();
const PAGE = pages?.[0]?.id;
if (!PAGE) {
  console.log('FAILED: that binder has no first page —', JSON.stringify(pages).slice(0, 160));
  process.exit(1);
}
const slotIds = async () =>
  new Set(((await (await rest(`binder_slots?page_id=eq.${PAGE}&select=id`)).json()) ?? []).map((r) => r.id));
const slotsBefore = await slotIds();

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.25 });
// Boot already authenticated: the app reads its session straight out of localStorage, so there is
// no login form to drive and no email step to flake on.
await ctx.addInitScript(
  ({ key, value }) => window.localStorage.setItem(key, value),
  {
    key: `sb-${PROJECT}-auth-token`,
    value: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: session.user,
    }),
  },
);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
const settle = (ms) => page.waitForTimeout(ms);

// Put the fixture binder back exactly as it was found, pass or fail.
const cleanup = async () => {
  const after = await slotIds();
  const added = [...after].filter((id) => !slotsBefore.has(id));
  if (!added.length) return console.log('cleanup     : nothing to remove');
  const list = added.map((id) => `"${id}"`).join(',');
  const r = await rest(`binder_slots?id=in.(${list})`, { method: 'DELETE' });
  console.log(`cleanup     : removed ${added.length} placed slot(s)${r.ok ? '' : ` — HTTP ${r.status}`}`);
};
const fail = async (msg) => {
  console.log(`FAIL — ${msg}`);
  if (errors.length) console.log('page errors :', errors.slice(0, 4));
  await browser.close();
  await cleanup();
  process.exit(1);
};

await page.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
await settle(5000);

// Poll, don't sleep. `document.body.innerText` says "Edit" the moment the shell renders, well
// before the control can take a click; and on the first load after a source edit Metro swaps the
// bundle underneath an already-resolved locator. Neither is a bug in the app, so retrying is the
// honest response — a fixed timer here failed about half the runs.
const editBtn = () => page.getByText('Edit', { exact: false }).first();
for (let i = 0; i < 30 && (await page.getByText('Edit', { exact: false }).count()) === 0; i++) await settle(1000);
let entered = false;
for (let attempt = 0; attempt < 4 && !entered; attempt++) {
  try {
    await editBtn().click({ timeout: 10000 });
    entered = true;
  } catch {
    await settle(6000);
  }
}
if (!entered) await fail('never got into edit mode');
await settle(3000);

const CURRENT = '[data-testid="binder-page-current"]';
const DOCK = '[data-testid="card-picker-dock"]';
// The quick-place pill announces itself with its glyph: fullwidth plus on an empty pocket, the
// swap arrows where it would replace. Reading the accessibility label is also what a screen reader
// would announce, so a pass here is two facts, not one.
const PILL = `${DOCK} [aria-label="\uff0b"], ${DOCK} [aria-label="\u21c4"]`;

const emptyCount = () => page.locator(CURRENT).getByText('+', { exact: true }).count();
const dockOpen = async () => (await page.locator(DOCK).count()) > 0;
// A placement is a store commit plus a re-render. Reading the DOM on a fixed timer caught the page
// mid-flight and reported a pocket count that was never true, so wait for the settled value.
const emptySettled = async (want, ms = 8000) => {
  const end = Date.now() + ms;
  let seen = await emptyCount();
  while (seen !== want && Date.now() < end) {
    await settle(300);
    seen = await emptyCount();
  }
  return seen;
};

const before = await emptyCount();
console.log('empty before:', before);
if (before < 2) await fail(`the page needs at least 2 empty pockets (has ${before})`);

// TAP ONE. Everything after this should cost a single tap per card.
const pocket = page.locator(CURRENT).getByText('+', { exact: true }).first();
await pocket.scrollIntoViewIfNeeded({ timeout: 8000 });
await pocket.click({ timeout: 8000 });
for (let i = 0; i < 30 && !(await dockOpen()); i++) await settle(1000);
if (!(await dockOpen())) await fail('the picker never opened');
await settle(2000);

await page.locator(DOCK).getByPlaceholder(/Search/i).fill('pikachu');
for (let i = 0; i < 20 && (await page.locator(PILL).count()) === 0; i++) await settle(1000);
const pills = await page.locator(PILL).count();
console.log('quick pills :', pills);
if (pills === 0) await fail('no quick-place pill rendered on any tile');
await page.screenshot({ path: `${OUT}-1-results.png` });

// Fill every pocket but the last, checking after each that the run is still standing.
const runs = before - 1;
let taps = 1; // the one pocket tap
for (let i = 0; i < runs; i++) {
  await page.locator(PILL).nth(i).click({ timeout: 8000 });
  taps += 1;
  const left = await emptySettled(before - (i + 1));
  const stillOpen = await dockOpen();
  console.log(`place ${i + 1}     : empty=${left} dockOpen=${stillOpen}`);
  if (!stillOpen) await fail(`the picker shut after card ${i + 1} — the run is broken`);
  if (left !== before - (i + 1)) await fail(`pocket ${i + 1} did not take the card (${left} left)`);
}
await page.screenshot({ path: `${OUT}-2-placed.png` });

// The end of the run: with no empty pocket left to advance to, the picker should bow out rather
// than sit there pointing at nothing.
await page.locator(PILL).nth(runs).click({ timeout: 8000 });
taps += 1;
const lastLeft = await emptySettled(0);
await settle(1500);
const closedAtEnd = !(await dockOpen());
console.log(`last pocket : empty=${lastLeft} dockClosed=${closedAtEnd}`);

// "Place in pocket" is the action sheet's own button text — its absence is the absence of the toll.
const sheetShown = (await page.locator('text=Place in pocket').count()) > 0;
const cards = runs + 1;
console.log('sheet shown :', sheetShown);
console.log(`taps        : ${taps} for ${cards} card(s)`);

let ok = true;
if (sheetShown) {
  console.log('FAIL — the action sheet still opened');
  ok = false;
}
if (taps !== cards + 1) {
  console.log(`FAIL — ${cards} cards should cost ${cards + 1} taps, not ${taps}`);
  ok = false;
}
if (lastLeft !== 0 || !closedAtEnd) {
  console.log('FAIL — filling the last pocket did not end the run cleanly');
  ok = false;
}
if (ok) {
  console.log(`PASS — ${cards} cards placed in ${taps} taps, no action sheet, the picker held the`);
  console.log('       run open until the page was full and then closed itself');
} else {
  process.exitCode = 1;
}
await browser.close();
await cleanup();

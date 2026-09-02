// Can you still touch the page you are editing?
//
// This exists because the answer was once no, and nothing said so. The page-turn animation draws
// throwaway copies of the pages it sweeps, and those copies must be inert — a live duplicate steals
// the refs and drop targets the editor is holding. The flag that makes them inert (`decorative`)
// also renders the grid `editable={false}`, with no onSlotPress and no onCellPress. Set on the
// wrong render — the LIVE page rather than the overlay's copy — the editor still draws perfectly,
// animates perfectly, and quietly accepts no clicks at all. Type-checks, lints, renders, dead.
//
// So this drives the two interactions the binder editor exists for and insists on evidence:
//
//   * tapping a FILLED pocket selects it — the slot toolbar (Replace / Duplicate / Remove) appears
//     and the pocket takes its selection outline,
//   * tapping an EMPTY pocket opens the card picker.
//
// It reads only: it selects and it opens, it never places or removes anything.
//
// Credentials come from tcgscan.secrets (MICHI_TEST_EMAIL / MICHI_TEST_PASSWORD) and are never
// printed.
//
//   node scripts/test-slot-select-ui.mjs [outPrefix] [binderId]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'slot-select';
const BINDER_ARG = process.argv[3] ?? null;
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

let BINDER = BINDER_ARG;
if (!BINDER) {
  // Own binders only — an unscoped select hands back every public binder in the project.
  const mine = await (
    await fetch(`https://${PROJECT}.supabase.co/rest/v1/binders?owner_id=eq.${session.user.id}&select=id,title&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` },
    })
  ).json();
  if (!Array.isArray(mine) || !mine.length) {
    console.log('FAILED: the test account owns no binders — seed one first');
    process.exit(1);
  }
  BINDER = mine[0].id;
  console.log(`binder      : ${BINDER} (${mine[0].title})`);
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
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
p.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
const settle = (ms) => p.waitForTimeout(ms);
const fail = async (msg) => {
  console.log(`FAIL — ${msg}`);
  if (errors.length) console.log('page errors :', errors.slice(0, 4));
  await p.screenshot({ path: `${OUT}-fail.png` });
  await browser.close();
  process.exit(1);
};

await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
await settle(5000);
// Poll, don't sleep: the shell prints "Edit" well before the control can take a click, and on the
// first load after a source edit Metro swaps the bundle underneath a resolved locator.
for (let i = 0; i < 30 && (await p.getByText('Edit', { exact: false }).count()) === 0; i++) await settle(1000);
let entered = false;
for (let a = 0; a < 4 && !entered; a++) {
  try { await p.getByText('Edit', { exact: false }).first().click({ timeout: 10000 }); entered = true; }
  catch { await settle(6000); }
}
if (!entered) await fail('never got into edit mode');
await settle(3000);

const CURRENT = '[data-testid="binder-page-current"]';
const toolbar = async () => {
  const out = {};
  for (const label of ['Replace', 'Duplicate', 'Remove']) {
    out[label] = await p.getByText(label, { exact: true }).count();
  }
  return out;
};
// The selection outline is a 2px solid border, which nothing else on a pocket draws.
const outlined = () =>
  p.evaluate((sel) => {
    const grid = document.querySelector(sel);
    if (!grid) return -1;
    return [...grid.querySelectorAll('div')].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.borderTopWidth === '2px' && cs.borderTopStyle === 'solid';
    }).length;
  }, CURRENT);

// --- a filled pocket selects ------------------------------------------------------------------
const card = await p.evaluate((sel) => {
  const grid = document.querySelector(sel);
  const img = grid ? grid.querySelector('img') : null;
  if (!img) return null;
  const r = img.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
}, CURRENT);
if (!card) await fail('no filled pocket on the current page to select');

const before = await toolbar();
console.log('before      :', JSON.stringify(before), 'outlined=', await outlined());
await p.mouse.click(card.x, card.y);
await settle(2000);
const after = await toolbar();
const outlines = await outlined();
console.log('after click :', JSON.stringify(after), 'outlined=', outlines);
await p.screenshot({ path: `${OUT}-1-selected.png` });

let ok = true;
if (!(after.Replace > 0 && after.Remove > 0)) {
  console.log('FAIL — tapping a filled pocket raised no slot toolbar');
  ok = false;
}
if (!(outlines > 0)) {
  console.log('FAIL — tapping a filled pocket drew no selection outline');
  ok = false;
}

// --- an empty pocket opens the picker ----------------------------------------------------------
const plus = p.locator(CURRENT).getByText('+', { exact: true }).first();
if ((await plus.count()) === 0) {
  console.log('FAIL — the page is full, so the empty-pocket half could not run; free a pocket');
  ok = false;
} else {
  await plus.scrollIntoViewIfNeeded({ timeout: 8000 });
  await plus.click({ timeout: 8000 });
  for (let i = 0; i < 20 && !(await p.locator('[data-testid="card-picker-dock"]').count()); i++) await settle(1000);
  const opened = (await p.locator('[data-testid="card-picker-dock"]').count()) > 0;
  console.log('empty pocket:', opened ? 'opens the picker' : 'DOES NOTHING');
  if (!opened) {
    console.log('FAIL — tapping an empty pocket opened nothing');
    ok = false;
  }
}

// --- and still takes clicks AFTER a page turn ---------------------------------------------------
// The turn is what put the decorative copies on screen in the first place, so "works on load" is
// only half an answer: the interesting question is whether the live page survives one.
const nextLabel = p.getByText(/^Page 2/).first();
if ((await nextLabel.count()) > 0) {
  await nextLabel.click({ timeout: 8000 }).catch(() => {});
  await settle(2500);
  const card2 = await p.evaluate((sel) => {
    const grid = document.querySelector(sel);
    const img = grid ? grid.querySelector('img') : null;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, CURRENT);
  if (!card2) {
    console.log('FAIL — no filled pocket on the page after turning');
    ok = false;
  } else {
    await p.mouse.click(card2.x, card2.y);
    await settle(2000);
    const afterTurn = await toolbar();
    console.log('after turn  :', JSON.stringify(afterTurn));
    if (!(afterTurn.Replace > 0)) {
      console.log('FAIL — the page stopped taking clicks once it had been turned to');
      ok = false;
    }
  }
} else {
  console.log('note        : single-page binder, the after-a-turn half did not run');
}

if (ok) console.log('PASS — the live page takes clicks, before and after a turn');
else process.exitCode = 1;
await browser.close();

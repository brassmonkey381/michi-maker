// Can you select more than one pocket without a keyboard?
//
// Selecting several pockets was Ctrl/Cmd-click, and ACTING on them was releasing the modifier.
// Neither is advertised anywhere, and on touch there is no modifier at all — so in an editor meant
// to work under a thumb, the whole bulk-action path was unreachable, and on the web it was
// unreachable unless you already knew.
//
// This drives the visible door only: tap "⊕ Select", tap two pockets, and check the count follows
// and the actions open. It never presses a modifier key, because a test that quietly used the old
// path would pass on a build where the new one does nothing.
//
// It only selects and opens a sheet; it dismisses without acting, so nothing is written.
//
//   node scripts/test-select-mode-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'select-mode';
const BASE = 'http://localhost:8081';
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1 });
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

const CURRENT = '[data-testid="binder-page-current"]';
const cards = await p.evaluate((sel) => {
  const grid = document.querySelector(sel);
  if (!grid) return [];
  return [...grid.querySelectorAll('img')].slice(0, 2).map((img) => {
    const r = img.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
}, CURRENT);
if (cards.length < 2) await fail('need two filled pockets on the current page');

const chip = () => p.getByText(/^(⊕ Select|✓ Selecting)/).first();
if ((await chip().count()) === 0) await fail('no Select toggle in the edit tools row');
console.log('toggle      :', (await chip().innerText()).trim());

await chip().click({ timeout: 8000 });
await settle(800);
console.log('turned on   :', (await chip().innerText()).trim());

// Two plain taps. No modifier — that is the entire point.
for (const c of cards) {
  await p.mouse.click(c.x, c.y);
  await settle(700);
}
const label = (await chip().innerText()).trim();
const actions = p.getByText(/^Actions · \d+$/).first();
const actionsText = (await actions.count()) ? (await actions.innerText()).trim() : null;
console.log('after 2 taps:', label, '|', actionsText);
await p.screenshot({ path: `${OUT}-1-selected.png` });

let ok = true;
if (!/^✓ Selecting/.test(label)) {
  console.log('FAIL — the toggle did not switch on');
  ok = false;
}
if (!/·\s*2$/.test(label)) {
  console.log(`FAIL — two taps did not build a selection of two ("${label}")`);
  ok = false;
}
if (actionsText !== 'Actions · 2') {
  console.log(`FAIL — no Actions control for the selection (got ${actionsText})`);
  ok = false;
}

// And it opens the thing the modifier-release used to open.
if (actionsText) {
  await actions.click({ timeout: 8000 });
  await settle(1500);
  const opened = await p.evaluate(() => /selected/i.test(document.body.innerText));
  console.log('actions open:', opened);
  if (!opened) {
    console.log('FAIL — the Actions control opened nothing');
    ok = false;
  }
  await p.keyboard.press('Escape');
  await settle(600);
}

if (ok) console.log('PASS — several pockets can be selected and acted on with no keyboard at all');
else process.exitCode = 1;
await browser.close();

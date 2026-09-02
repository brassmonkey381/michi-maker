// Does a description stay out of the way until you ask for it?
//
// It used to sit under the binder title as a permanent line of centred grey text: height spent on
// every visit to answer a question most visits are not asking. It lives behind the title now, and
// the page's does too — the same tap that edits both while editing.
//
// So this checks the three things that could each be true on their own and still add up to the
// wrong feature: the text is NOT on the page while reading, tapping the title DOES bring it up,
// and tapping the title while EDITING brings up the fields instead of the card.
//
// SELF-CLEANING: the binder's description is written for the run and put back exactly as found.
// Credentials come from tcgscan.secrets and are never printed.
//
//   node scripts/test-about-popup-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'about-popup';
const BASE = process.env.MICHI_BASE ?? 'http://localhost:8081';
const PROJECT = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
// Distinctive enough that finding it on the page is proof, not a coincidence.
const DESC = 'A quiet shelf of holos kept for the art alone.';
const PAGE_DESC = 'Nine Eeveelutions, one per pocket, in evolution order.';

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
const rest = (path, init = {}) =>
  fetch(`https://${PROJECT}.supabase.co/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const mine = await (
  await rest(`binders?owner_id=eq.${session.user.id}&select=id,description&limit=1`)
).json();
if (!Array.isArray(mine) || !mine.length) {
  console.log('FAILED: the test account owns no binders — seed one first');
  process.exit(1);
}
const BINDER = mine[0].id;
const descBefore = mine[0].description ?? null;
const setDesc = async (value) => {
  const r = await rest(`binders?id=eq.${BINDER}`, {
    method: 'PATCH',
    body: JSON.stringify({ description: value }),
  });
  if (!r.ok) {
    console.log(`FAILED: could not set the binder description — HTTP ${r.status}`);
    process.exit(1);
  }
};
// The page's own description (binder_pages.notes) — same story, one level down.
const pages = await (
  await rest(`binder_pages?binder_id=eq.${BINDER}&select=id,notes&order=position.asc&limit=1`)
).json();
if (!Array.isArray(pages) || !pages.length) {
  console.log('FAILED: that binder has no pages');
  process.exit(1);
}
const PAGE = pages[0].id;
const pageNotesBefore = pages[0].notes ?? null;
const setPageDesc = async (value) => {
  const r = await rest(`binder_pages?id=eq.${PAGE}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes: value }),
  });
  if (!r.ok) {
    console.log(`FAILED: could not set the page description — HTTP ${r.status}`);
    process.exit(1);
  }
};

const restore = async () => {
  await setDesc(descBefore);
  await setPageDesc(pageNotesBefore);
  console.log('cleanup     : binder and page descriptions restored');
};
await setDesc(DESC);
await setPageDesc(PAGE_DESC);

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
// A crash mid-run must not leave the account's binder holding this script's prose.
process.on('uncaughtException', async (e) => {
  console.log(`FAILED: ${e?.message ?? e}`);
  await restore().catch(() => {});
  process.exit(1);
});
const p = await ctx.newPage();
const settle = (ms) => p.waitForTimeout(ms);
let ok = true;
const check = (pass, msg) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!pass) ok = false;
};

await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
await settle(4000);

// 1. READING: the description is nowhere on the page.
const bodyHas = async () => (await p.locator('body').innerText()).includes(DESC);
check(!(await bodyHas()), 'the description is not printed on the page while reading');
await p.screenshot({ path: `${OUT}-1-clean.png` });

// 2. READING: tapping the title brings it up, as the card and not as a form.
await p.getByTestId('binder-title').click({ timeout: 8000 });
await settle(900);
check(await bodyHas(), 'tapping the binder title brings the description up');
check(
  (await p.getByText('Binder details').count()) === 0,
  'the reading card is not the edit form (no "Binder details" heading)',
);
await p.screenshot({ path: `${OUT}-2-popup.png` });

// Dismiss via the card's own ✕ — the only control it has, and the one a touch user needs.
await p.getByLabel('Close').last().click({ timeout: 8000 });
await settle(700);
check(!(await bodyHas()), 'the card closes');

// 3. EDITING: the same tap opens the fields instead.
await p.getByText(/^Edit$/).first().click({ timeout: 8000 });
await settle(1500);
await p.getByTestId('binder-title').click({ timeout: 8000 });
await settle(900);
check(
  (await p.getByText('Binder details').count()) > 0,
  'tapping the title while editing opens the title and description fields',
);
await p.screenshot({ path: `${OUT}-3-editing.png` });

// 4. The PAGE title, which is the genuinely new wiring: its label was not pressable at all
// while reading before this, so a dead tap here would look exactly like a working one.
// The dialog's own Done, by testID: a text match for /^Done$/ finds the header's mode toggle
// first, which the modal's full-screen backdrop is sitting on top of.
await p.getByTestId('binder-info-done').click({ timeout: 8000 });
await settle(1200);
await p.getByText(/^Done$/).first().click({ timeout: 8000 }); // leave edit mode
await settle(2500);
const pageBodyHas = async () => (await p.locator('body').innerText()).includes(PAGE_DESC);
check(!(await pageBodyHas()), 'the page description is not printed on the page while reading');
await p.getByTestId('binder-page-title').first().click({ timeout: 8000 });
await settle(900);
check(await pageBodyHas(), 'tapping the page title brings the page description up');
check(
  (await p.getByText('Page description').count()) === 0,
  'the reading card is not the page form (no "Page description" field)',
);
await p.screenshot({ path: `${OUT}-4-page.png` });

await browser.close();
await restore();
console.log(ok ? '\nPASS — the description hides until asked for, and edits where it always did' : '\nFAILED');
process.exit(ok ? 0 : 1);

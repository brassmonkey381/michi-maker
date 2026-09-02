// THE THREE ROWS ARE GONE, and everything they held is still reachable.
//
// Edit mode used to open with a chip row, a page-title row and a view-chip row stacked above the
// binder — all three inside the measured block, so all three took height off the pages. This
// checks the replacements exist and work, and that the page is where it should be:
//
//   1. The binder's title is a button; it opens the binder's details.
//   2. The page's title IS the column label above the page, and it opens the page's details.
//   3. The editing tools are icons in the header, and each one is named.
//   4. The gear opens the view settings, and page size + background are inside it.
//   5. Nothing above the page — the binder starts within a header's height of the top.
//
// Requires the web dev server running and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'chrome-tuck';
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
const BINDER = mine[0].id;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript({
  content: `window.localStorage.setItem('sb-${PROJECT}-auth-token', ${JSON.stringify(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: session.user,
    }),
  )});`,
});
const p = await ctx.newPage();
const settle = (ms) => p.waitForTimeout(ms);
const fail = async (msg) => {
  console.log(`FAIL — ${msg}`);
  await p.screenshot({ path: `${OUT}-fail.png`, animations: 'disabled', timeout: 60000 }).catch(() => {});
  await browser.close();
  process.exit(1);
};

await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
await settle(4000);
for (let i = 0; i < 30 && !(await p.locator('[data-testid="binder-page-current"]').count()); i++) await settle(1000);

// Into edit mode, where all three rows used to be.
await p.getByText('Edit', { exact: true }).first().click({ timeout: 8000 });
for (let i = 0; i < 25 && !(await p.locator('[data-testid="tool-undo"]').count()); i++) await settle(800);
await settle(2000);
await p.screenshot({ path: `${OUT}-1-edit.png`, animations: 'disabled', timeout: 60000 }).catch(() => {});

let ok = true;
const box = async (sel) =>
  p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

// 1. THE TOOLS ARE ICONS, AND EACH ONE IS NAMED. A glyph with no accessible name is a puzzle.
const TOOLS = ['tool-undo', 'tool-redo', 'tool-add-page', 'tool-duplicate', 'binder-select-toggle'];
const named = [];
for (const t of TOOLS) {
  const el = p.locator(`[data-testid="${t}"]`).first();
  if ((await el.count()) === 0) {
    console.log(`FAIL — no ${t} in the header`);
    ok = false;
    continue;
  }
  const label = await el.getAttribute('aria-label');
  const b = await box(`[data-testid="${t}"]`);
  named.push(`${t}=${JSON.stringify(label)} ${b.w}x${b.h}`);
  if (!label) {
    console.log(`FAIL — ${t} is a symbol with no accessible name`);
    ok = false;
  }
  if (b.w > 44 || b.h > 44) {
    console.log(`FAIL — ${t} is ${b.w}x${b.h}, not a small icon button`);
    ok = false;
  }
}
console.log('tools       :', named.join('  '));

// 2. NOTHING ABOVE THE PAGE BUT THE HEADER. The three rows were roughly 120px of chrome.
const page = await box('[data-testid="binder-page-current"]');
console.log('page box    :', JSON.stringify(page));
if (!page) await fail('no current page on screen');
if (page.y > 110) {
  console.log(`FAIL — the page starts at y=${page.y}; the chrome above it is back`);
  ok = false;
}

// 3. THE BINDER'S TITLE OPENS THE BINDER'S DETAILS.
await p.locator('[data-testid="binder-title"]').first().click({ timeout: 8000 });
await settle(1200);
let text = await p.evaluate(() => document.body.innerText);
const binderDialog = /Binder details/.test(text) && /BINDER DESCRIPTION/i.test(text);
console.log('title opens :', binderDialog);
if (!binderDialog) {
  console.log('FAIL — tapping the binder title did not open its details');
  ok = false;
}
await p.locator('[data-testid="binder-info-done"]').first().click({ timeout: 8000 });
await settle(1000);

// 4. THE PAGE'S TITLE IS ABOVE THE PAGE, AND IT OPENS THE PAGE'S DETAILS.
const pageTitle = p.locator('[data-testid="binder-page-title"]').first();
if ((await pageTitle.count()) === 0) {
  console.log('FAIL — the page has no title above it');
  ok = false;
} else {
  const tb = await box('[data-testid="binder-page-title"]');
  console.log('page title  :', JSON.stringify(await pageTitle.innerText()), JSON.stringify(tb));
  if (tb.y > page.y) {
    console.log('FAIL — the page title is not above its page');
    ok = false;
  }
  await pageTitle.click({ timeout: 8000 });
  await settle(1200);
  text = await p.evaluate(() => document.body.innerText);
  const pageDialog = /PAGE DESCRIPTION/i.test(text);
  console.log('page opens  :', pageDialog);
  if (!pageDialog) {
    console.log("FAIL — tapping the page title did not open the page's details");
    ok = false;
  }
  await p.locator('[data-testid="page-info-done"]').first().click({ timeout: 8000 });
  await settle(1000);
}

// 5. THE GEAR HOLDS THE VIEW CHIPS AND THE BINDER-WIDE LOOK.
await p.locator('[data-testid="binder-settings-btn"]').first().click({ timeout: 8000 });
await settle(1200);
text = await p.evaluate(() => document.body.innerText);
const inGear = ['Double-sided', 'Page size', 'Background'].filter((w) => text.includes(w));
console.log('gear holds  :', inGear.join(', '));
await p.screenshot({ path: `${OUT}-2-settings.png`, animations: 'disabled', timeout: 60000 }).catch(() => {});
if (inGear.length < 3) {
  console.log(`FAIL — the settings dialog is missing ${['Double-sided', 'Page size', 'Background'].filter((w) => !inGear.includes(w)).join(', ')}`);
  ok = false;
}
await p.getByText('Done', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
await settle(1000);

// 6. THE PAGE DID NOT MOVE while any of that opened and closed.
const after = await box('[data-testid="binder-page-current"]');
console.log('page after  :', JSON.stringify(after));
if (after.y !== page.y || after.h !== page.h) {
  console.log(`FAIL — the page moved: y ${page.y}->${after.y}, h ${page.h}->${after.h}`);
  ok = false;
}

console.log(
  ok
    ? 'PASS — the three rows are gone, everything they held is one tap away, and the page never moved'
    : 'FAIL',
);
await browser.close();
process.exit(ok ? 0 : 1);

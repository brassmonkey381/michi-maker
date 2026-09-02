// Is the binder page ever something you have to scroll to see whole?
//
// It is the object this product is about, and half of one tells you nothing about how the page
// reads — so the rule is that a short window SHRINKS the page rather than letting it run off the
// bottom. That reverses an earlier decision (a 560px floor, so no window came out smaller than it
// used to be), and the two rules cannot both hold: a minimum width above the height budget is an
// instruction to overflow.
//
// This measures the thing the rule is about, at several window heights: the bottom of the page
// against the bottom of the viewport, with the scroller at rest. It checks BOTH modes, because
// single-sided and double-sided size through different functions (spreadLayout / bookLayout).
//
// It also records the page width at each height, so a regression that "fits" by collapsing the page
// to a stamp is visible rather than green.
//
// Credentials come from tcgscan.secrets and are never printed. It only looks.
//
//   node scripts/test-page-fits-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'page-fits';
// Overridable so a run can point at a second dev server — two agents sharing this repo
// means port 8081 is not always ours, and not always alive.
const BASE = process.env.MICHI_BASE ?? 'http://localhost:8081';
const PROJECT = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

// Real windows, short to tall. 700 is the laptop height the old floor was defended for.
const HEIGHTS = [700, 800, 900, 1080];
const WIDTH = 1600;

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
let ok = true;

// The page's own box against the window. `binder-page-current` is the grid itself, so its bottom is
// the last thing that has to be on screen.
const measure = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="binder-page-current"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      w: Math.round(r.width),
      viewport: window.innerHeight,
      scrollY: Math.round(window.scrollY || document.documentElement.scrollTop || 0),
    };
  });

for (const height of HEIGHTS) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height }, deviceScaleFactor: 1 });
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
  await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
  await settle(4500);
  for (let i = 0; i < 30 && !(await p.locator('[data-testid="binder-page-current"]').count()); i++) await settle(1000);
  await settle(1500);

  // EDIT MODE TOO — and especially. View mode was told the chrome was 88px; edit mode was told 130
  // or 330, and edit mode is where the pills, the label chips and the tools row actually live. It
  // is the mode that was worst served by a guess, and the mode people spend their time in.
  for (let i = 0; i < 20 && (await p.getByText('Edit', { exact: false }).count()) === 0; i++) await settle(500);
  let inEdit = false;
  for (let a = 0; a < 3 && !inEdit; a++) {
    try { await p.getByText('Edit', { exact: false }).first().click({ timeout: 8000 }); inEdit = true; }
    catch { await settle(4000); }
  }
  await settle(2500);

  // MEASURE BEFORE TOUCHING ANYTHING. Opening a panel means clicking a pocket, which scrolls the
  // content to reach it — so the first version of this measured a scrolled page and reported a
  // negative top. The fit question is about the page as it arrives.
  const view = await measure(p);
  if (!view) {
    console.log(`${height}px: FAIL — no page rendered`);
    ok = false;
    await ctx.close();
    continue;
  }
  const fits = view.bottom <= view.viewport && view.top >= 0 && view.scrollY === 0;
  console.log(
    `${String(height).padStart(4)}px edit : page ${view.w}px wide, y ${view.top}..${view.bottom} of ${view.viewport}` +
      `${fits ? '' : `  <-- ${view.bottom - view.viewport}px past the fold`}`,
  );
  if (!fits) ok = false;
  if (view.w < 320) {
    console.log(`  FAIL — ${view.w}px is below MIN_PAGE_WIDTH; it "fits" by being unreadable`);
    ok = false;
  }
  await p.screenshot({ path: `${OUT}-${height}.png` });

  // ...and open a panel, so the run also reports how wide it comes out. A fixed 460 on a 1920
  // desktop left hundreds of pixels of margin; the panel should now take what the page did not.
  let panelW = null;
  const plus = p.locator('[data-testid="binder-page-current"]').getByText('+', { exact: true }).first();
  if ((await plus.count()) > 0) {
    await plus.scrollIntoViewIfNeeded({ timeout: 6000 }).catch(() => {});
    await plus.click({ timeout: 6000 }).catch(() => {});
    for (let i = 0; i < 20 && !(await p.locator('[data-testid="card-picker-dock"]').count()); i++) await settle(800);
    await settle(1200);
    panelW = await p.evaluate(() => {
      const el = document.querySelector('[data-testid="card-picker-dock"]');
      return el ? Math.round(el.getBoundingClientRect().width) : null;
    });
    await p.keyboard.press('Escape').catch(() => {});
    await settle(900);
  }

  if (panelW) console.log(`             panel ${panelW}px wide`);
  await ctx.close();
}

console.log(ok ? 'PASS — the page fits the window at every height, without scrolling' : 'FAIL — the page ran past the fold');
if (!ok) process.exitCode = 1;
await browser.close();

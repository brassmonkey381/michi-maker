// Two panels, one binder, one pocket.
//
// Cards on the right, cut artwork on the left, both open at once with the binder live between
// them. Three things have to hold:
//
//   * BOTH DOCK on a wide window, and the binder stays visible and clickable between them — a
//     panel that covers the page defeats the point of putting it beside the page;
//   * the panels are ELASTIC, so a 1920 desktop does not leave hundreds of pixels of margin while
//     a card grid scrolls in a column too narrow for it;
//   * the ACTIVE POCKET is unmistakable. With two panels feeding one pocket and both staying open
//     across placements, "which one am I filling?" is a question the page has to answer at a
//     glance — it used to have no answer at all for an empty pocket.
//
// It only opens panels and taps a pocket. Nothing is placed and nothing is saved.
//
//   node scripts/test-two-docks-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'two-docks';
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
// 1920 is the case that prompted elastic panels: a height-fitted page leaves over a thousand
// pixels doing nothing.
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
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

const box = (sel) =>
  p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right) };
  }, sel);

let ok = true;

// LEFT: the artwork panel.
// The artwork side is always mounted while editing: a rail when closed, a panel when open.
const artToggle = p.locator('[data-testid="artwork-rail"]').first();
if ((await artToggle.count()) === 0) await fail('no artwork rail beside the binder');
await artToggle.click({ timeout: 8000 });
for (let i = 0; i < 20 && !(await p.locator('[data-testid="artwork-dock"]').count()); i++) await settle(800);
await settle(1200);

// RIGHT: the card picker, opened by tapping a pocket — which also sets the active pocket.
const plus = p.locator('[data-testid="binder-page-current"]').getByText('+', { exact: true }).first();
if ((await plus.count()) === 0) await fail('no empty pocket to open the picker from');
await plus.scrollIntoViewIfNeeded({ timeout: 8000 });
await plus.click({ timeout: 8000 });
for (let i = 0; i < 20 && !(await p.locator('[data-testid="card-picker-dock"]').count()); i++) await settle(800);
await settle(1500);
await p.screenshot({ path: `${OUT}-1-both.png` });

const left = await box('[data-testid="artwork-dock"]');
const right = await box('[data-testid="card-picker-dock"]');
const page = await box('[data-testid="binder-page-current"]');
console.log('left panel  :', JSON.stringify(left));
console.log('right panel :', JSON.stringify(right));
console.log('binder page :', JSON.stringify(page));

if (!left) { console.log('FAIL — the artwork panel did not dock'); ok = false; }
if (!right) { console.log('FAIL — the card picker did not dock'); ok = false; }
if (left && right && page) {
  // Beside, not over: the page has to sit between them, touching neither.
  if (!(page.x >= left.right)) { console.log(`FAIL — the page (${page.x}) overlaps the left panel (ends ${left.right})`); ok = false; }
  if (!(page.right <= right.x)) { console.log(`FAIL — the page (ends ${page.right}) overlaps the right panel (${right.x})`); ok = false; }
  if (!(page.w > 200)) { console.log(`FAIL — the binder was squeezed to ${page.w}px`); ok = false; }
  // Elastic: the old fixed width was 460, and 1920 has room for more than that.
  if (!(left.w > 460 && right.w > 460)) {
    console.log(`FAIL — panels did not grow into the space (${left.w}, ${right.w}; the old fixed width was 460)`);
    ok = false;
  }
}

// THE ACTIVE POCKET. By testID rather than by reading borders back out of CSS: the first version
// of this check inferred the mark from computed border widths, reported absent, and was wrong —
// the mark was on screen in the same run's screenshot. A named element cannot be wrong that way.
const marked = await p.locator('[data-testid="binder-active-pocket"]').count();
console.log('active mark :', marked);
if (marked !== 1) {
  console.log(`FAIL — expected exactly one marked pocket, found ${marked}`);
  ok = false;
}

console.log(ok ? 'PASS — two panels beside a live binder, elastic, with the target pocket marked' : 'FAIL');
if (!ok) process.exitCode = 1;
await browser.close();

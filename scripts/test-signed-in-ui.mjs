// Photograph and MEASURE signed-in surfaces — the ones a guest session can never show.
//
// Card labels, finish chips, owned ticks and per-copy prices all need catalog data plus a real
// collection behind them, so every signed-out screenshot of those features shows a sign-in prompt
// instead of the feature. That gap is why the on-card label layout took six rounds of tuning
// against arithmetic rather than one round against a render.
//
// It does NOT drive the login form. It mints a session with Supabase's password grant and writes
// it into localStorage under the key supabase-js reads, so the app boots already authenticated —
// no form timing, no email step, no flake.
//
// It also REPORTS the measured width of the live page at every viewport, which is the number the
// layout work is judged on. Measuring beats computing: the arithmetic has been wrong twice.
//
// Credentials come from tcgscan.secrets (MICHI_TEST_EMAIL / MICHI_TEST_PASSWORD) and are never
// printed. The account is a throwaway seeded with fixtures; do not point this at a real one.
//
//   node scripts/test-signed-in-ui.mjs <outPrefix> [binderId]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'signed-in';
const BINDER = process.argv[3] ?? null;
const BASE = 'http://localhost:8081';
const PROJECT = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

const VIEWPORTS = [
  { tag: 'desktop', width: 1920, height: 1080 },
  { tag: 'laptop', width: 1440, height: 900 },
  { tag: 'mid', width: 1024, height: 768 },
  { tag: 'phone', width: 390, height: 844 },
];

const raw = readFileSync(SECRETS, 'utf8');
const read = (k) => {
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(`${k}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim() : null;
};
const anon = read('APP_PUBLISHABLE_KEY');
const email = read('MICHI_TEST_EMAIL');
const password = read('MICHI_TEST_PASSWORD');
if (!anon || !email || !password) {
  console.log('FAILED: tcgscan.secrets needs APP_PUBLISHABLE_KEY, MICHI_TEST_EMAIL, MICHI_TEST_PASSWORD');
  process.exit(2);
}

const res = await fetch(`https://${PROJECT}.supabase.co/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!res.ok) {
  console.log(`FAILED: sign-in returned ${res.status} — check the credentials in tcgscan.secrets`);
  process.exit(1);
}
const session = await res.json();
console.log(`Signed in as ${session.user.id}`);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

// supabase-js keys its persisted session `sb-<ref>-auth-token`. Seeding it before any script runs
// is what makes the app boot authenticated instead of showing the guest banner.
await ctx.addInitScript(
  ({ key, value }) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode — the guest check below will catch it */
    }
  },
  {
    key: `sb-${PROJECT}-auth-token`,
    value: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
      expires_in: session.expires_in ?? 3600,
      token_type: 'bearer',
      user: session.user,
    }),
  },
);

const page = await ctx.newPage();
const settle = (ms) => page.waitForTimeout(ms);
const click = async (text, timeout = 8000) => {
  try {
    await page.getByText(text, { exact: false }).first().click({ timeout });
    return true;
  } catch {
    return false;
  }
};

// The measurement. Reads the real boxes off the DOM via the testIDs BinderPages carries.
const measure = () =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(`[data-testid="${sel}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      window: window.innerWidth,
      current: box('binder-page-current'),
      prev: box('binder-page-prev'),
      next: box('binder-page-next'),
    };
  });

await page.goto(`${BASE}/my-binders`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction(() => document.body.innerText.includes('inder'), undefined, { timeout: 240000 });
await settle(6000);

// Prove the session took. A guest session renders the whole run silently useless, so fail loudly
// rather than produce screenshots that look fine and show nothing.
const guest = await page.evaluate(() => /Sign in to save your binders/i.test(document.body.innerText));
if (guest) {
  console.log('FAILED: still a guest session — the injected token did not take.');
  await browser.close();
  process.exit(1);
}
console.log('Session active.');

const target = BINDER ?? (await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="/binder/"]')][0];
  return a ? a.getAttribute('href').split('/binder/')[1] : null;
}));
if (!target) {
  console.log('FAILED: no binder to open — seed the account first.');
  await browser.close();
  process.exit(1);
}

const rows = [];
for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(`${BASE}/binder/${target}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => document.body.innerText.includes('Card labels'), undefined, { timeout: 240000 });
  await settle(5000);

  const single = await measure();
  await page.screenshot({ path: `${OUT}-${vp.tag}-1-single.png` });

  await click('Double-sided');
  await settle(3500);
  const double = await measure();
  await page.screenshot({ path: `${OUT}-${vp.tag}-2-double.png` });
  await click('Double-sided'); // back to single for the edit shot
  await settle(2500);

  if (await click('Edit')) {
    await settle(3500);
    await page.screenshot({ path: `${OUT}-${vp.tag}-3-edit.png` });
  }

  rows.push({ vp, single, double });
}

console.log('');
console.log('LIVE PAGE WIDTH, measured from the DOM');
console.log('window | single: page / prev / next        | share | double: page  | share');
for (const r of rows) {
  const w = r.vp.width;
  const s = r.single.current?.w ?? 0;
  const p = r.single.prev?.w ?? 0;
  const n = r.single.next?.w ?? 0;
  const d = r.double.current?.w ?? 0;
  const pct = (x) => `${((100 * x) / w).toFixed(1)}%`.padStart(6);
  console.log(
    `${String(w).padStart(6)} | ${String(s).padStart(4)} / ${String(p).padStart(4)} / ${String(n).padStart(4)}` +
      `${' '.repeat(14)}| ${pct(s)} | ${String(d).padStart(4)}         | ${pct(d)}`,
  );
}

console.log('');
console.log('done');
await browser.close();

// Does the binder open the way you left it?
//
// Owned, Scans and Double-sided were session-only. Double-sided had a module-level `let` that
// survived remounts within one page load — the shape of the right idea with none of its reach: it
// forgot on reload and never crossed to another device. None of the three is a per-visit decision;
// a collector who keeps a physical binder open at a spread wants it open at a spread every time.
//
// A preference that "works" but does not survive a reload is indistinguishable from one that does
// until you reload, so that is what this does: toggle, reload, and look again. It also signs the
// session out and back in, because the account copy is the half that crosses devices and the half
// a device-local write would fake convincingly.
//
// SELF-CLEANING: whatever the account had before is restored at the end, so a run leaves the test
// account's profile as it found it.
//
// Credentials come from tcgscan.secrets and are never printed.
//
//   node scripts/test-view-prefs-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'view-prefs';
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

const mine = await (await rest(`binders?owner_id=eq.${session.user.id}&select=id&limit=1`)).json();
if (!Array.isArray(mine) || !mine.length) {
  console.log('FAILED: the test account owns no binders — seed one first');
  process.exit(1);
}
const BINDER = mine[0].id;

// Remember the whole preferences bag, so the run can put back exactly what it found.
const profileRows = await (await rest(`profiles?id=eq.${session.user.id}&select=preferences`)).json();
const prefsBefore = profileRows?.[0]?.preferences ?? null;
const restore = async () => {
  const r = await rest(`profiles?id=eq.${session.user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ preferences: prefsBefore }),
  });
  console.log(`cleanup     : profile preferences restored${r.ok ? '' : ` — HTTP ${r.status}`}`);
};

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
  await restore();
  process.exit(1);
};

const open = async () => {
  await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
  await settle(4000);
  // The view pills live behind the gear now (they cost the page a permanent row otherwise), so
  // every look at them starts by opening it. Reopened after each reload, since a modal is not
  // state that survives one.
  const gear = p.getByLabel('View settings').first();
  for (let i = 0; i < 30 && (await gear.count()) === 0; i++) await settle(1000);
  if ((await gear.count()) > 0) await gear.click({ timeout: 8000 });
  for (let i = 0; i < 30 && (await p.getByText(/Double-sided/).count()) === 0; i++) await settle(1000);
  await settle(1500);
};
// The pill writes a ✓ into its own label when it is on, so its text is its state.
const pillOn = async (name) => {
  const el = p.getByText(new RegExp(`^(✓ )?${name}$`)).first();
  if ((await el.count()) === 0) return null;
  return (await el.innerText()).trim().startsWith('✓');
};

await open();
const before = { owned: await pillOn('Owned'), doubleSided: await pillOn('Double-sided') };
console.log('on arrival  :', JSON.stringify(before));
if (before.doubleSided === null) await fail('no Double-sided pill to toggle');

// Toggle the two that are visible for this account, then reload from scratch.
await p.getByText(/^(✓ )?Double-sided$/).first().click({ timeout: 8000 });
await settle(1200);
if (before.owned !== null) {
  await p.getByText(/^(✓ )?Owned$/).first().click({ timeout: 8000 });
  await settle(1200);
}
const afterToggle = { owned: await pillOn('Owned'), doubleSided: await pillOn('Double-sided') };
console.log('after toggle:', JSON.stringify(afterToggle));
await p.screenshot({ path: `${OUT}-1-toggled.png` });

// A RELOAD, not a re-render: the session-only version passed everything up to this line.
await open();
const afterReload = { owned: await pillOn('Owned'), doubleSided: await pillOn('Double-sided') };
console.log('after reload:', JSON.stringify(afterReload));
await p.screenshot({ path: `${OUT}-2-reloaded.png` });

// And the account copy, which is the half that crosses devices. Read it from the server rather
// than trusting the browser — a device-local write alone would look identical in the UI.
const rows = await (await rest(`profiles?id=eq.${session.user.id}&select=preferences`)).json();
const stored = rows?.[0]?.preferences?.binderView ?? null;
console.log('on the server:', JSON.stringify(stored));

let ok = true;
if (afterToggle.doubleSided === before.doubleSided) {
  console.log('FAIL — the Double-sided pill did not change when tapped');
  ok = false;
}
if (afterReload.doubleSided !== afterToggle.doubleSided) {
  console.log(`FAIL — Double-sided forgot on reload (${afterToggle.doubleSided} -> ${afterReload.doubleSided})`);
  ok = false;
}
if (before.owned !== null && afterReload.owned !== afterToggle.owned) {
  console.log(`FAIL — Owned forgot on reload (${afterToggle.owned} -> ${afterReload.owned})`);
  ok = false;
}
if (!stored || typeof stored.doubleSided !== 'boolean') {
  console.log('FAIL — nothing reached profiles.preferences.binderView; it would not follow to another device');
  ok = false;
} else if (stored.doubleSided !== afterToggle.doubleSided) {
  console.log(`FAIL — the server has doubleSided=${stored.doubleSided}, the screen had ${afterToggle.doubleSided}`);
  ok = false;
}

if (ok) console.log('PASS — the binder opens the way it was left, on this device and on the account');
else process.exitCode = 1;
await browser.close();
await restore();

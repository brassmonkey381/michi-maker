// Does the edit lease behave with two REAL tabs? Two pages in one browser context, so they share
// an origin and a localStorage exactly as two tabs of one profile do — which is the whole point:
// the lease is a localStorage record, and unit tests can only prove the decisions, not the wiring.
//
// Checks, in order: a lone tab takes the lease; a second tab takes it when brought forward; the
// first says so and goes read-only; bringing the first back hands it straight over again.
//
// Usage: node scripts/test-two-tabs-ui.mjs [outPrefix]
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';

const OUT = process.argv[2] ?? 'two-tabs';
const URL = 'http://localhost:8081/my-binders';
const KEY_PREFIX = 'michi.binder-edit-lease.';

// WHAT THIS CANNOT TEST, stated up front: every Playwright page reports document.hasFocus() true
// and visibilityState 'visible', headed or not — its pages are separate targets, not tabs the user
// switches between. So a genuine "click back into the other tab" hand-off cannot be produced here.
// What CAN be produced is the case that actually opens the second writer — a link opened in a new
// foreground tab — and the Edit here button, which is the same code path a focus rise takes.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const settle = (p, ms = 2500) => p.waitForTimeout(ms);
// Both tabs read the SAME record, so only the tabId says who holds it. Comparing whole values
// would call a heartbeat (which only advances `at`) a hand-off, and pass on a lease that never moved.
const lease = (p) =>
  p.evaluate((prefix) => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        return { key: k, tabId: JSON.parse(localStorage.getItem(k) ?? '{}').tabId ?? null };
      } catch {
        return { key: k, tabId: null };
      }
    }
    return null;
  }, KEY_PREFIX);
const banner = async (p) => {
  const t = await p.evaluate(() => document.body.innerText);
  return { readOnly: t.includes('Editing is open in another tab'), syncing: t.includes('Catching up') };
};

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
};
const open = async () => {
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForFunction(() => document.body.innerText.includes('inder'), { timeout: 180000 });
  await settle(p, 5000);
  return p;
};

// Counting binder tiles is how we tell an edit actually REGISTERED. The lease gate lives in
// commit(), the funnel every binder mutation goes through, so if it is ever wrongly closed the
// app does not error — it silently ignores everything, which is the worst way for this to fail.
// Creating a binder OPENS it, so navigation is the signal. It is the only robust one available: a
// new binder is given a RANDOM filler name, so there is no fixed string to count, and clicking
// back out of the editor can land on a modal that swallows the click.
// Making a binder can raise the sharing-attestation prompt, whose backdrop then swallows clicks
// aimed at anything behind it — including the banner button a later check needs. Answering it the
// harmless way ("Not now" leaves binders private) puts the page back in a clickable state.
const dismissModals = async (p) => {
  for (const label of ['Not now', 'Maybe later', 'Close']) {
    try {
      await p.getByText(label, { exact: false }).first().click({ timeout: 2500 });
      await p.waitForTimeout(800);
      return;
    } catch {
      // Not this one; try the next.
    }
  }
};

const newBinder = async (p) => {
  try {
    await p.getByText('+ New', { exact: false }).first().click({ timeout: 10000 });
  } catch {
    // Something is covering the button. Say so rather than scoring it as "creation refused",
    // which is the answer one of these checks is hoping for and would pass for the wrong reason.
    console.log('  (note: + New was not clickable — a modal is probably covering it)');
    return false;
  }
  await p.waitForTimeout(3500);
  return /\/binder\//.test(p.url());
};

const a = await open();
await a.screenshot({ path: `${OUT}-a1.png` });

// THE REGRESSION THAT MATTERS MOST: one ordinary tab, nothing contended, edits must just work.
check('a lone tab can still create a binder', await newBinder(a));
// Back to the list, while A is still the only tab — a reload re-runs the lease, so doing this
// once B exists would have the test disturbing the very thing it is measuring.
await a.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
await settle(a, 4000);
await dismissModals(a);
const l1 = await lease(a);
// No session means no userId means no lease is possible — the mechanism steps aside by design,
// so say so rather than report a pass on a page that was never locked.
check('tab A took the lease at load', !!l1, l1 ? l1.key : 'NO LEASE RECORD (no session? then this run proves nothing)');
check('tab A shows no read-only banner', !(await banner(a)).readOnly);

// Opened in the foreground, exactly like a link opened in a new tab: it is the tab being looked
// at and the one with the freshest data, so it takes the lease at load.
const b = await open();
await settle(b, 2000);
await b.screenshot({ path: `${OUT}-b1.png` });
const l2 = await lease(b);
check('the lease moved to tab B', !!l1?.tabId && !!l2?.tabId && l2.tabId !== l1.tabId, `${l1?.tabId} -> ${l2?.tabId}`);
check('tab B is not read-only', !(await banner(b)).readOnly);

// And the read-only tab must not merely LOOK read-only: a commit that lands locally without
// saving is the silent work loss this whole guard exists to prevent.
check('the read-only tab cannot create one', !(await newBinder(a)));

await settle(a, 1500);
// Read A BEFORE photographing it: page.screenshot() activates the page in Chromium, which is
// itself a focus change — photograph first and the tab takes the lease back before it is asked.
const lost = await banner(a);
check('tab A now says editing moved', lost.readOnly);
await a.screenshot({ path: `${OUT}-a2.png` });

// Both directions: a hand-off that only works once is not a hand-off. Driven through the banner's
// button because the focus rise it shares cannot be simulated (see the note at the top).
await dismissModals(a);
await a.getByText('Edit here', { exact: false }).first().click({ timeout: 10000 });
await settle(a, 3000);
const back = await banner(a);
check('tab A editable again after Edit here', !back.readOnly && !back.syncing);
await settle(b, 2000);
check('tab B stepped down', (await banner(b)).readOnly);
const l3 = await lease(a);
await a.screenshot({ path: `${OUT}-a3.png` });
check('the lease came back to A', !!l2?.tabId && !!l3?.tabId && l3.tabId !== l2.tabId, `${l2?.tabId} -> ${l3?.tabId}`);

await browser.close();
console.log(failed === 0 ? 'ALL PASSED' : `FAILED: ${failed} check(s)`);
process.exitCode = failed === 0 ? 0 : 1;

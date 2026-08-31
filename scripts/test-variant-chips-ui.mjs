// Print-finish chips: does the opt-in actually hold?
//
// The chip is drawn by BinderGrid, which is THE single-pocket renderer for the whole app — the
// owner's editor, the public shared-link viewer, the page filmstrip, every home/discover tile, and
// the marketing animation. The only thing keeping chips off those surfaces is that `variantOf` is
// undefined everywhere except BinderScreen. That is a call site remembering, which is exactly the
// kind of guarantee worth testing rather than trusting.
//
// TWO HALVES, and only one of them runs without a session:
//   * the NEGATIVE half — no chip on any surface a stranger or a guest can reach — needs no login
//     and is the half that can leak someone's collection detail onto a public page.
//   * the POSITIVE half — a chip on a pocket tied to an owned copy — needs an account with a
//     tcgscan collection, because a chip only exists where a pocket names a real card you own.
//     Pass SIGNED_IN=1 once you are logged in in the launched browser to include it.
//
// Usage: node scripts/test-variant-chips-ui.mjs [outPrefix]
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';

const OUT = process.argv[2] ?? 'variant-chips';
const BASE = 'http://localhost:8081';

const browser = await chromium.launch({ channel: 'msedge', headless: !process.env.SIGNED_IN });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
};

// The chip letters, as short standalone strings. Searching innerText for them would hit any card
// name containing an N, so the check reads the accessibility label the chip carries instead —
// which is also the thing a screen reader would announce, so a pass here means two things.
const CHIP_LABEL = /tap to change the print finish|^(Normal|Holofoil|Reverse Holofoil)$/;

async function chipCount(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[aria-label]'));
    return nodes.filter((n) => /change the print finish/.test(n.getAttribute('aria-label') ?? '')).length;
  });
}

const visit = async (path, waitFor) => {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), waitFor, { timeout: 120000 });
  } catch {
    // Fall through — an empty surface is still a valid surface to assert "no chips" on.
  }
  await page.waitForTimeout(4000);
  return page;
};

// --- The negative half: no guest-reachable surface may draw a chip. ---
for (const [path, marker, name] of [
  ['/', 'inder', 'home (carousels and binder tiles)'],
  ['/discover', 'inder', 'discover (public binder tiles)'],
  ['/my-binders', 'inder', 'my binders (guest — no collection, so no chips)'],
]) {
  const page = await visit(path, marker);
  const n = await chipCount(page);
  check(`no print-finish chip on ${name}`, n === 0, n ? `${n} found` : '');
  await page.screenshot({ path: `${OUT}-${path.replace(/\W+/g, '') || 'home'}.png`, fullPage: false });
  await page.close();
}

// --- The positive half: only meaningful with a real collection behind the session. ---
if (process.env.SIGNED_IN) {
  console.log('\nSIGNED_IN set — sign in and open a binder with a card from your collection.');
  const page = await visit('/my-binders', 'inder');
  console.log('Waiting 60s for you to open such a binder…');
  await page.waitForTimeout(60_000);
  const n = await chipCount(page);
  check('a pocket tied to an owned copy carries a chip', n > 0, `${n} chip(s)`);
  await page.screenshot({ path: `${OUT}-owner.png` });
  await page.close();
} else {
  console.log('\nSkipped the positive half (no SIGNED_IN): a chip needs a pocket tied to a real');
  console.log('owned copy, which needs an account with a tcgscan collection. This run proves only');
  console.log('that chips do not leak onto guest and public surfaces — say so, do not imply more.');
}

await browser.close();
console.log(failed === 0 ? '\nALL PASSED' : `\nFAILED: ${failed} check(s)`);
process.exitCode = failed === 0 ? 0 : 1;

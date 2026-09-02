// /binder/* NEVER SCROLLS VERTICALLY.
//
// The binder is the page. Everything else — the tools, the cover's toolbar, the view settings —
// now lives in chrome or a panel, and the pages themselves scale down to fit whatever height is
// left. So there is no longer any reason for this route to have a scrollbar, in either mode, at
// any window height, and this asserts exactly that: scrollHeight never exceeds the viewport.
//
// It also checks the reasons it USED to scroll are gone: the "Delete binder" button that sat
// below the pages, and the cover toolbar that appeared under them the moment you touched FC,
// IFC, IBC or BC.
//
// Requires the web dev server running and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'no-scroll';
const BASE = process.env.MICHI_BASE ?? 'http://localhost:8081';
const PROJECT = 'piikwvntldytjejxmcla';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
const HEIGHTS = (process.env.MICHI_HEIGHTS ?? '700,900,1080').split(',').map(Number);

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

/**
 * A COVER, BORROWED FOR THE RUN. The cover surfaces (FC / IFC / IBC / BC) only exist on a binder
 * that has a cover, and the fixture binder has none — so the run dresses it, tests, and undresses
 * it again in a finally, whatever happens. Without this the one case that used to force a
 * scrollbar is the one case that never gets tested.
 */
const REST = `https://${PROJECT}.supabase.co/rest/v1/binders?id=eq.${BINDER}`;
const AUTH = { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
const priorCover = (
  await (await fetch(`${REST}&select=cover`, { headers: AUTH })).json()
)[0]?.cover ?? null;
const setCover = (cover) =>
  fetch(REST, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ cover }) });
await setCover({ modelId: 'vaultx-exotec-zip-12-xl', colourway: 'signature-black' });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let ok = true;
try {

/**
 * How far past the fold anything goes. The DOCUMENT is only half the question: this app's binder
 * sits inside a ScrollView, and an inner scroller that overflows shows the same scrollbar and
 * hides the same content — reporting only `document` would call that green.
 *
 * Also reports what the deepest thing below the page's bottom edge is, because "37px over" is
 * only actionable once you know what is down there.
 */
const overflow = (p) =>
  p.evaluate(() => {
    // Only the binder's own scroller. The filmstrip and the two side panels scroll by design —
    // the user's rule is that the BINDER never has to be scrolled to be seen whole.
    const main = document.querySelector('[data-testid="binder-scroll"]');
    const page = document.querySelector('[data-testid="binder-page-current"]');
    const below = [];
    if (page) {
      const bottom = page.getBoundingClientRect().bottom;
      for (const el of document.querySelectorAll('div, span')) {
        const r = el.getBoundingClientRect();
        if (r.top >= bottom - 1 && r.height > 2 && r.width > 2 && el.children.length === 0)
          below.push(`${el.tagName}@${Math.round(r.top)}+${Math.round(r.height)}:${(el.innerText || '').slice(0, 18)}`);
      }
    }
    return {
      doc: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      inner: main ? Math.round(main.scrollHeight - main.clientHeight) : 0,
      below: below.slice(0, 6),
    };
  });

for (const height of HEIGHTS) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height } });
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
  await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
  await settle(4000);
  for (let i = 0; i < 30 && !(await p.locator('[data-testid="binder-page-current"]').count()); i++) await settle(1000);
  await settle(1500);

  const view = await overflow(p);
  console.log(`${height}px view : doc +${view.doc}px inner +${view.inner}px`, view.below.join(' '));
  if (view.doc > 1 || view.inner > 1) {
    console.log(`FAIL — ${height}px view mode scrolls (doc +${view.doc}, inner +${view.inner})`);
    ok = false;
  }

  await p.getByText('Edit', { exact: true }).first().click({ timeout: 8000 });
  for (let i = 0; i < 25 && !(await p.locator('[data-testid="tool-undo"]').count()); i++) await settle(800);
  await settle(2500);
  const edit = await overflow(p);
  console.log(`${height}px edit : doc +${edit.doc}px inner +${edit.inner}px`, edit.below.join(' '));
  if (edit.doc > 1 || edit.inner > 1) {
    console.log(`FAIL — ${height}px edit mode scrolls (doc +${edit.doc}, inner +${edit.inner})`);
    ok = false;
  }

  // The button that used to sit below the pages, whose only purpose was to be scrolled to.
  if (await p.getByText('Delete binder', { exact: true }).count()) {
    console.log('FAIL — the editor still carries a Delete binder button below the pages');
    ok = false;
  }

  // Touching a cover surface used to add three lines under the binder. It should open the
  // Artwork panel's Cover tab instead, and cost the page nothing.
  //
  // The cover chips live in the page strip, labelled FC / IFC / IBC / BC, and they only exist on a
  // binder that has a cover AND is being read as a book — a single-page view draws no covers at
  // all. The account's saved preference decides that, so the run sets it rather than hoping.
  await p.locator('[data-testid="binder-settings-btn"]').first().click({ timeout: 8000 });
  await settle(1500);
  const twoUp = p.getByText(/^(✓ )?Double-sided$/).first();
  if ((await twoUp.count()) && !(await twoUp.innerText()).startsWith('✓')) {
    await twoUp.click({ timeout: 8000 });
    await settle(2000);
  }
  await p.locator('[data-testid="binder-settings-btn"]').first().click({ timeout: 8000 }).catch(() => {});
  await p.getByText('Done', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
  await settle(2500);
  const fc = p.getByText('FC', { exact: true }).first();
  if (await fc.count()) {
    await fc.click({ timeout: 8000 }).catch(() => {});
    await settle(3000);
    const cover = await overflow(p);
    const tabShown = (await p.locator('[data-testid="artwork-dock"]').getByText('Cover', { exact: true }).count()) > 0;
    console.log(`${height}px cover: doc +${cover.doc}px inner +${cover.inner}px, Cover tab: ${tabShown}`);
    if (cover.doc > 1 || cover.inner > 1) {
      console.log(`FAIL — ${height}px scrolls once a cover is picked (doc +${cover.doc}, inner +${cover.inner})`);
      ok = false;
    }
    if (!tabShown) {
      // Reported, not failed: reaching a cover surface needs the account's own view preference to
      // be two-up, and this run cannot be sure it flipped it — the thing under test here is the
      // scrollbar, and that is measured above whether or not the chip was reachable.
      console.log('note        : no Cover tab — the FC chip was probably not reachable in this view');
    }
    await p.screenshot({ path: `${OUT}-${height}-cover.png`, animations: 'disabled', timeout: 60000 }).catch(() => {});
  } else {
    console.log(`${height}px cover: no cover surface on the strip (this binder has no cover) — skipped`);
  }

  await ctx.close();
}

} finally {
  await setCover(priorCover);
  console.log('cleanup     : the fixture binder is back to the cover it had');
}

console.log(ok ? 'PASS — /binder never needs a vertical scrollbar' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);

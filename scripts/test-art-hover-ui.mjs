// Does a reserved art panel explain itself on hover?
//
// The card is drawn OUTSIDE the pocket (pockets clip), so the only honest check is to put a real
// artwork slot on a real page, point at it, and look for the role guide. Self-cleaning: the slot
// is deleted again whatever happens.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = process.env.MICHI_BASE ?? 'http://localhost:8085';
const PROJECT = 'piikwvntldytjejxmcla';
const raw = readFileSync('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets', 'utf8');
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
const rest = (path, init = {}) =>
  fetch(`https://${PROJECT}.supabase.co/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });

const mine = await (await rest(`binders?owner_id=eq.${session.user.id}&select=id&limit=1`)).json();
const BINDER = mine[0].id;
const pages = await (
  await rest(`binder_pages?binder_id=eq.${BINDER}&select=id,rows,cols&order=position.asc&limit=1`)
).json();
const PAGE = pages[0].id;
const slots = await (
  await rest(`binder_slots?page_id=eq.${PAGE}&select=row_index,col_index,row_span,col_span`)
).json();
const taken = new Set();
for (const s of slots) {
  for (let r = s.row_index; r < s.row_index + s.row_span; r += 1)
    for (let c = s.col_index; c < s.col_index + s.col_span; c += 1) taken.add(`${r},${c}`);
}
let cell = null;
for (let r = 0; r < pages[0].rows && !cell; r += 1)
  for (let c = 0; c < pages[0].cols && !cell; c += 1) if (!taken.has(`${r},${c}`)) cell = { r, c };
if (!cell) {
  console.log('FAILED: no free pocket on that page to test with');
  process.exit(1);
}

const made = await (
  await rest('binder_slots', {
    method: 'POST',
    body: JSON.stringify({
      page_id: PAGE,
      row_index: cell.r,
      col_index: cell.c,
      row_span: 1,
      col_span: 1,
      slot_type: 'artwork',
      notes: '3x3-wall-text:footer',
    }),
  })
).json();
const SLOT = made?.[0]?.id;
const cleanup = async () => {
  if (SLOT) await rest(`binder_slots?id=eq.${SLOT}`, { method: 'DELETE' });
  console.log('cleanup     : test slot removed');
};
process.on('uncaughtException', async (e) => {
  console.log('FAILED:', e?.message ?? e);
  await cleanup().catch(() => {});
  process.exit(1);
});

const b = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
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
let ok = true;
const check = (pass, msg) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!pass) ok = false;
};

await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
await settle(5000);

// Scoped to the LIVE page: the filmstrip draws its own tiny copy of the same words, and a
// bare text match finds that first and then hovers a 20px thumbnail.
const brief = p
  .locator('[data-testid="binder-page-current"]')
  .getByText(/Footer caption band/)
  .first();
check((await brief.count()) > 0, 'the panel names its job on the page');

const has = async (re) => (await p.locator('body').innerText()).match(re) !== null;
check(!(await has(/credits line for the cards above/)), 'the guide is not on the page until asked');

// What is actually under the pointer there?
const bb = await brief.boundingBox();
const stack = await p.evaluate(({ x, y }) => {
  const els = document.elementsFromPoint(x, y);
  return els.slice(0, 6).map((e) => `${e.tagName}.${e.className}`.slice(0, 90) + ' | pe=' +
    getComputedStyle(e).pointerEvents + ' op=' + getComputedStyle(e).opacity);
}, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
console.log('under the pointer:');
for (const l of stack) console.log('   ', l);
await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
// No settle: the reveal is meant to be instant. A short beat only covers the paint.
await settle(150);
check(await has(/credits line for the cards above/), 'hovering the panel explains the role');
check(await has(/Set symbol and release date/), 'and gives concrete examples');
check(await has(/Not: Prices/), 'and names the trap');
await p.screenshot({ path: 'shot-arthover.png' });

await p.mouse.move(30, 950);
await settle(200);
check(!(await has(/credits line for the cards above/)), 'it leaves when the pointer does');

await b.close();
await cleanup();
console.log(ok ? '\nPASS — a reserved panel explains itself on hover' : '\nFAILED');
process.exit(ok ? 0 : 1);

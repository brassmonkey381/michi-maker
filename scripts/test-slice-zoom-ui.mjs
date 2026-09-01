// Framing the art: does the zoom scale with the gesture, and do the guides know when to shut up?
//
// Two claims worth measuring rather than eyeballing.
//
// ZOOM GRANULARITY. Every zoom used to be the same fixed chunk — a button, a keypress and a wheel
// notch all moved ~12%, and a trackpad's two-finger scroll, which reports a few pixels per frame,
// moved the same ~12% per frame and made the canvas lurch. Zoom now scales with how much you
// actually scrolled, so this drives a trackpad-sized delta and a mouse-notch-sized delta at the
// same point and checks they do visibly different amounts of work.
//
// GUIDES AT REST. The alignment guides are derived from the window, and the default framing is
// centred — so a guide drawn purely on "is anything aligned?" lights up the moment art loads and
// never goes out, which is furniture, not feedback. They are tied to the gesture instead, and this
// checks all three states: nothing at rest, something while panning, nothing again once settled.
//
// Credentials come from tcgscan.secrets (MICHI_TEST_EMAIL / MICHI_TEST_PASSWORD) and are never
// printed. It only reads — it opens the studio, loads an image by URL, and closes without saving.
//
//   node scripts/test-slice-zoom-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'slice-zoom';
const PROJECT = 'piikwvntldytjejxmcla';
const raw = readFileSync('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets', 'utf8');
const read = (k) => {
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(`${k}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim() : null;
};
const anon = read('APP_PUBLISHABLE_KEY');
const s = await (
  await fetch(`https://${PROJECT}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: read('MICHI_TEST_EMAIL'), password: read('MICHI_TEST_PASSWORD') }),
  })
).json();
const mine = await (
  await fetch(`https://${PROJECT}.supabase.co/rest/v1/binders?owner_id=eq.${s.user.id}&select=id&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${s.access_token}` },
  })
).json();
const BINDER = mine[0].id;

const b = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await ctx.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
  key: `sb-${PROJECT}-auth-token`,
  value: JSON.stringify({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: s.user,
  }),
});
const p = await ctx.newPage();
const settle = (ms) => p.waitForTimeout(ms);
const fail = async (m) => {
  console.log('FAIL —', m);
  await p.screenshot({ path: `${OUT}-fail.png` });
  await b.close();
  process.exit(1);
};

await p.goto(`http://localhost:8081/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
await settle(5000);
for (let i = 0; i < 30 && (await p.getByText('Edit', { exact: false }).count()) === 0; i++) await settle(1000);
let entered = false;
for (let a = 0; a < 4 && !entered; a++) {
  try { await p.getByText('Edit', { exact: false }).first().click({ timeout: 10000 }); entered = true; }
  catch { await settle(6000); }
}
if (!entered) await fail('never got into edit mode');
await settle(3000);

// A real card image URL, taken off the binder itself — deterministic, and no dependence on the
// art picker's own click targets.
const artUrl = await p.evaluate(() => {
  const img = [...document.querySelectorAll('img')].find((el) => (el.getAttribute('src') || '').includes('http'));
  return img ? img.getAttribute('src') : null;
});
if (!artUrl) await fail('no card image on the page to borrow a URL from');
console.log('art url     :', artUrl.slice(-46));

// Into the studio by its own front door — the slice tray's "Slice new art". Independent of
// whether the page happens to have an empty pocket, which the pocket route is not.
await p.getByText('Slice new art', { exact: false }).first().click({ timeout: 10000 });
for (let i = 0; i < 25 && !(await p.getByText('Slice studio', { exact: true }).count()); i++) await settle(1000);
await settle(2000);

await p.getByPlaceholder(/paste an image URL/i).fill(artUrl);
await p.getByText('Load', { exact: true }).first().click({ timeout: 8000 });
for (let i = 0; i < 25 && !(await p.getByText('Scale to fit', { exact: true }).count()); i++) await settle(1000);
await settle(3000);
await p.screenshot({ path: `${OUT}-1-loaded.png` });

// The controls the touch/granularity work adds.
const hasSnapBtn = (await p.getByText('⌗', { exact: true }).count()) > 0;
const hintUpdated = (await p.locator('text=pinch to zoom').count()) > 0;
console.log('snap button :', hasSnapBtn);
console.log('hint says pinch:', hintUpdated);
if (!hasSnapBtn) await fail('no Snap control in the toolbar');

// The canvas, and the image inside it whose box tracks the crop window.
const canvasBox = await p.evaluate(() => {
  const el = [...document.querySelectorAll('img')]
    .map((i) => ({ i, r: i.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 250) // the studio canvas image, not a browse thumb
    .sort((a, b) => b.r.width - a.r.width)[0];
  if (!el) return null;
  const c = el.i.closest('div');
  const r = el.i.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), tag: c ? c.tagName : '' };
});
if (!canvasBox) await fail('could not find the studio canvas image');
console.log('canvas img  :', JSON.stringify(canvasBox));

const cx = canvasBox.x + canvasBox.w / 2;
const cy = canvasBox.y + canvasBox.h / 2;
const boxNow = () =>
  p.evaluate(() => {
    const el = [...document.querySelectorAll('img')]
      .map((i) => ({ i, r: i.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 250)
      .sort((a, b) => b.r.width - a.r.width)[0];
    if (!el) return null;
    const r = el.i.getBoundingClientRect();
    return { x: Math.round(r.x * 10) / 10, w: Math.round(r.width * 10) / 10 };
  });

// "Scale to fit" so the frame is unlocked (Original pins the window and zoom is disabled).
await p.getByText('Scale to fit', { exact: true }).first().click({ timeout: 8000 });
await settle(1500);

const wheel = (deltaY) =>
  p.evaluate(
    ({ x, y, dy }) => {
      const el = document.elementFromPoint(x, y);
      el?.dispatchEvent(
        new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }),
      );
    },
    { x: cx, y: cy, dy: deltaY },
  );

const start = await boxNow();
await wheel(-6); // a trackpad nudge
await settle(700);
const afterNudge = await boxNow();
await wheel(-120); // a mouse-wheel notch
await settle(700);
const afterNotch = await boxNow();

const nudge = afterNudge.w - start.w;
const notch = afterNotch.w - afterNudge.w;
console.log('start w     :', start.w);
console.log('after nudge :', afterNudge.w, `(+${nudge.toFixed(1)})`);
console.log('after notch :', afterNotch.w, `(+${notch.toFixed(1)})`);

let ok = true;
if (!(nudge > 0)) { console.log('FAIL — a small wheel delta did nothing at all'); ok = false; }
if (!(notch > nudge * 3)) {
  console.log(`FAIL — the notch (${notch.toFixed(1)}) is not meaningfully bigger than the nudge (${nudge.toFixed(1)}) — still a fixed step`);
  ok = false;
}
if (!hintUpdated) { console.log('FAIL — the hint does not mention pinch'); ok = false; }

// Guides: quiet at rest, present while the frame is moving.
const guides = () => p.locator('[data-testid="slice-guide"]').count();
await settle(1600);
const atRest = await guides();
await p.mouse.move(cx, cy);
await p.mouse.down();
for (let i = 0; i < 12; i++) { await p.mouse.move(cx - i * 4, cy - i * 2); await settle(40); }
const whileMoving = await guides();
await p.mouse.up();
await settle(1600);
const afterRest = await guides();
console.log(`guides      : rest=${atRest} moving=${whileMoving} settled=${afterRest}`);
if (atRest !== 0 || afterRest !== 0) { console.log('FAIL — guides linger when nothing is moving'); ok = false; }
if (whileMoving === 0) { console.log('FAIL — no guide appeared while panning across the grid'); ok = false; }
await p.screenshot({ path: `${OUT}-2-zoomed.png` });
if (ok) console.log('PASS — zoom scales with the gesture: a nudge moves a little, a notch moves a lot');
else process.exitCode = 1;
await b.close();

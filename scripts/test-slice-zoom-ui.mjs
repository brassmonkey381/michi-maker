// Framing the art: does the zoom scale with the gesture, and do the guides know when to shut up?
//
// Two claims worth measuring rather than eyeballing.
//
// ZOOM GRANULARITY. Every zoom used to be the same fixed chunk — a button, a keypress and a wheel
// notch all moved ~12%, and a trackpad's two-finger scroll, which reports a few pixels per frame,
// moved the same ~12% per frame and made the canvas lurch. Zoom now scales with how much you
// actually scrolled, so this drives a trackpad-sized delta and a mouse-notch-sized delta at the
// same point and checks they do visibly different amounts of work — then drives the SAME delta
// three ways to check the modifiers: ⌘/Ctrl for the crawl you frame to the pixel with, Shift for
// crossing a lot of zoom in one gesture.
//
// THE CUT PICKER FITS. All ten shapes in one wrapping row ran off the side of the panel and buried
// the three people reach for, so the row is the common five plus "+ more". This checks the
// collapsed count, that "+ more" is there, and that it actually reveals something.
//
// MERGE WITHOUT A KEYBOARD. Selecting a second piece was spelled only as a held Ctrl or Shift, so
// on a phone there was no way to select two — and Merge, the studio's core craft move, was
// unreachable on the device most people photograph their cards with. A long press says the same
// thing. The fold crease draws only for a legal sideways pair, so its appearance is the proof.
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

const wheel = (deltaY, mods = {}) =>
  p.evaluate(
    ({ x, y, dy, m }) => {
      const el = document.elementFromPoint(x, y);
      el?.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: dy,
          deltaMode: 0,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          ctrlKey: !!m.ctrl,
          shiftKey: !!m.shift,
        }),
      );
    },
    { x: cx, y: cy, dy: deltaY, m: mods },
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

// FINE AND COARSE. The same scroll distance, three ways: the plain rate, the ⌘/Ctrl crawl for
// lining an edge up to the pixel, and Shift for crossing a lot of zoom at once.
const rateOf = async (mods) => {
  const from = await boxNow();
  await wheel(-40, mods);
  await settle(600);
  const to = await boxNow();
  await wheel(40, mods); // put it back, so the three are measured from the same place
  await settle(600);
  return Math.round((to.w - from.w) * 10) / 10;
};
const plain = await rateOf({});
const fine = await rateOf({ ctrl: true });
const coarse = await rateOf({ shift: true });
console.log(`rates       : plain=+${plain} fine=+${fine} coarse=+${coarse} (same 40px scroll)`);
if (!(fine > 0 && fine < plain / 3)) {
  console.log(`FAIL — ⌘/Ctrl is not a fine step (${fine} vs ${plain})`);
  ok = false;
}
if (!(coarse > plain)) {
  console.log(`FAIL — Shift is not a coarse step (${coarse} vs ${plain})`);
  ok = false;
}

// The cut picker has to FIT. Ten chips in one row ran off the side of the panel.
const shapeRow = await p.evaluate(() => {
  const label = [...document.querySelectorAll('*')].find(
    (el) => el.children.length === 0 && (el.textContent || '').trim() === 'Slice into',
  );
  if (!label) return null;
  const group = label.parentElement;
  const row = group ? group.children[1] : null;
  if (!row) return null;
  const r = row.getBoundingClientRect();
  const chips = [...row.querySelectorAll('div')].filter((el) => el.children.length && (el.textContent || '').match(/^[0-9]×[0-9]$|more|less/));
  return { right: Math.round(r.right), width: Math.round(r.width), panel: Math.round(document.documentElement.clientWidth) };
});
const moreBtn = await p.getByText('+ more', { exact: true }).count();
const chipCount = await p.evaluate(() => {
  const label = [...document.querySelectorAll('*')].find(
    (el) => el.children.length === 0 && (el.textContent || '').trim() === 'Slice into',
  );
  const row = label && label.parentElement ? label.parentElement.children[1] : null;
  if (!row) return -1;
  return [...row.children].length;
});
console.log(`cut picker  : ${chipCount} chips, "+ more" present=${moreBtn > 0}, row width=${shapeRow ? shapeRow.width : '?'}`);
if (chipCount !== 6) { console.log(`FAIL — collapsed picker should show 5 shapes + "more", got ${chipCount}`); ok = false; }
if (moreBtn === 0) { console.log('FAIL — no "+ more" to reach the other shapes'); ok = false; }

await p.getByText('+ more', { exact: true }).first().click({ timeout: 8000 });
await settle(1200);
const expandedCount = await p.evaluate(() => {
  const label = [...document.querySelectorAll('*')].find(
    (el) => el.children.length === 0 && (el.textContent || '').trim() === 'Slice into',
  );
  const row = label && label.parentElement ? label.parentElement.children[1] : null;
  return row ? [...row.children].length : -1;
});
console.log(`expanded    : ${expandedCount} chips`);
if (!(expandedCount > chipCount)) { console.log('FAIL — "+ more" revealed nothing'); ok = false; }

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
// MERGE ON TOUCH. Two pieces selected without a keyboard: tap one, hold the next. The fold
// crease only draws for a legal sideways pair, so its appearance is the whole proof — a merge
// that a finger alone could not previously set up.
await p.getByText('Sliced', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
await settle(1200);
const cellW = canvasBox.w / 3;
const cellH = canvasBox.h / 3;
const at = (col, row) => ({
  x: canvasBox.x + cellW * (col + 0.5),
  y: canvasBox.y + cellH * (row + 0.5),
});
const a = at(0, 1);
const bb = at(1, 1);
await p.mouse.click(a.x, a.y);
await settle(600);
// A hold, not a click: press, wait past the long-press threshold, release without moving.
await p.mouse.move(bb.x, bb.y);
await p.mouse.down();
await settle(700);
await p.mouse.up();
await settle(900);
// The crease draws ONLY for a legal sideways pair, so it is the honest witness that two pieces
// are selected — a Merge button alone can appear on a single selection.
const creased = (await p.locator('[data-testid="slice-fold"]').count()) > 0;
const mergeOffered = (await p.getByText('Merge', { exact: false }).count()) > 0;
console.log(`touch merge : fold crease=${creased} mergeOffered=${mergeOffered}`);
if (!creased) { console.log('FAIL — holding a second piece did not build a mergeable pair'); ok = false; }

await p.screenshot({ path: `${OUT}-2-zoomed.png` });
if (ok) {
  console.log('PASS — zoom scales with the gesture and with its modifiers, the guides know when to');
  console.log('       shut up, two pieces can be selected by finger, and the cut picker fits');
}
else process.exitCode = 1;
await b.close();

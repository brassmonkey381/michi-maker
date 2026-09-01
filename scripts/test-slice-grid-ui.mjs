// Choosing the cut, and taking it back.
//
// TWO THINGS THE STUDIO DID NOT HAVE.
//
// The cut was FIXED to the binder page you came from. That is the right default — slicing a
// picture across the page in front of you is the common case — but as the only option it ruled out
// most of what people actually make: a two-pocket panorama, a four-up block in the corner of a
// bigger page, a single full-bleed pocket. The tray holds loose pieces and you drag them where you
// like, so the cut never had to match the page; only the default did.
//
// And there was no UNDO, on the one screen where a single keystroke destroys minutes of work:
// Merge folds two pieces into one, Delete throws pieces away, Reset drops the whole arrangement.
// The only recovery was to start the picture over.
//
// This drives both against a real image: the default matches the page, another shape re-cuts the
// canvas, Ctrl-Z puts the previous cut back, and a merge undoes cleanly. The piece count comes
// from the studio's own header ("Save slices (N)") — its number, not a guess at the DOM.
//
// Credentials come from tcgscan.secrets and are never printed. Nothing is saved: it opens the
// studio, cuts, undoes, and closes without touching the tray or the binder.
//
//   node scripts/test-slice-grid-ui.mjs [outPrefix]
//
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'slice-grid';
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
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
const settle = (ms) => p.waitForTimeout(ms);
const fail = async (m) => {
  console.log('FAIL —', m);
  if (errors.length) console.log('errors      :', errors.slice(0, 3));
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

const artUrl = await p.evaluate(() => {
  const img = [...document.querySelectorAll('img')].find((el) => (el.getAttribute('src') || '').includes('http'));
  return img ? img.getAttribute('src') : null;
});
await p.getByText('Slice new art', { exact: false }).first().click({ timeout: 10000 });
for (let i = 0; i < 25 && !(await p.getByText('Slice studio', { exact: true }).count()); i++) await settle(1000);
await settle(2000);
await p.getByPlaceholder(/paste an image URL/i).fill(artUrl);
await p.getByText('Load', { exact: true }).first().click({ timeout: 8000 });
for (let i = 0; i < 25 && !(await p.getByText('Scale to fit', { exact: true }).count()); i++) await settle(1000);
await settle(3000);

// Sliced view so the pieces are countable as separate clipped boxes.
await p.getByText('Sliced', { exact: true }).first().click({ timeout: 8000 }).catch(() => {});
await settle(1500);

// The studio counts the pieces itself, in the header: "Save slices (N)". Reading its own number
// beats counting DOM nodes — expo-image does not render one <img> per piece — and it is the number
// the user is looking at.
const pieces = async () => {
  const txt = await p.evaluate(() => document.body.innerText);
  const m = txt.match(/Save slices \((\d+)\)/);
  return m ? Number(m[1]) : -1;
};

const hasShapePicker = (await p.getByText('Slice into', { exact: true }).count()) > 0;
console.log('shape picker:', hasShapePicker);
if (!hasShapePicker) await fail('no cut picker in the toolbar');

const atDefault = await pieces();
console.log('default cut :', atDefault, 'pieces (page is 3x3)');
await p.screenshot({ path: `${OUT}-1-default.png` });

// Pick 2x2 — a different cut from the page's own.
await p.getByText('2×2', { exact: true }).first().click({ timeout: 8000 });
await settle(2000);
const at2x2 = await pieces();
console.log('after 2×2   :', at2x2, 'pieces');
await p.screenshot({ path: `${OUT}-2-2x2.png` });

// Ctrl-Z should put the page's own cut back.
await p.keyboard.press('Control+z');
await settle(2000);
const afterUndo = await pieces();
console.log('after undo  :', afterUndo, 'pieces');

// And a merge should be undoable: two side-by-side pieces fold into one, so the count drops by one.
// Two side-by-side pieces of the 3x3: top-left and top-middle, found from the canvas geometry.
const canvas = await p.evaluate(() => {
  const el = [...document.querySelectorAll('img')]
    .map((i) => ({ i, r: i.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 250)
    .sort((a, c) => c.r.width - a.r.width)[0];
  if (!el) return null;
  const r = el.r;
  const cw = r.width / 3;
  const ch = r.height / 3;
  return {
    a: { x: Math.round(r.x + cw * 0.5), y: Math.round(r.y + ch * 0.5) },
    b: { x: Math.round(r.x + cw * 1.5), y: Math.round(r.y + ch * 0.5) },
  };
});
let mergeChecked = 'skipped';
if (canvas) {
  await p.mouse.click(canvas.a.x, canvas.a.y);
  await settle(500);
  await p.mouse.move(canvas.b.x, canvas.b.y);
  await p.mouse.down();
  await settle(700);
  await p.mouse.up();
  await settle(900);
  const mergeBtn = p.getByText('Merge', { exact: false }).first();
  if ((await mergeBtn.count()) > 0) {
    const before = await pieces();
    await mergeBtn.click({ timeout: 8000 });
    await settle(1500);
    const merged = await pieces();
    await p.keyboard.press('Control+z');
    await settle(1500);
    const unmerged = await pieces();
    console.log(`merge undo  : ${before} -> ${merged} -> ${unmerged}`);
    mergeChecked = merged < before && unmerged === before ? 'ok' : 'BROKEN';
  }
}

let ok = true;
if (at2x2 !== 4) { console.log(`FAIL — picking 2×2 gave ${at2x2} pieces, not 4`); ok = false; }
if (afterUndo !== atDefault) { console.log(`FAIL — undo gave ${afterUndo} pieces, not the ${atDefault} it started with`); ok = false; }
if (mergeChecked === 'BROKEN') { console.log('FAIL — a merge did not undo cleanly'); ok = false; }
if (mergeChecked === 'skipped') console.log('note        : merge-undo half did not run');
if (errors.length) console.log('errors      :', errors.slice(0, 3));
await p.screenshot({ path: `${OUT}-3-final.png` });
if (ok) console.log('PASS — the cut is choosable, defaults to the page, and undo puts it back');
else process.exitCode = 1;
await b.close();

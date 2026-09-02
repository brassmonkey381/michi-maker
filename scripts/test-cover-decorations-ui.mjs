// COVER DECORATIONS, END TO END: pick a surface, get the panel and the tray, add text, see a
// layer, see handles, see properties — and the page never moves.
//
// The fixture binder has no cover, so the run dresses it and undresses it again in a finally.
// Requires the web dev server running and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'cover-deco';
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
const AUTH = { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
const mine = await (await fetch(`https://${PROJECT}.supabase.co/rest/v1/binders?owner_id=eq.${session.user.id}&select=id,cover&limit=1`, { headers: AUTH })).json();
if (!Array.isArray(mine) || !mine.length) {
  console.log('FAILED: the test account owns no binders');
  process.exit(1);
}
const BINDER = mine[0].id;
const priorCover = mine[0].cover ?? null;
const REST = `https://${PROJECT}.supabase.co/rest/v1/binders?id=eq.${BINDER}`;
const setCover = (cover) => fetch(REST, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ cover }) });
// A card the fixture already shows, as the picture on the front cover.
const slots = await (await fetch(`https://${PROJECT}.supabase.co/rest/v1/binder_slots?select=card_id,binder_pages!inner(binder_id)&binder_pages.binder_id=eq.${BINDER}&card_id=not.is.null&limit=1`, { headers: AUTH })).json().catch(() => []);
const CARD = Array.isArray(slots) && slots[0]?.card_id ? slots[0].card_id : null;
const PIC_ID = 'probe-pic';
await setCover({
  modelId: 'vaultx-exotec-zip-12-xl',
  colourway: 'signature-black',
  surfaces: CARD ? { front: [{ id: PIC_ID, kind: 'art', cardId: CARD, x: 0.35, y: 0.4, w: 0.3, h: 0.3 }] } : undefined,
});
console.log(`fixture        : cover dressed${CARD ? ' with one card picture' : ' (no card found; click-to-select step will be skipped)'}`);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let ok = true;
const fail = (m) => {
  console.log(`FAIL — ${m}`);
  ok = false;
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript({
    content: `window.localStorage.setItem('sb-${PROJECT}-auth-token', ${JSON.stringify(
      JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: session.user }),
    )});`,
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
  const settle = (ms) => p.waitForTimeout(ms);
  const box = (sel) =>
    p.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }, sel);

  await p.goto(`${BASE}/binder/${BINDER}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => document.body.innerText.includes('Edit'), undefined, { timeout: 240000 });
  await settle(4000);
  await p.getByText('Edit', { exact: true }).first().click({ timeout: 8000 });
  for (let i = 0; i < 25 && !(await p.locator('[data-testid="tool-undo"]').count()); i++) await settle(800);
  await settle(2000);

  // The view under test: the book (default) or, with MICHI_SINGLE=1, the single-page view — the
  // cover chips exist in both now, and every step below holds in both.
  const wantTwoUp = !process.env.MICHI_SINGLE;
  await p.locator('[data-testid="binder-settings-btn"]').first().click({ timeout: 8000 });
  await settle(1200);
  const two = p.getByText(/Double-sided$/).first();
  if (await two.count()) {
    const isOn = (await two.innerText()).startsWith('✓');
    if (isOn !== wantTwoUp) {
      await two.click({ timeout: 8000 });
      await settle(1500);
    }
  }
  console.log(`view           : ${wantTwoUp ? 'book (double-sided)' : 'single page'}`);
  // Close the settings dialog by its backdrop: "the first Done on the page" is not always its Done.
  await p.mouse.click(8, 8);
  await settle(2000);
  const pageBefore = await box('[data-testid="binder-page-current"]');

  // 1. PICK THE FRONT COVER from the strip.
  const fc = p.getByText(/^FC( · \d+)?$/).first();
  if (!(await fc.count())) fail('no FC chip in the strip (double-sided did not switch on?)');
  else {
    await fc.click({ timeout: 8000 });
    await settle(3000);
  }
  // 1b. CLICK THE PICTURE: selecting on the canvas is the same selection the tray shows.
  if (CARD) {
    const hit = p.locator(`[data-testid="cover-hit-${PIC_ID}"]`).first();
    if (!(await hit.count())) fail('the pre-placed picture has no hit box on the canvas');
    else {
      const hb = await hit.boundingBox();
      await p.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await settle(1500);
      // A selected row carries the ▲ ▼ order buttons; an unselected one does not.
      const rowSelected = String(/▲/.test(await p.locator(`[data-testid="cover-layer-${PIC_ID}"]`).first().innerText().catch(() => '')));
      const props = (await p.locator('[data-testid="image-properties"]').count()) > 0;
      const fitChips = (await p.locator('[data-testid="fit-fill"]').count()) + (await p.locator('[data-testid="fit-original"]').count());
      const lock = (await p.locator('[data-testid="prop-lock-aspect"]').count()) > 0;
      console.log(`click picture  : tray row selected=${rowSelected} imageProps=${props} fitChips=${fitChips} fixedScaleChip=${lock}`);
      if (rowSelected !== 'true') fail('clicking the picture did not select its layer row');
      if (!props) fail('image properties did not open for the clicked picture');
      if (fitChips < 2) fail('the Stretch to fill / Original aspect chips are missing');
      if (!lock) fail('the Fixed scale chip is missing');

      // 1c. FREE CORNER: drag the SE handle straight down 40px → H grows, W does not.
      const wBefore = await p.locator('[data-testid="prop-w"]').inputValue().catch(() => '?');
      const hBefore = await p.locator('[data-testid="prop-h"]').inputValue().catch(() => '?');
      const se = await p.locator('[data-testid="cover-handle-se"]').first().boundingBox();
      if (se) {
        await p.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
        await p.mouse.down();
        for (let i = 1; i <= 5; i++) { await p.mouse.move(se.x + se.width / 2, se.y + se.height / 2 + i * 8, { steps: 2 }); await settle(40); }
        await p.mouse.up();
        await settle(1800);
      }
      const wAfter = await p.locator('[data-testid="prop-w"]').inputValue().catch(() => '?');
      const hAfter = await p.locator('[data-testid="prop-h"]').inputValue().catch(() => '?');
      console.log(`free corner    : W ${wBefore}% -> ${wAfter}%, H ${hBefore}% -> ${hAfter}%`);
      if (hBefore === hAfter) fail('dragging the corner down did not change H');
      if (wBefore !== wAfter) fail('dragging the corner straight down changed W — the corner is not free');
      await p.locator('[data-testid="cover-canvas"]').first().click({ position: { x: 3, y: 3 } }).catch(() => {});
      await settle(800);
    }
  }
  const dock = (await p.locator('[data-testid="artwork-dock"]').count()) > 0;
  const tray = (await p.locator('[data-testid="cover-layers"]').count()) > 0;
  const panel = (await p.locator('[data-testid="cover-panel"]').count()) > 0;
  console.log(`surface picked : dock=${dock} layersTray=${tray} coverPanel=${panel}`);
  if (!dock) fail('the Art dock did not open');
  if (!tray) fail('the Layers tray is not on screen');
  if (!panel) fail('the Cover panel is not showing');

  // 2. ADD TEXT: a layer appears, text properties show, the canvas has a hit box and handles.
  if (panel) {
    await p.locator('[data-testid="cover-add-text"]').first().click({ timeout: 8000 });
    await settle(2500);
    const layers = await p.locator('[data-testid^="cover-layer-"]:not([data-testid*="eye"]):not([data-testid*="delete"])').count();
    const textProps = (await p.locator('[data-testid="text-properties"]').count()) > 0;
    const hit = await p.locator('[data-testid^="cover-hit-"]').count();
    const rotate = (await p.locator('[data-testid="cover-handle-rotate"]').count()) > 0;
    const handles = await p.locator('[data-testid^="cover-handle-"]').count();
    const trayText = await p.locator('[data-testid="cover-layers"]').innerText().catch(() => '');
    console.log(`after + Text   : layers=${layers} textProps=${textProps} hitBoxes=${hit} handles=${handles} rotateGrab=${rotate}`);
    console.log(`tray says      : ${trayText.replace(/\n/g, ' | ').slice(0, 120)}`);
    if (layers < (CARD ? 2 : 1)) fail('no layer row after adding text');
    if (!textProps) fail('text properties did not show for the new text');
    if (hit < 1) fail('no hit box on the canvas');
    if (!rotate || handles < 9) fail(`expected 8 resize handles + rotate, got ${handles}`);
    if (!new RegExp(`${CARD ? 2 : 1} \/ 12`).test(trayText)) fail(`tray count is not "${CARD ? 2 : 1} / 12"`);

    // 3. DRAG THE BODY 60px right on the canvas: the row's X changes, nothing crashes.
    const hb = await p.locator('[data-testid^="cover-hit-"]').first().boundingBox();
    if (hb) {
      const xBefore = await p.locator('[data-testid="prop-x"]').inputValue().catch(() => '?');
      await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await p.mouse.down();
      for (let i = 1; i <= 6; i++) {
        await p.mouse.move(hb.x + hb.width / 2 + i * 10, hb.y + hb.height / 2, { steps: 2 });
        await settle(40);
      }
      await p.mouse.up();
      await settle(2000);
      const xAfter = await p.locator('[data-testid="prop-x"]').inputValue().catch(() => '?');
      console.log(`drag on canvas : X ${xBefore}% -> ${xAfter}%`);
      if (xBefore === xAfter) fail('dragging the text on the canvas did not move it');
    }

    // 4. THE STICKER LIBRARY: deselect, and the set-logo tiles should be there (or say why not).
    await p.locator('[data-testid="cover-canvas"]').first().click({ position: { x: 5, y: 5 }, timeout: 8000 }).catch(() => {});
    await settle(2500);
    const stickers = await p.locator('[data-testid^="sticker-set:"], [data-testid^="sticker-series:"]').count();
    const libText = await p.locator('[data-testid="sticker-library"]').innerText().catch(() => '(no library)');
    console.log(`sticker tiles  : ${stickers}  (${libText.split('\n')[0]}${stickers === 0 ? ' — ' + libText.split('\n').slice(1, 3).join(' ') : ''})`);
    if (stickers === 0) console.log('note           : no logo tiles — the taxonomy may carry no coverUri values in this environment');
  }

  // 4b. THE WHEEL WALKS THE COVERS in the single-page view: from the front cover, forward is the
  //     inside front, then page 1; back again is the inside front, then the front cover.
  if (!wantTwoUp) {
    const wrap = await box('[data-testid="binder-page-wrap"]');
    const labelNow = async () => (await p.locator('[data-testid="binder-page-wrap"]').innerText().catch(() => '')).split(String.fromCharCode(10))[0];
    const seen = [];
    if (wrap) {
      await p.mouse.move(wrap.x + wrap.w / 2, wrap.y + wrap.h / 2);
      for (const dy of [120, 120, -120, -120]) {
        await p.mouse.wheel(0, dy);
        await settle(700);
        seen.push(await labelNow());
      }
    }
    console.log(`wheel walk     : ${seen.join(' → ')}`);
    const okWalk = seen[0] === 'Inside front' && !!seen[1] && seen[1] !== 'Inside front' && seen[1] !== 'Front cover' && seen[2] === 'Inside front' && seen[3] === 'Front cover';
    if (!okWalk) fail('the wheel did not walk Front cover → Inside front → page → Inside front → Front cover');
  }

  // 5. NOTHING ABOVE THE BINDER GREW. Picking the front cover SHUTS the binder, so the current
  //    page column is gone by design; the check is that the binder's top edge is where it was.
  const wrapAfter = await box('[data-testid="binder-page-wrap"]');
  console.log(`binder top     : page y ${pageBefore?.y} -> wrap y ${wrapAfter?.y}`);
  if (pageBefore && wrapAfter && Math.abs(pageBefore.y - wrapAfter.y) > 2) fail('the binder moved while the cover was being decorated');

  await p.screenshot({ path: `${OUT}-1.png`, animations: 'disabled', timeout: 60000 }).catch(() => {});
  if (errs.length) {
    console.log('page errors    :', errs.slice(0, 3));
    fail('the page threw');
  }
} finally {
  await setCover(priorCover);
  console.log('cleanup        : the fixture binder is back to the cover it had');
  await browser.close();
}
console.log(ok ? 'PASS — a cover surface gets a panel, a layers tray, a canvas with handles, and the page holds still' : 'FAIL');
process.exit(ok ? 0 : 1);

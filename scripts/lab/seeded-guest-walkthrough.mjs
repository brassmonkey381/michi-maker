// The seeded walkthrough as a guest, the way a thumb does it: real touch drags through CDP on the
// iOS and Android sizes, a drag to column 3, a reload mid-walkthrough, Complete before dragging.
//   node scripts/lab/seeded-guest-walkthrough.mjs            (dev server on :8090)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/seeded-guest';
mkdirSync(OUT, { recursive: true });
const PHONES = { ios: { width: 390, height: 844 }, android: { width: 412, height: 915 } };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const log = (...a) => console.log(...a);
const PRO = /\bPRO\b/;
let failures = 0;
const check = (label, ok, extra = '') => { log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' ' + extra : ''}`); if (!ok) failures += 1; };

async function session(name, phone, scenario) {
  log(`\n=== ${name} (${phone}) ===`);
  const ctx = await browser.newContext({ viewport: PHONES[phone], deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const shot = async (n) => { await page.screenshot({ path: `${OUT}/${name}-${n}.png`, timeout: 60000 }); };
  const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const wait = (ms) => page.waitForTimeout(ms);
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|React DevTools/i.test(m.text())) log('  console.error:', m.text().slice(0, 160)); });
  // A finger: down, a few moves, up, all through the devtools touch emulation.
  const touchDrag = async (x0, y0, x1, y1, steps = 10) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] });
      await wait(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const handleBox = () => page.locator('[data-testid="resize-handle"]').first().boundingBox().catch(() => null);
  const ringBox = () => page.locator('[data-testid="walkthrough-pocket-ring"]').first().boundingBox().catch(() => null);
  const artWidth = () => page.evaluate(() => {
    const img = document.querySelector('img[src*="binder-art"]');
    return img ? Math.round(img.getBoundingClientRect().width) : null;
  });

  await page.goto('http://localhost:8090/?utm_source=reddit&utm_medium=paid_social&utm_campaign=michi_launch_2026_11&code=rd_lidi_image', { waitUntil: 'domcontentloaded', timeout: 240000 });
  try { await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 180000 }); } catch { log('  no editor?'); }
  await wait(5000);
  await shot('01-arrival');
  const t1 = await text();
  check('arrives on step 1 of 3, the drag', t1.includes('Drag the picture across the row') && t1.includes('1 of 3'));
  check('a picture is on the page', (await page.locator('img[src*="binder-art"]').count()) >= 1);
  check('the resize handle is already showing', (await page.locator('[data-testid="resize-handle"]').count()) === 1);
  check('no PRO word', !PRO.test(t1));
  await scenario({ page, cdp, shot, text, wait, touchDrag, handleBox, ringBox, artWidth });
  await ctx.close();
}

// A: Android, one touch pull to column 2, then Complete, then the payoff.
await session('a-android-col2', 'android', async ({ page, shot, text, wait, touchDrag, handleBox, ringBox, artWidth }) => {
  const hb = await handleBox(); const ring = await ringBox();
  check('handle and ring measured', !!hb && !!ring);
  const w0 = await artWidth();
  await touchDrag(hb.x + hb.width / 2, hb.y + hb.height / 2, hb.x + hb.width / 2 + ring.width + 8, hb.y + hb.height / 2);
  await wait(1500);
  await shot('02-dragged');
  const t = await text();
  const w1 = await artWidth();
  check('picture is about two pockets wide after a touch drag', w1 !== null && w0 !== null && w1 > w0 * 1.8 && w1 < w0 * 2.4, `${w0} -> ${w1}`);
  check('step 2 of 3 points at Complete', t.includes('Tap Complete to fill this page') && t.includes('2 of 3'));
  await page.locator('[data-testid="tool-complete"]').first().tap({ timeout: 8000 });
  await wait(10000);
  const t2 = await text();
  const pick = ['Same theme', 'Same type', 'Same artist', 'Like the whole page'].find((m) => t2.includes(m));
  check('Complete sheet offers a method', !!pick, pick);
  if (pick) await page.getByText(pick, { exact: false }).first().tap({ timeout: 8000 });
  let t3 = '';
  for (let i = 0; i < 24 && !/Filled \d+ pocket/.test(t3); i += 1) { await wait(500); t3 = await text(); }
  await wait(1500); t3 = await text();
  await shot('03-filled');
  check('Complete filled four pockets', /Filled 4 pockets/.test(t3), (t3.match(/Filled \d+ pockets?/) ?? [''])[0]);
  check('step 3 of 3 asks for the account', t3.includes('Create an account to save your binder') && t3.includes('3 of 3'));
  check('no PRO word after the fill', !PRO.test(t3));
  await page.getByRole('button', { name: /Create an account to save your binder/ }).first().tap({ timeout: 8000 });
  await wait(2500);
  await shot('04-auth');
  check('the payoff card opens account creation', /Continue with Google/.test(await text()));
});

// B: iOS, pull all the way to column 3, reload, the walkthrough resumes on step 2.
await session('b-ios-col3-reload', 'ios', async ({ page, shot, text, wait, touchDrag, handleBox, ringBox, artWidth }) => {
  const hb = await handleBox(); const ring = await ringBox();
  const w0 = await artWidth();
  await touchDrag(hb.x + hb.width / 2, hb.y + hb.height / 2, hb.x + hb.width / 2 + (ring.width + 8) * 2 + 20, hb.y + hb.height / 2, 14);
  await wait(1500);
  await shot('02-dragged');
  const w1 = await artWidth();
  check('picture is three pockets wide', w1 !== null && w1 > w0 * 2.8, `${w0} -> ${w1}`);
  check('step 2 of 3 after the full pull', (await text()).includes('2 of 3'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  try { await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 180000 }); } catch { log('  no editor after reload?'); }
  await wait(5000);
  await shot('03-reloaded');
  const t = await text();
  check('after a reload the picture is still three wide', (await artWidth()) > w0 * 2.8);
  check('after a reload the walkthrough is on step 2, not back on the drag', t.includes('2 of 3') && !t.includes('Drag the picture'));
  await page.locator('[data-testid="tool-complete"]').first().tap({ timeout: 8000 });
  await wait(10000);
  const t2 = await text();
  const pick = ['Same theme', 'Same type', 'Same artist', 'Like the whole page'].find((m) => t2.includes(m));
  if (pick) await page.getByText(pick, { exact: false }).first().tap({ timeout: 8000 });
  let t3 = '';
  for (let i = 0; i < 24 && !/Filled \d+ pocket/.test(t3); i += 1) { await wait(500); t3 = await text(); }
  await wait(1500); t3 = await text();
  await shot('04-filled');
  check('Complete filled the three pockets left', /Filled 3 pockets/.test(t3), (t3.match(/Filled \d+ pockets?/) ?? [''])[0]);
  check('step 3 of 3', t3.includes('3 of 3'));
});

// C: iOS, Complete first without touching the picture: the payoff anyway, nobody stranded.
await session('c-ios-complete-first', 'ios', async ({ page, shot, text, wait }) => {
  await page.locator('[data-testid="tool-complete"]').first().tap({ timeout: 8000 });
  await wait(10000);
  const t2 = await text();
  const pick = ['Same theme', 'Same type', 'Same artist', 'Like the whole page'].find((m) => t2.includes(m));
  check('Complete opens from step 1 too', !!pick);
  if (pick) await page.getByText(pick, { exact: false }).first().tap({ timeout: 8000 });
  let t3 = '';
  for (let i = 0; i < 24 && !/Filled \d+ pocket/.test(t3); i += 1) { await wait(500); t3 = await text(); }
  await wait(1500); t3 = await text();
  await shot('02-filled');
  check('five pockets filled around the one-wide picture', /Filled 5 pockets/.test(t3), (t3.match(/Filled \d+ pockets?/) ?? [''])[0]);
  check('jumps to step 3 of 3', t3.includes('3 of 3') && t3.includes('Create an account to save your binder'));
  // The cross ends it for good.
  await page.locator('[data-testid="walkthrough-dismiss"]').first().tap({ timeout: 4000 }).catch(() => log('  (no dismiss control found)'));
  await wait(1200);
  check('the cross closes the card', !(await text()).includes('3 of 3'));
});

await browser.close();
log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

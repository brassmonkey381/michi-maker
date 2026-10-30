// Guest experience on phone viewports: iOS (390x844, iPhone 14/15) and Android (412x915, Pixel 7).
// Fresh context = guest. Landing -> editor -> search -> place -> Fill page -> toast -> Find similar
// (one use, then the wall) -> add pages to the 3-page cap -> reload -> Fill wall.
//   node scripts/lab/guest-phones.mjs ios|android
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const which = process.argv[2] ?? 'ios';
const DEV = which === 'android'
  ? { viewport: { width: 412, height: 915 }, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' }
  : { viewport: { width: 390, height: 844 }, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' };
const OUT = `C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/guest-${which}`;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: DEV.viewport, userAgent: DEV.ua, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const log = (...a) => console.log(...a);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }); log('  shot', n); };
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const has = async (t) => (await text()).includes(t);
const PRO = /\bPRO\b/;
const wait = (ms) => page.waitForTimeout(ms);
const click = async (t, i = 0) => { await page.getByText(t, { exact: false }).nth(i).click({ timeout: 8000 }); log('  clicked', t); };
const hscroll = async () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|React DevTools/i.test(m.text())) log('  console.error:', m.text().slice(0, 160)); });
page.on('pageerror', (e) => log('  pageerror:', String(e).slice(0, 200)));

// 1. Landing as a guest.
await page.goto('http://localhost:8090/', { waitUntil: 'domcontentloaded', timeout: 240000 });
await wait(8000);
await shot('01-landing');
const t1 = await text();
log('LANDING PRO visible?', PRO.test(t1), '| hscroll', JSON.stringify(await hscroll()));
log('landing text head:', t1.slice(0, 400));

// 2. Editor via the new-binder link.
await page.goto('http://localhost:8090/my-binders?open=new', { waitUntil: 'domcontentloaded', timeout: 240000 });
try { await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 180000 }); } catch { log('no editor?'); }
await wait(3000);
await shot('02-editor');
const t2 = await text();
log('EDITOR PRO?', PRO.test(t2), '| walkthrough:', (t2.match(/Tap (a|any) pocket[^.]{0,120}/) ?? [''])[0], '| hscroll', JSON.stringify(await hscroll()));

// 3. Tap the first pocket, search.
const POCKET = { x: Math.round(DEV.viewport.width * 0.21), y: 255 };
await page.mouse.click(POCKET.x, POCKET.y);
await wait(6000);
await shot('03-browser');
const search = page.locator('input').first();
await search.fill('pikachu');
await search.press('Enter');
await wait(7000);
await shot('04-search');
await click('Got it').catch(() => {});
await wait(800);
const plus = page.getByLabel('+', { exact: true }).first();
if (await plus.count()) { await plus.click({ timeout: 8000 }); log('  clicked +'); } else { log('  no + pill by label; tapping its spot'); await page.mouse.click(Math.round(DEV.viewport.width / 2 - 16), 335); }
let toast = '';
for (let i = 0; i < 10 && !/added|swapped/.test(toast); i += 1) { await wait(400); toast = await text(); }
await shot('05-placed');
log('PLACE toast:', (toast.match(/[A-Z][a-z]+ (added|swapped)[^|]{0,40}/) ?? ['(none)'])[0]);
log('walkthrough step 3:', ((await text()).match(/Now fill the page around it[^|]{0,160}/) ?? [''])[0]);

// 4. Find similar from the card browser on the placed card (one guest use, then the wall).
// Tap the first tile to open the card's actions (Find similar lives there on a phone).
await page.mouse.click(Math.round(DEV.viewport.width / 4), 450);
await wait(2500);
await shot('05b-card-actions');
log('card actions text:', (await text()).slice(0, 300));
const similar = page.getByText('Find similar', { exact: false }).first();
if (await similar.count()) {
  await similar.click({ timeout: 8000 }).catch(() => log('  Find similar not clickable'));
  await wait(7000);
  await shot('06-similar-1');
  const ts = await text();
  log('SIMILAR 1: wall?', ts.includes('Keep using Find similar'), 'PRO?', PRO.test(ts));
  const again = page.getByText('Find similar', { exact: false }).first();
  if (await again.count()) {
    await again.click({ timeout: 8000 }).catch(() => {});
    let tw = '';
    for (let i = 0; i < 10 && !tw.includes('Keep using'); i += 1) { await wait(400); tw = await text(); }
    await shot('07-similar-2');
    log('SIMILAR 2: wall?', tw.includes('Keep using Find similar with a free account'), 'PRO?', PRO.test(tw), '|', (tw.match(/Keep using Find similar[^·]{0,40}/) ?? [''])[0]);
  } else log('  no second Find similar control');
} else log('  no Find similar control in the browser');

await page.keyboard.press('Escape'); await wait(1200);
await page.keyboard.press('Escape'); await wait(800);
await click('Close Card Browser').catch(() => {});
await wait(1500);
await shot('08-back-to-page');

// 5. Fill page -> Same Pokemon (the guest's one fill).
await page.mouse.click(POCKET.x, POCKET.y);
await wait(1500);
await click('Fill page');
await wait(5000);
await shot('09-fill-sheet');
const t9 = await text();
log('FILL sheet PRO?', PRO.test(t9), '| methods:', ['Same Pok', 'Evolution line', 'Same artist', 'More like this', 'Same scene', 'Trainer page'].filter((m) => t9.includes(m)).join(', '));
await click('Same Pok');
let t10 = '';
for (let i = 0; i < 16 && !/Filled \d+ pocket/.test(t10); i += 1) { await wait(500); t10 = await text(); }
await wait(1000);
await shot('10-filled');
log('FILL toast:', (t10.match(/Filled \d+ pockets?[^|]{0,80}/) ?? ['(none)'])[0], '| PRO?', PRO.test(t10));

// 6. Fill again, same visit: the wall.
await page.mouse.click(POCKET.x, POCKET.y);
await wait(1500);
await click('Fill page').catch(() => log('  no Fill page control'));
await wait(3000);
await shot('11-fill-wall');
const t11 = await text();
log('FILL 2 wall?', t11.includes('Create a free account to keep using Fill page') || t11.includes('Keep using Fill'), 'PRO?', PRO.test(t11), '|', (t11.match(/(Create a free account|Keep using)[^|]{0,80}/) ?? [''])[0]);
await page.keyboard.press('Escape'); await wait(1000);

// 7. Pages: add until the cap (3 for a guest).
for (let i = 0; i < 4; i += 1) {
  const add = page.getByLabel(/add page|new page/i).first();
  const addText = page.getByText(/^(\+ ?Page|Add page|New page)$/i).first();
  if (await add.count()) await add.click({ timeout: 5000 }).catch(() => {});
  else if (await addText.count()) await addText.click({ timeout: 5000 }).catch(() => {});
  else { log('  no add-page control found at try', i); break; }
  await wait(2000);
}
await shot('12-page-cap');
const t12 = await text();
log('PAGE CAP text:', (t12.match(/[^.|]{0,60}(3 pages|page limit|more pages|pages per binder)[^.|]{0,80}/i) ?? ['(none)'])[0], '| PRO?', PRO.test(t12), '| Create account?', /Create (a free )?account/.test(t12));
await page.keyboard.press('Escape'); await wait(800);

// 8. Reload: a new visit, Fill is still the wall (per use).
await page.reload({ waitUntil: 'domcontentloaded' });
try { await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 120000 }); } catch {}
await wait(4000);
await click('Got it').catch(() => {});
await page.mouse.click(POCKET.x, POCKET.y);
await wait(1500);
await click('Fill page').catch(() => {});
await wait(3000);
await shot('13-reload-fill-wall');
const t13 = await text();
log('RELOAD wall?', t13.includes('Create a free account to keep using Fill page') || t13.includes('Keep using Fill'), 'PRO?', PRO.test(t13));
await page.keyboard.press('Escape'); await wait(800);
await page.locator('[data-testid="tool-complete"]').first().click({ timeout: 8000 }).catch(() => log('  no tool-complete'));
await wait(3000);
await shot('14-complete-wall');
const t14 = await text();
log('COMPLETE wall?', t14.includes('Create a free account to keep using Fill page'), 'PRO?', PRO.test(t14));
log('final hscroll', JSON.stringify(await hscroll()));
await browser.close();

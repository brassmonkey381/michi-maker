// A fresh browser context is a guest. Drive: new binder -> add a Pikachu -> Fill page -> Same Pokemon
// -> expect the taste toast and a filled page -> Undo -> Complete shows previews (same visit) ->
// reload (a new visit) -> Fill page and Complete are both the free-account wall.
//   node scripts/lab/zz-guest-fill-run.mjs [phone]     (dev server on :8090)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/guest-fill';
mkdirSync(OUT, { recursive: true });
const phone = process.argv[2] === 'phone';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
const page = await ctx.newPage();
const log = (...a) => console.log(...a);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${phone ? 'p-' : ''}${n}.png`, timeout: 60000 }); log('  shot', n); };
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const has = async (t) => (await text()).includes(t);
const PRO = /\bPRO\b/;
const click = async (t, i = 0) => { await page.getByText(t, { exact: false }).nth(i).click({ timeout: 8000 }); log('  clicked', t); };
const wait = (ms) => page.waitForTimeout(ms);
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|React DevTools/i.test(m.text())) log('  console.error:', m.text().slice(0, 160)); });
// The first pocket's centre on each layout (the walkthrough rings it), and where that pocket sits
// once the docked card browser has pushed the page left.
const POCKET = phone ? { x: 82, y: 255 } : { x: 477, y: 275 };
const CARD = phone ? POCKET : { x: 176, y: 235 };

await page.goto('http://localhost:8090/my-binders?open=new', { waitUntil: 'domcontentloaded', timeout: 240000 });
try { await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 180000 }); } catch { log('no editor?'); }
await wait(3000);
await shot('02-editor');

await page.mouse.click(POCKET.x, POCKET.y);
await wait(6000);
const search = page.locator('input[type="text"], input[type="search"], input').first();
await search.fill('pikachu');
await search.press('Enter');
await wait(7000);
await shot('04-search');
await click('Got it').catch(() => {});
await wait(800);
// The first tile's + pill.
const plus = page.getByLabel('+', { exact: true }).first();
if (await plus.count()) { await plus.click({ timeout: 8000 }); log('  clicked +'); } else { log('  no + pill; clicking its spot'); await page.mouse.click(phone ? 178 : 847, 335); }
await wait(3000);
await shot('05-placed');
log('walkthrough step 3:', ((await text()).match(/Now fill the page around it[^|]{0,160}/) ?? [''])[0]);
await page.keyboard.press('Escape');
await wait(1500);
await page.keyboard.press('Escape');
await wait(1000);
// On a phone the card browser is a sheet over the page: close it to reach the card.
if (phone) { await click('Close Card Browser').catch(() => {}); await wait(1500); }

await page.mouse.click(CARD.x, CARD.y);
await wait(1500);
await shot('05b-selected');
await wait(1500);
await click('Fill page');
await wait(5000);
await shot('06-fill-sheet');
const t6 = await text();
log('fill sheet methods:', ['Same Pok', 'Evolution line', 'Same artist', 'Color by type', 'Trainer page', 'More like this', 'Same scene', 'tri-color', 'Full-page spread', 'Friends'].filter((m) => t6.includes(m)).join(', '), '| PRO?', PRO.test(t6), '| Only row?', t6.includes('Only'));
await click('Same Pok');
// The toasts live 5 s: read them while they are up.
let toastSeen = '';
for (let i = 0; i < 16 && !/Filled \d+ pocket/.test(toastSeen); i += 1) { await wait(500); toastSeen = await text(); }
await wait(1500);
await shot('07-filled');
log('TOAST taste?', toastSeen.includes('Keep using Fill Same Pok'), 'filled?', /Filled \d+ pocket/.test(toastSeen), 'PRO?', PRO.test(toastSeen));
log('toast text:', (toastSeen.match(/Keep using Fill[^·]*account/) ?? [''])[0], '|', (toastSeen.match(/Filled \d+ pockets?[^A-Z]*/) ?? [''])[0]);

// Same visit: the taste is open, so Complete shows its previews (Undo the fill first for empties).
await page.keyboard.press('Control+z');
await wait(2500);
await page.locator('[data-testid="tool-complete"]').first().click({ timeout: 8000 }).catch(() => log('  no tool-complete'));
await wait(12000);
await shot('08-complete-previews');
const t8 = await text();
log('COMPLETE previews: type?', t8.includes('Same type'), 'artist?', t8.includes('Same artist'), 'theme?', t8.includes('Same theme'), 'whole page?', t8.includes('Like the whole page'), 'lines?', t8.includes('Finish the lines'), 'palette?', t8.includes('Same palette'), 'PRO?', PRO.test(t8), 'wall?', t8.includes('Create a free account to keep using'));
log('complete text:', (t8.match(/Complete this page.{0,500}/) ?? [''])[0]);
await page.keyboard.press('Escape');
await wait(1000);

// A new visit: the one fill is spent, both sheets are the wall.
await page.reload({ waitUntil: 'domcontentloaded' });
try { await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 120000 }); } catch {}
await wait(4000);
await click('Got it').catch(() => {});
await page.mouse.click(POCKET.x, POCKET.y);
await wait(1500);
await shot('09a-reloaded');
await click('Fill page');
await wait(3000);
await shot('09-fill-wall');
log('WALL fill?', await has('Create a free account to keep using Fill page'), 'PRO?', PRO.test(await text()));
await page.keyboard.press('Escape');
await wait(1000);
await page.locator('[data-testid="tool-complete"]').first().click({ timeout: 8000 }).catch(() => log('  no tool-complete'));
await wait(3000);
await shot('10-complete-wall');
log('WALL complete?', await has('Create a free account to keep using Fill page'), 'PRO?', PRO.test(await text()));
await browser.close();

// A tagged Reddit arrival (data/seedPages): lands past /welcome on a binder whose page one holds
// three themed cards, the walkthrough points at Complete, one Complete fills the page (the guest's
// one fillPage sample), the payoff step asks for the account, a second Complete is the wall.
//   node scripts/lab/seeded-arrival-run.mjs [phone] [code]     (dev server on :8090)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/seeded';
mkdirSync(OUT, { recursive: true });
const phone = process.argv[2] === 'phone';
const code = process.argv[3] ?? 'rd_rainbow_image';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
const page = await ctx.newPage();
const log = (...a) => console.log(...a);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${phone ? 'p-' : ''}${n}.png`, timeout: 60000 }); log('  shot', n); };
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const wait = (ms) => page.waitForTimeout(ms);
const PRO = /\bPRO\b/;
const events = [];
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|React DevTools/i.test(m.text())) log('  console.error:', m.text().slice(0, 160)); });
page.on('request', (r) => { if (/\/analytics|\/events|track/i.test(r.url()) && r.method() === 'POST') { try { events.push(r.postData() ?? ''); } catch {} } });

await page.goto(`http://localhost:8090/?utm_source=reddit&utm_medium=paid_social&utm_campaign=michi_launch_2026_11&code=${code}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
try { await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 180000 }); } catch { log('no editor?'); }
await wait(5000);
await shot('01-arrival');
const t1 = await text();
log('URL:', page.url());
log('ARRIVAL: seeded walkthrough?', t1.includes('Tap Complete to fill this page'), '| 1 of 2?', t1.includes('1 of 2'), '| ring?', await page.locator('[data-testid="walkthrough-pocket-ring"]').count(), '| PRO?', PRO.test(t1));
const filledPockets = await page.locator('img[src*="/cards/"], img[src*="supabase"]').count();
log('card images on screen:', filledPockets);

// Complete -> the first fill offered.
await page.locator('[data-testid="tool-complete"]').first().click({ timeout: 8000 });
await wait(12000);
await shot('02-complete-sheet');
const t2 = await text();
log('COMPLETE sheet: type?', t2.includes('Same type'), 'artist?', t2.includes('Same artist'), 'theme?', t2.includes('Same theme'), 'whole page?', t2.includes('Like the whole page'), 'PRO?', PRO.test(t2), 'wall?', t2.includes('Create a free account'));
const pick = ['Same theme', 'Same type', 'Same artist', 'Like the whole page'].find((m) => t2.includes(m));
if (pick) { await page.getByText(pick, { exact: false }).first().click({ timeout: 8000 }); log('  picked', pick); }
let t3 = '';
for (let i = 0; i < 20 && !/Filled \d+ pocket/.test(t3); i += 1) { await wait(500); t3 = await text(); }
await wait(1500);
t3 = await text();
await shot('03-filled');
log('FILL toast:', (t3.match(/Filled \d+ pockets?[^|]{0,80}/) ?? ['(none)'])[0], '| payoff?', t3.includes('Create an account to save your binder'), '| 2 of 2?', t3.includes('2 of 2'), '| PRO?', PRO.test(t3));

// The payoff card is a button: a tap opens account creation (owner, 2026-10-30).
const payoff = page.getByRole('button', { name: /Create an account to save your binder/ }).first();
log('  payoff buttons:', await payoff.count());
log('  banner html:', await page.evaluate(() => document.querySelector('[data-testid="walkthrough-banner"]')?.outerHTML.replace(/style="[^"]*"/g, '').slice(0, 900)));
await payoff.click({ timeout: 8000 }).catch(() => log('  payoff card not clickable'));
await wait(2500);
await shot('04-auth-sheet');
const t4 = await text();
log('AUTH sheet open?', /Continue with Google/.test(t4), '| PRO?', PRO.test(t4));
await page.keyboard.press('Escape'); await wait(800);

// A second Complete: the page is full, so the tool is disabled; the Fill route is the wall.
await page.keyboard.press('Escape'); await wait(800);
const disabled = await page.locator('[data-testid="tool-complete"]').first().getAttribute('aria-disabled');
log('Complete disabled now (page full)?', disabled);
await browser.close();

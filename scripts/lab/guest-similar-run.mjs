// Guest Find similar on a phone: place Pikachu, open the card's actions, tap Find similar (one
// sample), read what the browser shows, tap again (the wall). Also finds any element wider than
// the viewport after the 3-page reload.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const which = process.argv[2] ?? 'ios';
const W = which === 'android' ? 412 : 390, H = which === 'android' ? 915 : 844;
const OUT = `C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/guest-${which}`;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const log = (...a) => console.log(...a);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 }); log('  shot', n); };
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
const wait = (ms) => page.waitForTimeout(ms);
const state = async () => page.evaluate(() => ({ input: document.querySelector('input')?.value, results: (document.body.innerText.match(/[\d,]+ results[^\n]{0,40}/) ?? [''])[0] }));
const sim = []; page.on('request', (r) => { if (/similar/i.test(r.url())) sim.push(r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 60)); });
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|React DevTools/i.test(m.text())) log('  console.error:', m.text().slice(0, 200)); });

await page.goto('http://localhost:8090/my-binders?open=new', { waitUntil: 'domcontentloaded', timeout: 240000 });
try { await page.waitForSelector('[data-testid="tool-complete"]', { timeout: 180000 }); } catch {}
await wait(3000);
await page.mouse.click(Math.round(W * 0.21), 255);
await wait(6000);
const search = page.locator('input').first();
await search.fill('pikachu'); await search.press('Enter');
await wait(7000);
await page.getByText('Got it').first().click({ timeout: 3000 }).catch(() => {});
await wait(800);
await page.mouse.click(Math.round(W / 2 - 16), 335);
await wait(2500);
// Open the first tile's actions.
await page.mouse.click(Math.round(W / 4), 450);
await wait(2500);
for (let n = 1; n <= 3; n += 1) {
  const btn = page.getByText('Find similar', { exact: false }).first();
  if (!(await btn.count())) { log(`try ${n}: no Find similar control`); await shot(`s${n}-no-control`); break; }
  await btn.click({ timeout: 8000 });
  let t = '';
  for (let i = 0; i < 20; i += 1) { await wait(500); t = await text(); if (/(Keep using|keep using) Find similar/.test(t) || /similar:/.test((await state()).input ?? '')) break; }
  if (/keep using Find similar/i.test(t)) await shot(`s${n}-wall`); else await wait(3000);
  await shot(`s${n}-after-similar`);
  const st = await state();
  log(`try ${n}: similar requests so far=${sim.length} last=${sim.at(-1)}`);
  log(`try ${n}: input=${JSON.stringify(st.input)} results=${JSON.stringify(st.results)} wall=${/keep using Find similar/i.test(t)} PRO=${/\bPRO\b/.test(t)} toast=${(t.match(/(Create a free account to keep using|Keep using)[^|]{0,60}/) ?? [''])[0]}`);
  // Reopen a tile's actions for the next try: the right column, a different card each time.
  await page.mouse.click(Math.round(W * 3 / 4), 450);
  await wait(2500);
  if (!(await page.getByText('Find similar', { exact: false }).first().count())) { await shot(`s${n}-reopen`); log('  reopen text:', (await text()).slice(0, 200)); }
}
// Width offenders after a 3-page reload.
await page.keyboard.press('Escape'); await wait(800);
for (let i = 0; i < 2; i += 1) { await page.getByText(/^\+ ?Page$/).first().click({ timeout: 4000 }).catch(() => {}); await wait(1500); }
await page.reload({ waitUntil: 'domcontentloaded' });
await wait(10000);
const wide = await page.evaluate(() => {
  const cw = document.documentElement.clientWidth; const out = [];
  for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.right > cw + 1 && r.width < 4000) out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)} right=${Math.round(r.right)} w=${Math.round(r.width)} txt=${(el.innerText || '').slice(0, 30).replace(/\s+/g, ' ')}`); }
  return { sw: document.documentElement.scrollWidth, cw, out: out.slice(0, 12) };
});
log('WIDE', JSON.stringify(wide, null, 1));
await shot('s9-reloaded');
await browser.close();

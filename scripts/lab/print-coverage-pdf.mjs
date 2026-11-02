// Reprint public/downloads/game-feature-coverage.pdf from the /coverage route on the :8090 dev
// server, so the PDF says what src/data/gameCoverage.ts says. Headless Chromium print, desktop width.
//   node scripts/lab/print-coverage-pdf.mjs
import { chromium } from 'playwright-core';

const OUT = 'C:/Users/Brian/source/repos/tcgscan/michi-maker/public/downloads/game-feature-coverage.pdf';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
await page.goto('http://localhost:8090/coverage', { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForSelector('text=Download as PDF', { timeout: 240000 });
await page.waitForTimeout(2500);
// Hide the chrome: rails, tabs, the download link itself.
await page.addStyleTag({ content: 'nav, [role="navigation"], [data-testid="app-rail"], [data-testid="bottom-tabs"] { display: none !important; }' });
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.textContent?.trim() === 'Download as PDF ›' && el.children.length === 0) (el.closest('[role="button"]') ?? el).style.display = 'none'; });
// Anything fixed to the viewport (the floating menu button) and the Back link do not belong on paper.
await page.evaluate(() => { for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (cs.position === 'fixed') el.style.display = 'none'; } for (const el of document.querySelectorAll('*')) if (/^[‹<]\s*Back$/.test(el.textContent?.trim() ?? '') && el.children.length <= 1) el.style.visibility = 'hidden'; });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: OUT, format: 'Letter', printBackground: true, margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' } });
const text = await page.evaluate(() => document.body.innerText);
console.log(/Riftbound/.test(text) ? 'printed; page text has Riftbound' : 'printed; WARNING no Riftbound in page text');
await browser.close();

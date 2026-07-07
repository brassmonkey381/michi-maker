// Drive the local Expo-web build (localhost:8081) through the core surfaces and
// screenshot each. Usage: node scripts/screenshots.mjs <outSubdir>
// Requires the web dev server running (npm run web) and Microsoft Edge installed.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const SCRATCH = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-poke-michi/dced3129-7ca3-4c03-a98f-9e372f418d5b/scratchpad';
const OUT = `${SCRATCH}/${process.argv[2] ?? 'shots'}`;
mkdirSync(OUT, { recursive: true });
const variant = process.argv[3];
const URL = `http://localhost:8081${variant ? `/?variant=${variant}` : ''}`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const log = (...a) => console.log(...a);
const shot = async (n) => { try { await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 90000, animations: 'disabled' }); log('  shot:', n); } catch (e) { log('  !! shot failed', n, e.message.slice(0, 50)); } };
const tap = async (x, y) => { await page.mouse.click(x, y); };
const press = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); };
const clickText = async (t) => { try { await page.getByText(t, { exact: false }).first().click({ timeout: 4000 }); return true; } catch { return false; } };

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForTimeout(6000);
try { await page.waitForFunction(() => document.body.innerText.includes('inder'), { timeout: 120000 }); } catch {}
await page.waitForTimeout(2000);
await shot('01-home');

await clickText('+ New');
await page.waitForTimeout(3500);
await tap(1250, 24);            // Edit
await page.waitForTimeout(2500);
await shot('03-editor');

await press(493, 396);          // empty pocket -> card picker
await page.waitForTimeout(11000);
await shot('05-cardpicker');

await tap(152, 230);            // shape 1x2 -> artwork/insert
await page.waitForTimeout(2000);
await shot('06-picker-artwork');

await browser.close();
log('done ->', OUT);

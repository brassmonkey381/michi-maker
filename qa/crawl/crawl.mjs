/**
 * THE PHONE CRAWLER (owner, 2026-10-30): walk the whole site on the most common phone shape, tap
 * everything a thumb can tap, judge each screen and each response against qa/crawl/rules.mjs, and
 * write a report with screenshots plus a triage-studio draft for every new finding.
 *
 *   node qa/crawl/crawl.mjs                       guest, every route, 300 actions
 *   node qa/crawl/crawl.mjs --persona free        a fresh free account (the rig makes one)
 *   node qa/crawl/crawl.mjs --routes /welcome,/my-binders --budget 80
 *   node qa/crawl/crawl.mjs --scenario seeded     the Reddit arrival, then its editor
 *   node qa/crawl/crawl.mjs --file-items          also file the new findings in triage-studio (inbox)
 *   node qa/crawl/crawl.mjs --server http://localhost:8090
 *
 * NOT SCHEDULED, by the owner's decision: scripts/crawl-phone.ps1 is the one way to start it.
 *
 * SAFETY. Every context carries the rig's network airlock (qa/lib/guard: payments and ledger writes
 * abort the run), every tap goes through the rig's refusing click, and NEVER_TAP skips anything
 * destructive, paid, or leaving the site by name. The crawl writes what a guest can write: binders
 * and analytics rows on the production project, under a guest or a qa-rig account, which
 * analytics-studio filters. External links are never followed.
 *
 * WHAT IT DOES ON A SCREEN. Measure, judge, then for each tappable thing in reading order: shoot,
 * tap, wait for the first change (up to 3 s), measure, judge the response, shoot if something fired,
 * then put the screen back: Escape closes a sheet, a changed URL is walked back, and a route that
 * will not come back is reloaded. Targets are deduped by name per route so a list of forty cards is
 * one tap, not forty.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

import { install, guardedClick } from '../lib/guard.mjs';
import { resolve, sessionSeed } from '../lib/personas.mjs';
import { VIEWPORTS } from '../lib/targets.mjs';
import { NEVER_TAP, actionFindings, measureScreen, screenFindings } from './rules.mjs';
import { dedupe, keyOf, loadKnown, saveKnown, writeDrafts, writeReport } from './report.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

const SERVER = opt('server', 'http://localhost:8090');
const PERSONA = opt('persona', 'guest');
const BUDGET = Number(opt('budget', 300));
const SCENARIO = opt('scenario', null);
const FILE_ITEMS = flag('file-items');
const VIEWPORT = VIEWPORTS.phone;
const today = new Date().toISOString().slice(0, 10);
const runId = `${today}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}-${PERSONA}`;
const runDir = join(import.meta.dirname, 'out', runId);
mkdirSync(runDir, { recursive: true });

/** Every public route, reading order. Dynamic routes are discovered from links. */
const ROUTES = [
  '/', '/welcome', '/my-binders', '/browse', '/discover', '/daily', '/learn', '/michi-method', '/pricing', '/plans',
  '/contest', '/contest-binders', '/coverage', '/collect', '/wishlist', '/search-guide', '/whats-new', '/feedback',
  '/studio', '/purchases', '/subscriptions', '/legal/terms', '/legal/privacy', '/legal/dmca',
];
const SEEDED = '/?utm_source=reddit&utm_medium=paid_social&utm_campaign=crawl&code=rd_lidi_image';
const routes = SCENARIO === 'seeded' ? [SEEDED] : opt('routes', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? ROUTES;

const log = (...a) => console.log(...a);
const started = Date.now();
const findings = [];
let actions = 0;
let screens = 0;
let shots = 0;
const consoleErrors = [];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let tripped = null;
await install(context, { app: 'michi', capabilities: [], onTrip: (d) => { tripped = d; log('  AIRLOCK TRIPPED', d.rule, d.url); } });

if (PERSONA !== 'guest') {
  const r = await resolve(PERSONA, { runId });
  if (r.kind !== 'signed-in') {
    log(`persona ${PERSONA} unavailable: ${r.note}`);
    process.exit(2);
  }
  const seed = sessionSeed(r.session);
  await context.addInitScript(({ key, value }) => { try { localStorage.setItem(key, value); } catch {} }, seed);
  log(`persona ${PERSONA}: ${r.note}`);
}

const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/favicon|React DevTools|ResizeObserver|Download the React|net::ERR_BLOCKED_BY_CLIENT/i.test(t)) return;
  consoleErrors.push(t);
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
let requests = 0;
page.on('request', (r) => { if (!/\.(png|jpg|jpeg|webp|woff2?|css)(\?|$)/i.test(r.url())) requests += 1; });

const shot = async (label) => {
  shots += 1;
  const p = join(runDir, `${String(shots).padStart(3, '0')}-${label.replace(/[^a-z0-9-]+/gi, '_').slice(0, 50)}.png`);
  await page.screenshot({ path: p, timeout: 30000 }).catch(() => {});
  return p;
};
const wait = (ms) => page.waitForTimeout(ms);
const routeOf = () => {
  const u = new URL(page.url());
  return u.pathname.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/g, '/:id') + (u.search.includes('code=') ? '?seeded' : '');
};
const settle = async () => {
  try { await page.waitForLoadState('domcontentloaded', { timeout: 60000 }); } catch {}
  await wait(2500);
};

async function judgeScreen(route, label) {
  const m = await measureScreen(page);
  screens += 1;
  const fs = screenFindings(m, { persona: PERSONA });
  if (fs.length) {
    const s = await shot(`${route}-${label}`);
    for (const f of fs) findings.push({ ...f, route, action: label, shot: s });
  }
  return m;
}

const click = guardedClick(page, { capabilities: [] });

async function crawlRoute(route) {
  if (actions >= BUDGET) return;
  log(`\n== ${route}`);
  await page.goto(`${SERVER}${route}`, { waitUntil: 'domcontentloaded', timeout: 240000 }).catch((e) => log('  goto failed', e.message.slice(0, 80)));
  await settle();
  const home = page.url();
  const homeRoute = routeOf();
  let m = await judgeScreen(homeRoute, 'arrive');
  const done = new Set();
  let idle = 0;
  for (let round = 0; round < 60 && actions < BUDGET; round += 1) {
    // Re-enumerate every round: the screen changes under us, and a target seen once is tapped once.
    const target = m.targets.find((t) => !t.disabled && !t.coveredBy && !done.has(t.name) && !NEVER_TAP.test(t.name) && t.box.y >= 0 && t.box.y < VIEWPORT.height && t.box.w > 4 && t.box.h > 4);
    if (!target) {
      // Nothing left in view: scroll one screen down and look again, twice, then leave.
      const before = await page.evaluate(() => window.scrollY);
      await page.mouse.wheel(0, VIEWPORT.height * 0.8);
      await wait(600);
      const after = await page.evaluate(() => window.scrollY);
      if (after === before || idle++ > 2) break;
      m = await measureScreen(page);
      continue;
    }
    done.add(target.name);
    actions += 1;
    consoleErrors.length = 0;
    const before = { url: page.url(), textLen: m.textLen, dialogs: m.dialogs, bodyText: m.bodyText, stateSig: m.stateSig };
    requests = 0;
    const label = `${target.testid ?? target.name}`.slice(0, 40);
    log(`  tap ${actions}: ${label}`);
    const sel = target.testid ? `[data-testid="${target.testid}"]` : null;
    const t0 = Date.now();
    let tapped = true;
    try {
      if (sel) await click(sel, { timeout: 4000 });
      else await page.mouse.click(target.box.x + target.box.w / 2, target.box.y + target.box.h / 2);
    } catch (e) {
      tapped = false;
      if (!/BLOCKED CLICK/.test(e.message)) log('   tap failed:', e.message.slice(0, 80));
    }
    if (!tapped) continue;
    // The first change wins the clock; nothing within 3 s is a dead tap.
    let responseMs = -1;
    for (let i = 0; i < 12; i += 1) {
      await wait(250);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => -1);
      if (len !== before.textLen || page.url() !== before.url) {
        responseMs = Date.now() - t0;
        break;
      }
    }
    await wait(900);
    const after = await measureScreen(page).catch(() => null);
    if (!after) {
      log('   page gone; reloading');
      await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 240000 }).catch(() => {});
      await settle();
      m = await measureScreen(page);
      continue;
    }
    const here = routeOf();
    const fs = [
      ...actionFindings({ target, before, after: { url: page.url(), textLen: after.textLen, dialogs: after.dialogs, bodyText: after.bodyText, stateSig: after.stateSig }, responseMs, consoleErrors: [...consoleErrors], dialogClosed: before.dialogs > after.dialogs, requests }),
      ...screenFindings(after, { persona: PERSONA }).map((f) => ({ ...f, rule: f.rule })),
    ];
    if (fs.length) {
      const s = await shot(`${here}-after-${label}`);
      for (const f of fs) findings.push({ ...f, route: here, action: `tap "${target.name}"`, shot: s });
    }
    if (tripped) break;
    // Put the screen back. Escape first, always: the picker and the sheets are not all dialogs,
    // and an open sheet would make every tap after it read as "changed nothing".
    await page.keyboard.press('Escape');
    await wait(700);
    if (page.url() !== home) {
      const newRoute = routeOf();
      if (newRoute !== homeRoute && !SCENARIO) discovered.add(newRoute);
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await wait(1200);
      if (page.url() !== home) {
        await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 240000 }).catch(() => {});
        await settle();
      }
    }
    m = await measureScreen(page).catch(() => m);
  }
}

const discovered = new Set();
for (const r of routes) {
  await crawlRoute(r);
  if (tripped) break;
}
// Routes found by tapping (a binder, a profile): one pass each, no deeper.
for (const r of [...discovered].filter((r) => !routes.includes(r) && !r.includes('?')).slice(0, 8)) {
  if (tripped || actions >= BUDGET) break;
  await crawlRoute(r.replace('/:id', ''));
}

await browser.close();

const known = loadKnown();
const distinct = dedupe(findings);
const fresh = writeReport(runDir, { runId, persona: PERSONA, viewport: VIEWPORT, server: SERVER, started, actions, screens, findings: distinct, known, today });
const filed = writeDrafts(runDir, fresh, { runId, today, persona: PERSONA, viewport: VIEWPORT }, { fileItems: FILE_ITEMS });
for (const f of fresh) known[keyOf(f)] = { first: today, item: f.item ?? null };
saveKnown(known);
writeFileSync(join(runDir, 'console-errors.json'), JSON.stringify(consoleErrors, null, 1));

log(`\n${distinct.length} distinct finding(s), ${fresh.length} new, ${actions} actions over ${screens} screens in ${Math.round((Date.now() - started) / 1000)}s`);
log(`report: ${join(runDir, 'report.md')}`);
if (filed.length) log(`filed in triage-studio: ${filed.join(', ')}`);
if (tripped) {
  log('AIRLOCK TRIPPED: the run is void, see the rule above');
  process.exit(4);
}

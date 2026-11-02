// My Binders search reaches page titles (owner, 2026-11-02), on the phone size, as the test
// account: find one of its pages with a title no binder title shares, type it, expect the tile
// with the "p. N · title" hit, tap it, land on that page.
//   node scripts/lab/page-title-search-run.mjs     (dev server on :8090)
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

import { sessionSeed } from '../../qa/lib/personas.mjs';

const kv = (p) => Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const secrets = kv('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets');
const env = kv('C:/Users/Brian/source/repos/tcgscan/michi-maker/.env');
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan-michi-maker/2dc325a1-a236-47eb-9ab0-6fac1583581e/scratchpad/page-title-search';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);
let failures = 0;
const check = (label, ok, extra = '') => { log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' ' + extra : ''}`); if (!ok) failures += 1; };

const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: secrets.MICHI_TEST_EMAIL, password: secrets.MICHI_TEST_PASSWORD }) }).then((r) => r.json());
if (!session.access_token) { log('sign-in failed'); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${session.access_token}` };
// The shelf search only shows from four binders up; the test account keeps one. Seed three
// throwaway binders with titled pages (one with a distinct page title to probe), removed at the end.
const JH = { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const SEEDS = [
  { title: 'Lab shelf A', pages: ['Opening page', 'Lab Pikachu probe page'] },
  { title: 'Lab shelf B', pages: ['Opening page'] },
  { title: 'Lab shelf C', pages: [] },
];
const seeded = [];
for (const seed of SEEDS) {
  const [b] = await fetch(`${URL_}/rest/v1/binders`, { method: 'POST', headers: JH, body: JSON.stringify({ title: seed.title }) }).then((r) => r.json());
  if (!b?.id) { log('seed failed', seed.title); process.exit(2); }
  seeded.push(b.id);
  for (let i = 0; i < seed.pages.length; i += 1) {
    await fetch(`${URL_}/rest/v1/binder_pages`, { method: 'POST', headers: JH, body: JSON.stringify({ binder_id: b.id, position: i, title: seed.pages[i] }) });
  }
}
const teardown = async () => { for (const id of seeded) await fetch(`${URL_}/rest/v1/binders?id=eq.${id}`, { method: 'DELETE', headers: H }); log(`  removed ${seeded.length} seeded binders`); };
const binders = await fetch(`${URL_}/rest/v1/binders?select=id,title,archived_at&owner_id=eq.${session.user.id}&archived_at=is.null`, { headers: H }).then((r) => r.json());
const pages = await fetch(`${URL_}/rest/v1/binder_pages?select=binder_id,position,title&binder_id=in.(${binders.map((b) => b.id).join(',')})&title=not.is.null`, { headers: H }).then((r) => r.json());
log(`  test account: ${binders.length} binders, ${pages.length} titled pages`);
// A page title that is NOT a substring of any binder title or any other page's title, so one tile shows.
const titles = binders.map((b) => b.title.toLowerCase());
const probe = pages.find((p) => p.title === 'Lab Pikachu probe page') ?? pages.find((p) => p.title.trim().length >= 5 && !titles.some((t) => t.includes(p.title.trim().toLowerCase())) && pages.filter((o) => o.title.toLowerCase().includes(p.title.trim().toLowerCase())).length === 1);
if (!probe) { log('no page title is unique enough to probe'); await teardown(); process.exit(2); }
const binder = binders.find((b) => b.id === probe.binder_id);
log(`  probe: "${probe.title}" (page ${probe.position + 1} of "${binder.title}")`);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(({ key, value }) => { try { localStorage.setItem(key, value); } catch {} }, sessionSeed(session));
const page = await ctx.newPage();
await page.goto('http://localhost:8090/my-binders', { waitUntil: 'domcontentloaded', timeout: 240000 });
const search = page.locator('input[placeholder^="Search your"]').first();
await search.waitFor({ timeout: 240000 }).catch(() => log('  no shelf search field (fewer than 4 binders?)'));
await page.waitForTimeout(1500);
await search.fill(probe.title.trim());
await page.waitForTimeout(1200);
const hitText = `p. ${probe.position + 1} · ${probe.title.trim()}`;
const hit = page.getByText(hitText, { exact: true }).first();
check('one tile shows the page hit under it', (await hit.count()) === 1, `("${hitText}")`);
check('the tile is the right binder', (await page.getByText(binder.title, { exact: true }).count()) >= 1);
await page.screenshot({ path: `${OUT}/01-hit.png` });
await hit.tap({ timeout: 8000 }).catch(async () => { log('  tap intercepted; dispatching'); await hit.dispatchEvent('click'); });
await page.waitForURL((u) => u.pathname.startsWith(`/binder/${binder.id}`), { timeout: 60000 }).catch(() => {});
check('tapping it opens the binder on that page', new URL(page.url()).searchParams.get('page') === String(probe.position + 1), `(${page.url()})`);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/02-opened.png` });
// A title hit shows no page line.
await page.goto('http://localhost:8090/my-binders', { waitUntil: 'domcontentloaded', timeout: 240000 });
await search.waitFor({ timeout: 240000 });
await search.fill(binder.title);
await page.waitForTimeout(1200);
check('a binder-title hit shows no page line', (await page.locator('text=/^p\\. \\d+ · /').count()) === 0);
check('a miss empties the shelf with the query named', (await search.fill('zzqx-nothing'), await page.waitForTimeout(900), (await page.getByText(/No .*binders match/).count()) === 1));
await browser.close();
await teardown();
log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);

// MIC-037 front-door check: the TRI-007 routing matrix (landing CTAs, auth returns, member vs guest on
// "/", deep links, back/forward) re-pointed at the new "/" (the static landing unless the mm_app cookie
// is set), plus the crawler and cookie rows. Runs at 1440 and 390 (iPhone UA).
// Read-only: sign-up, token refresh/verify, analytics writes, the landing beacon and ad pixels are
// blocked; the member session is a fake localStorage entry whose token calls are blocked.
// Usage: BASE=http://localhost:8110 node scripts/seo/front-door-check.mjs   (default https://michi-maker.com)
// Exits 1 when any row fails.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const BASE = (process.env.BASE || 'https://michi-maker.com').replace(/\/+$/, '');
const BLOCK = ['**/auth/v1/signup*', '**/auth/v1/token*', '**/auth/v1/user*', '**/auth/v1/logout*', '**/auth/v1/verify*',
  '**/rest/v1/analytics_*', '**/rpc/log_landing_view*', '**/rpc/log_*', '**/functions/v1/*capi*', '**/redditstatic.com/**',
  '**/*.reddit.com/**', '**/_vercel/insights/**', 'https://biboscan.com/**'];
const UUID = '3f1c2a9e-5b7d-4e21-9c3a-1b2c3d4e5f60';
const memberJson = (anon) => JSON.stringify({ access_token: 'qa', refresh_token: 'qa', expires_at: 4102444800, user: { id: '00000000-0000-0000-0000-000000000000', is_anonymous: anon } });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const QA = 'utm_medium=qa';
const b = await chromium.launch({ channel: 'chrome' });
const rows = [];

async function run(name, w, fn, init) {
  const opts = w === 390
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE }
    : { viewport: { width: 1440, height: 900 } };
  const ctx = await b.newContext(opts);
  for (const pat of BLOCK) await ctx.route(pat, (r) => r.abort());
  // No writes reach production from a check: every non-GET to the database or storage is refused.
  await ctx.route(/supabase\.co\/(rest|storage)\/v1\//, (r) => (r.request().method() === 'GET' || r.request().method() === 'HEAD' ? r.fallback() : r.fulfill({ status: 403, body: '{}' })));
  if (init?.storage) await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem('qa-init')) { localStorage.setItem(k, v); sessionStorage.setItem('qa-init', '1'); } } catch {} }, init.storage);
  if (init?.cookie) await ctx.addCookies([{ name: 'mm_app', value: '1', url: BASE }]);
  const p = await ctx.newPage();
  const docs = [];
  p.on('request', (r) => { if (r.resourceType() === 'document') docs.push(r.url()); });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 80)));
  let res;
  try { res = await fn(p, ctx, docs); } catch (e) { res = { pass: false, note: 'threw: ' + e.message.slice(0, 100) }; }
  rows.push({ name, w, ...res, errors: errors.length });
  await ctx.close();
}
const settle = (p, ms = 6000) => p.waitForTimeout(ms);
const where = (p) => { const u = new URL(p.url()); return u.pathname + u.search + u.hash; };
/** The static landing is on screen (its CTAs, and no app root). */
const onLanding = async (p) => (await p.locator('a[data-cta="enter_hero"]').count()) > 0 && (await p.locator('#root').count()) === 0;
const inApp = async (p) => (await p.locator('#root').count()) > 0 && !(await onLanding(p));
const hasCookie = async (ctx) => (await ctx.cookies(BASE)).some((c) => c.name === 'mm_app');

// No browser: what a crawler (or anyone without JavaScript) gets at "/".
for (const [label, ua] of [['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'], ['browser', IPHONE]]) {
  const r = await fetch(`${BASE}/`, { headers: { 'user-agent': ua }, redirect: 'manual' });
  const html = await r.text();
  const pass = r.status === 200 && /<link rel="canonical" href="https:\/\/michi-maker\.com\/">/.test(html)
    && /data-cta="enter_hero"/.test(html) && !/_expo\/static\/js/.test(html) && /<title>Michi-Maker/.test(html);
  rows.push({ name: `0 raw "/" for ${label}: landing HTML, title, canonical, no app bundle`, w: '-', pass, note: `${r.status} ${html.length} bytes` });
}
{
  const r = await fetch(`${BASE}/`, { headers: { cookie: 'mm_app=1' }, redirect: 'manual' });
  const html = await r.text();
  rows.push({ name: '0 raw "/" with mm_app: the app shell', w: '-', pass: r.status === 200 && /_expo\/static\/js\/web\/entry-/.test(html) && !/data-cta=/.test(html), note: `${r.status}` });
  const wl = await fetch(`${BASE}/welcome?utm_source=x`, { redirect: 'manual' });
  rows.push({ name: '0 /welcome -> 308 /', w: '-', pass: [301, 308].includes(wl.status) && /^(https?:\/\/[^/]+)?\/\?utm_source=x$/.test(wl.headers.get('location') || ''), note: `${wl.status} ${wl.headers.get('location')}` });
}

for (const w of [1440, 390]) {
  await run('1 first visit "/" -> landing at "/", utm kept, no app loaded, no cookie', w, async (p, ctx, docs) => {
    await p.goto(`${BASE}/?utm_source=qa_m&${QA}`); await settle(p, 4000);
    return { pass: (await onLanding(p)) && where(p).startsWith('/?utm_source=qa_m') && docs.length === 1 && !(await hasCookie(ctx)), note: `${where(p)} docs=${docs.length}` };
  });
  await run('1 campaign ?code=qa_code1 -> landing', w, async (p) => {
    await p.goto(`${BASE}/?code=qa_code1&${QA}`); await settle(p, 4000);
    return { pass: await onLanding(p), note: where(p) };
  });
  await run('1 hero Start a binder -> app at "/", no loop; next "/" is the app', w, async (p, ctx) => {
    await p.goto(`${BASE}/?${QA}`); await settle(p, 4000);
    await p.locator('a[data-cta="enter_hero"]').nth(1).click(); await settle(p);
    const a = where(p); const first = await inApp(p);
    await p.goto(`${BASE}/`); await settle(p);
    return { pass: first && (await inApp(p)) && !/from=landing/.test(a) && (await hasCookie(ctx)), note: `${a} then / -> ${where(p)}` };
  });
  await run('1 closing Start a binder -> app', w, async (p) => {
    await p.goto(`${BASE}/?${QA}`); await settle(p, 4000);
    await p.locator('a[data-cta="enter_closing"]').click(); await settle(p);
    return { pass: await inApp(p), note: where(p) };
  });
  await run('1 nav Start a binder -> app', w, async (p) => {
    await p.goto(`${BASE}/?${QA}`); await settle(p, 4000);
    await p.locator('a[data-cta="enter_hero"]').first().click(); await settle(p);
    return { pass: await inApp(p), note: where(p) };
  });
  await run('1 See some binders -> /discover', w, async (p) => {
    await p.goto(`${BASE}/?${QA}`); await settle(p, 4000);
    await p.locator('a[data-cta="discover"]').first().click(); await settle(p);
    return { pass: new URL(p.url()).pathname === '/discover' && (await inApp(p)), note: where(p) };
  });
  for (const f of ['discover', 'whats-new', 'michi-method']) {
    await run(`1 footer ${f}`, w, async (p) => {
      await p.goto(`${BASE}/?${QA}`); await settle(p, 4000);
      await p.locator(`a[href="/${f}"]`).last().click(); await settle(p);
      const seen = await p.evaluate(() => localStorage.getItem('michi.landing.seen'));
      return { pass: new URL(p.url()).pathname === `/${f}` && seen === '1', note: `${where(p)} seen=${seen}` };
    });
  }
  for (const [label, q] of [
    ['?code=<uuid> (PKCE fell back to Site URL)', `/?code=${UUID}`],
    ['#access_token magic link', '/#access_token=qa&token_type=bearer&type=magiclink'],
    ['#error=access_denied', '/#error=access_denied&error_description=denied'],
    ['?error=access_denied', '/?error=access_denied&error_description=denied'],
    ['#type=recovery reset', '/#access_token=qa&type=recovery'],
    ['?token_hash email confirm', '/?token_hash=qa&type=signup'],
    ['#th= BiBo ticket', '/#th=qa'],
  ]) {
    await run(`2 auth return ${label} -> app (one reload), params reach it`, w, async (p, ctx, docs) => {
      await p.goto(`${BASE}${q}`); await settle(p);
      const d = docs.filter((u) => !u.includes('/my-binders')).length;
      return { pass: (await inApp(p)) && d <= 2, note: `${where(p)} docs=${docs.length}` };
    });
  }
  await run('2 /auth-callback?error=access_denied -> not landing', w, async (p) => {
    await p.goto(`${BASE}/auth-callback?error=access_denied&error_description=denied`); await settle(p, 8000);
    return { pass: !(await onLanding(p)), note: where(p) };
  });
  await run('4 member session on "/" (no seen flag, no cookie) -> app; cookie set', w, async (p, ctx) => {
    await p.goto(`${BASE}/`); await settle(p);
    return { pass: (await inApp(p)) && (await hasCookie(ctx)), note: where(p) };
  }, { storage: ['sb-piikwvntldytjejxmcla-auth-token', memberJson(false)] });
  await run('4 anonymous guest session on "/" -> landing', w, async (p) => {
    await p.goto(`${BASE}/`); await settle(p, 4000);
    return { pass: await onLanding(p), note: where(p) };
  }, { storage: ['sb-piikwvntldytjejxmcla-auth-token', memberJson(true)] });
  await run('7 returning visitor (seen, no cookie yet) on "/" -> app after one reload', w, async (p, ctx, docs) => {
    await p.goto(`${BASE}/`); await settle(p);
    return { pass: (await inApp(p)) && new URL(p.url()).pathname === '/' && docs.length === 2 && (await hasCookie(ctx)), note: `${where(p)} docs=${docs.length}` };
  }, { storage: ['michi.landing.seen', '1'] });
  await run('7 returning visitor with mm_app on "/" -> app straight away', w, async (p, ctx, docs) => {
    await p.goto(`${BASE}/`); await settle(p);
    return { pass: (await inApp(p)) && docs.length === 1, note: `${where(p)} docs=${docs.length}` };
  }, { storage: ['michi.landing.seen', '1'], cookie: true });
  await run('7 Reddit ad arrival on "/" -> app skip target, not the landing', w, async (p) => {
    await p.goto(`${BASE}/?utm_source=reddit&utm_campaign=qa&${QA}`); await settle(p, 8000);
    // Phones get the wizard, desktops the seeded binder, which opens straight into its editor.
    return { pass: (await inApp(p)) && (/\/(new-binder|my-binders)/.test(new URL(p.url()).pathname) || /seeded=1/.test(p.url())), note: where(p) };
  });
  for (const d of ['/discover', '/whats-new', '/plans?bundle=1', '/collect', '/u/fakemichi', '/michi-method', '/sets', '/learn']) {
    await run(`6 deep link ${d} (fresh) -> its page`, w, async (p) => {
      await p.goto(`${BASE}${d}${d.includes('?') ? '&' : '?'}${QA}`); await settle(p);
      return { pass: !(await onLanding(p)) && new URL(p.url()).pathname === d.split('?')[0], note: where(p) };
    });
  }
  await run('7 back/forward landing <-> app', w, async (p) => {
    await p.goto(`${BASE}/?${QA}`); await settle(p, 4000);
    await p.locator('a[data-cta="enter_hero"]').nth(1).click(); await settle(p);
    await p.goBack(); await settle(p, 3000); const back = where(p);
    await p.goForward(); await settle(p); const fwd = where(p);
    return { pass: await inApp(p), note: `back ${back} / fwd ${fwd}` };
  });
  await run('7 /landing-v2/ still shows the landing to a returning visitor (no gate there)', w, async (p) => {
    await p.goto(`${BASE}/landing-v2/`); await settle(p, 4000);
    return { pass: (await onLanding(p)) && /landing-v2/.test(p.url()), note: where(p) };
  }, { storage: ['michi.landing.seen', '1'], cookie: true });
}
await b.close();
for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.w} | ${r.name} | ${r.note}${r.errors ? ` | pageerrors=${r.errors}` : ''}`);
const passed = rows.filter((r) => r.pass).length;
console.log(`TOTAL ${passed}/${rows.length}`);
process.exitCode = passed === rows.length ? 0 : 1;

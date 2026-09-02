// Does the catalog warm on a page that never asks for it?
//
// Lands on /my-binders, which mounts no catalog consumer, and watches the network for the gated
// catalog fetch. Then reloads to prove the second visit is served from the encrypted local cache
// rather than the network, which is the fact that makes warming every page cheap.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = process.env.MICHI_BASE ?? 'http://localhost:8088';
const PROJECT = 'piikwvntldytjejxmcla';
const raw = readFileSync('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets', 'utf8');
const read = (k) => {
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(`${k}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim() : null;
};
const anon = read('APP_PUBLISHABLE_KEY');
const session = await (
  await fetch(`https://${PROJECT}.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: read('MICHI_TEST_EMAIL'), password: read('MICHI_TEST_PASSWORD') }),
  })
).json();

const b = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
await ctx.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
  key: `sb-${PROJECT}-auth-token`,
  value: JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: session.user,
  }),
});
const p = await ctx.newPage();

const hits = [];
p.on('request', (r) => {
  const u = r.url();
  if (/catalog-key|catalog\.enc|catalog\.json/.test(u)) hits.push(u.split('?')[0].slice(-40));
});

let ok = true;
const check = (pass, msg) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!pass) ok = false;
};

// A page with no catalog consumer at all.
await p.goto(`${BASE}/my-binders`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForTimeout(20000);
check(hits.length > 0, `the catalog warms on /my-binders without being asked (${hits.length} requests)`);
console.log('   ', hits.join('\n    '));

// A HARD reload of another page: the app restarts, so the in-memory catalog is gone and the warm
// runs again. It should re-check the version over the network and then serve the blob from the
// encrypted local cache — that skip is what makes warming every page cheap. (Client-side route
// changes do not even get this far; the singleton is still in memory.)
hits.length = 0;
await p.goto(`${BASE}/discover`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForTimeout(15000);
const enc = hits.filter((h) => h.includes('catalog.enc')).length;
const key = hits.filter((h) => h.includes('catalog-key')).length;
check(key > 0, `a reload re-checks the catalog version (${key} key request)`);
check(enc === 0, `and does NOT re-download the blob (${enc} catalog.enc requests)`);

await b.close();
console.log(ok ? '\nPASS' : '\nFAILED');
process.exit(ok ? 0 : 1);

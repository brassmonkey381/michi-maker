// Freeze reproduction + profile: load michi-maker web (dev) SIGNED IN, measure main-thread
// blockage (longtasks + event-loop probes), CPU-profile the load, then reload (the
// tab-discard refocus path) and measure again. Run from the repo root: node <this file>
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const SUPA = 'https://piikwvntldytjejxmcla.supabase.co';
const KEY = readFileSync('.env', 'utf8').match(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)/)[1].trim();
const EMAIL = process.env.FREEZE_EMAIL ?? 'freeze-test-1784256702@example.com';
const PASS = 'freeze-test-Pass1!';
const APP = 'http://localhost:8081';
const OUT = 'scripts/';

// ── sign in via REST to build the persisted-session localStorage entry ─────
const tok = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
}).then((r) => r.json());
if (!tok.access_token) throw new Error('sign-in failed: ' + JSON.stringify(tok).slice(0, 200));
const stored = { ...tok, expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600) };
const STORAGE_KEY = 'sb-piikwvntldytjejxmcla-auth-token';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(
  ([k, v]) => {
    localStorage.setItem(k, v);
    // Collect long main-thread tasks from the very start.
    window.__long = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__long.push({ s: Math.round(e.startTime), d: Math.round(e.duration) });
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  },
  [STORAGE_KEY, JSON.stringify(stored)],
);

const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (/catalog|freeze|poke-michi|error/i.test(t)) console.log('  [console]', t.slice(0, 160));
});
const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });

async function measure(label, seconds) {
  console.log(`\n== ${label}: probing responsiveness for ${seconds}s ==`);
  const gaps = [];
  const t0 = Date.now();
  let last = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    try {
      await page.evaluate('1'); // stalls while the main thread is blocked
      const now = Date.now();
      const gap = now - last;
      if (gap > 1500) {
        gaps.push({ at: Math.round((last - t0) / 1000), blockedMs: gap });
        console.log(`  main thread blocked ~${(gap / 1000).toFixed(1)}s (at t+${Math.round((last - t0) / 1000)}s)`);
      }
      last = now;
    } catch (e) {
      console.log('  probe error:', String(e).slice(0, 120));
      last = Date.now();
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const long = await page.evaluate('window.__long ?? []').catch(() => []);
  const totalLong = long.reduce((a, b) => a + b.d, 0);
  const worst = long.slice().sort((a, b) => b.d - a.d).slice(0, 8);
  console.log(`  longtasks: ${long.length} totaling ${(totalLong / 1000).toFixed(1)}s; worst:`, worst);
  return { gaps, long };
}

console.log('navigating (dev bundle may take a while on first hit)…');
await cdp.send('Profiler.start');
await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 300000 });
await measure('initial load', 150);
const { profile } = await cdp.send('Profiler.stop');
writeFileSync(OUT + 'freeze-initial.cpuprofile', JSON.stringify(profile));

// summarize hot self-time
function hot(profile, n = 14) {
  const nodes = new Map(profile.nodes.map((nd) => [nd.id, nd]));
  const self = new Map();
  const interval = 500; // µs (sampling interval)
  for (const id of profile.samples) {
    const nd = nodes.get(id);
    if (!nd) continue;
    const f = nd.callFrame;
    const key = `${f.functionName || '(anon)'} @ ${(f.url || '').split('/').slice(-1)[0]}:${f.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + interval / 1000);
  }
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, ms]) => `${(ms / 1000).toFixed(1)}s  ${k}`);
}
console.log('\n== hottest frames (self time), initial load ==');
console.log(hot(profile).join('\n'));

// ── the refocus/discard path: full reload with everything warm-cached ──────
await page.evaluate('window.__long = []');
await cdp.send('Profiler.start');
await page.reload({ waitUntil: 'domcontentloaded', timeout: 300000 });
await measure('reload (discard-refocus path)', 120);
const { profile: p2 } = await cdp.send('Profiler.stop');
writeFileSync(OUT + 'freeze-reload.cpuprofile', JSON.stringify(p2));
console.log('\n== hottest frames (self time), reload ==');
console.log(hot(p2).join('\n'));

// memory footprint — the tab-discard trigger
const mem = await page.evaluate('performance.memory ? { usedMB: Math.round(performance.memory.usedJSHeapSize/1048576), totalMB: Math.round(performance.memory.totalJSHeapSize/1048576) } : null');
console.log('\nJS heap:', mem);

await browser.close();
console.log('\ndone. profiles saved next to this script.');

/**
 * MIC-037: "/" is the static landing for a first visit and every crawler, and the app for anyone
 * who has been in. The landing's gate (api/_landingGate.js) makes that call in the browser with the
 * app's own TRI-007 rules; vercel.json makes it on the server from the mm_app cookie alone.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { michiLandingGate, gateScript } = require('../../api/_landingGate.js');

type Opts = { url?: string; store?: Record<string, string> | 'throws'; session?: 'throws' | Record<string, string>; cookies?: boolean };

function fakeWindow(o: Opts = {}) {
  const u = new URL(o.url ?? 'https://michi-maker.com/');
  const calls: string[] = [];
  const store = o.store === 'throws' ? null : { ...(o.store ?? {}) };
  const sess = o.session === 'throws' ? null : { ...(o.session ?? {}) };
  let cookie = '';
  const w = {
    URLSearchParams,
    location: {
      search: u.search,
      hash: u.hash,
      protocol: u.protocol,
      reload: () => calls.push('reload'),
      replace: (to: string) => calls.push(`replace ${to}`),
    },
    document: {
      documentElement: { style: { visibility: '' } },
      get cookie() { return cookie; },
      set cookie(v: string) { if (o.cookies !== false) cookie = v.split(';')[0]; },
    },
    setTimeout: () => 0,
    get localStorage() {
      if (!store) throw new Error('SecurityError');
      const keys = Object.keys(store);
      return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => store[k] ?? null };
    },
    get sessionStorage() {
      if (!sess) throw new Error('SecurityError');
      return { getItem: (k: string) => sess[k] ?? null, setItem: (k: string, v: string) => { sess[k] = v; } };
    },
  };
  return { w, calls, cookie: () => cookie };
}

const member = (anon: boolean) => JSON.stringify({ user: { id: 'u', is_anonymous: anon } });
const UUID = '3f1c2a9e-5b7d-4e21-9c3a-1b2c3d4e5f60';

test('a first visit and a crawler stay on the landing, with no cookie and no reload', () => {
  for (const url of ['https://michi-maker.com/', 'https://michi-maker.com/?utm_source=google&utm_medium=cpc', 'https://michi-maker.com/?code=flyer_q4']) {
    const f = fakeWindow({ url });
    assert.equal(michiLandingGate(f.w), 'landing', url);
    assert.deepEqual(f.calls, []);
    assert.equal(f.cookie(), '');
  }
  const anon = fakeWindow({ store: { 'sb-piikwvntldytjejxmcla-auth-token': member(true) } });
  assert.equal(michiLandingGate(anon.w), 'landing', 'an anonymous guest session is still a first visit');
});

test('everyone the app would not show the landing to is sent into the app (TRI-007 rules)', () => {
  const cases: [string, Opts][] = [
    ['seen flag', { store: { 'michi.landing.seen': '1' } }],
    ['member session', { store: { 'sb-piikwvntldytjejxmcla-auth-token': member(false) } }],
    ['storage unreadable', { store: 'throws' }],
    ['PKCE ?code=<uuid>', { url: `https://michi-maker.com/?code=${UUID}` }],
    ['?error', { url: 'https://michi-maker.com/?error=access_denied' }],
    ['?token_hash', { url: 'https://michi-maker.com/?token_hash=x&type=signup' }],
    ['#access_token', { url: 'https://michi-maker.com/#access_token=x&type=magiclink' }],
    ['#error', { url: 'https://michi-maker.com/#error=access_denied' }],
    ['#type=recovery', { url: 'https://michi-maker.com/#access_token=x&type=recovery' }],
    ['#th BiBo ticket', { url: 'https://michi-maker.com/#th=x' }],
    ['Reddit ad arrival', { url: 'https://michi-maker.com/?utm_source=Reddit&utm_campaign=x' }],
  ];
  for (const [name, o] of cases) {
    const f = fakeWindow(o);
    assert.equal(michiLandingGate(f.w), 'reload', name);
    assert.deepEqual(f.calls, ['reload'], `${name}: reloads the same URL, hash and query kept`);
    assert.equal(f.cookie(), 'mm_app=1', `${name}: sets the cookie the server reads`);
  }
});

test('it can never loop: blocked cookies or a second pass go to /my-binders with the URL intact', () => {
  const blocked = fakeWindow({ url: 'https://michi-maker.com/?x=1#th=abc', store: { 'michi.landing.seen': '1' }, cookies: false });
  assert.equal(michiLandingGate(blocked.w), 'fallback');
  assert.deepEqual(blocked.calls, ['replace /my-binders?x=1#th=abc']);

  const again = fakeWindow({ store: { 'michi.landing.seen': '1' }, session: { mm_gate: String(Date.now() - 2000) } });
  assert.equal(michiLandingGate(again.w), 'fallback');

  const old = fakeWindow({ store: { 'michi.landing.seen': '1' }, session: { mm_gate: String(Date.now() - 60000) } });
  assert.equal(michiLandingGate(old.w), 'reload', 'a reload long ago does not count');

  const noSession = fakeWindow({ store: { 'michi.landing.seen': '1' }, session: 'throws' });
  assert.equal(michiLandingGate(noSession.w), 'fallback', 'no sessionStorage: no reload it cannot count');
});

test('the serialized gate is self-contained ES5 that runs on its own', () => {
  const tag = gateScript();
  assert.match(tag, /^<script>[\s\S]*\(window\);<\/script>$/);
  assert.doesNotMatch(tag, /=>|\blet\b|\bconst\b|`/, 'no arrow functions, let/const or template strings');
  const body = tag.replace(/^<script>/, '').replace(/<\/script>$/, '');
  const f = fakeWindow({ store: { 'michi.landing.seen': '1' } });
  new Function('window', body)(f.w);
  assert.deepEqual(f.calls, ['reload']);
});

test('vercel.json: "/" is the app only with the mm_app cookie, otherwise the landing; never by user agent', () => {
  const v = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
    rewrites: { source: string; destination: string; has?: { type: string; key?: string }[] }[];
    redirects: { source: string; destination: string; has?: unknown[] }[];
  };
  const root = v.rewrites.filter((r) => r.source === '/');
  assert.equal(root.length, 2);
  assert.deepEqual(root[0].has, [{ type: 'cookie', key: 'mm_app' }]);
  assert.equal(root[0].destination, '/app');
  assert.equal(root[1].has, undefined);
  assert.equal(root[1].destination, '/home');
  assert.ok(v.rewrites.indexOf(root[0]) < v.rewrites.indexOf(root[1]), 'the cookie rule is checked first');
  assert.ok(v.redirects.some((r) => !r.has && r.source === '/welcome' && r.destination === '/'));
});

test('vercel.json: with cleanUrls, no rewrite names an .html file other than an index (it never matches on Vercel)', () => {
  // 2026-11-18: rewrites to /app.html and /home.html shipped, matched nothing under cleanUrls, and "/" plus
  // every app route served the 404 page until the rollback. index.html is the one name Vercel still resolves.
  const v = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
    cleanUrls?: boolean;
    rewrites: { source: string; destination: string }[];
    redirects: { source: string }[];
  };
  assert.equal(v.cleanUrls, true);
  for (const r of v.rewrites) {
    if (/^https?:/.test(r.destination)) continue;
    const p = r.destination.split('?')[0];
    assert.ok(!/\.html$/i.test(p) || /(^|\/)index\.html$/.test(p), `${r.source} -> ${r.destination}`);
  }
  // A rewrite target must not also be a redirect source, or which one wins is Vercel's call, not ours.
  for (const d of ['/app', '/home']) assert.ok(!v.redirects.some((r) => r.source === d), `${d} is not redirected`);
});

test('the landing copy carries the canonical, share tags and sets the cookie on its way into the app', () => {
  const html = readFileSync(path.join(ROOT, 'public/landing-v2/index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/michi-maker\.com\/">/);
  assert.match(html, /property="og:image" content="https:\/\/michi-maker\.com\/og\.png"/);
  assert.match(html, /document\.cookie = 'mm_app=1; Path=\//);
  assert.doesNotMatch(html, /_expo\/static\/js/);
  const shown = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(shown, /\bPRO\b|\bVIP\b|free tries|\$\d/, 'no plan names, tries or prices (owner rule 2026-11-18)');
});

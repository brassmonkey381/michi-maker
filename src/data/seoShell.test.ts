/**
 * MIC-037 (SEO plan actions 1, 3, 4): what a crawler reads.
 *
 * 1. compose() puts the readable body into the REAL shell. On 2026-11-07 the shell gained a loading
 *    splash inside #root, compose() matched the literal `<div id="root"></div>`, and every binder,
 *    guide and the explainer served "Michi-Maker / Loading" for a week with every test green. The
 *    shell below is built from the splash scripts/inject-meta.mjs actually writes, so a new splash
 *    is tested as soon as it exists.
 * 2. Only real pages are indexed: hidden (daily puzzle) binders, thin and unnamed ones are not.
 * 3. Every route the app has is served; anything else is a real 404; no rewrite branches on a
 *    search engine's user agent.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { compose, isPlainShell } = require('../../api/_shell.js');
const { indexDecision, MIN_FILLED } = require('../../api/_index.js');
const { pages } = require('../../api/page-static.js');

/** The splash markup inject-meta.mjs writes into #root, read from the script itself. */
function splash(): string {
  const src = readFileSync(path.join(ROOT, 'scripts/inject-meta.mjs'), 'utf8');
  const m = /const SPLASH = `([\s\S]*?)`;/.exec(src);
  assert.ok(m, 'inject-meta.mjs still defines SPLASH');
  return m[1];
}

/** Expo's single-file template after inject-meta: splash inside #root, the bundle after it. */
function realShell(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Michi-Maker: build beautiful Pokémon card binders</title>
    <meta name="description" content="shell description" />
    <meta property="og:title" content="shell og" />
  </head>
  <body>
    <noscript>
      You need to enable JavaScript to run this app.
    </noscript>
    <div id="root">
    ${splash()}
  </div>
  <script src="/_expo/static/js/web/entry-abc.js" defer></script>
  </body>
</html>`;
}

const rootOf = (html: string) => {
  const start = html.indexOf('<div id="root">') + '<div id="root">'.length;
  const end = html.indexOf('<script src="/_expo');
  return html.slice(start, end);
};

test('compose() puts the readable body in #root of the shell as built, splash and all', () => {
  const shell = realShell();
  assert.ok(shell.includes('id="boot"'), 'the fixture carries the splash');
  const out = compose(shell, { head: '<title>Page</title>', body: '<main id="seo"><h1>Hello</h1></main>' });
  assert.match(out, /<main id="seo"><h1>Hello<\/h1><\/main>/);
  assert.doesNotMatch(out, /id="boot"/, 'the body replaces the splash, it does not sit under it');
  assert.match(rootOf(out), /^<main id="seo"><h1>Hello<\/h1><\/main><\/div>\s*$/, '#root holds exactly the body');
  assert.match(out, /<script src="\/_expo\/static\/js\/web\/entry-abc\.js" defer><\/script>/, 'the app still boots');
  assert.equal((out.match(/<title>/g) ?? []).length, 1, "one title: the page's own");
  assert.doesNotMatch(out, /noscript/);
});

test('compose() also handles the empty #root of a shell without the splash', () => {
  const out = compose('<html><head></head><body><div id="root"></div><script src="a.js"></script></body></html>', {
    head: '',
    body: '<main id="seo">x</main>',
  });
  assert.match(out, /<div id="root"><main id="seo">x<\/main><\/div><script/);
});

test('compose() refuses to drop a body silently', () => {
  assert.throws(() => compose('<html><head></head><body></body></html>', { head: '', body: '<main id="seo"></main>' }));
});

test('every page the functions and the build compose has its body, a canonical and clean copy', async () => {
  const shell = realShell();
  const examples = [{ id: 'b1', title: 'Eeveelutions', pages: 3, filled: 27 }];
  const built = {
    home: pages.homePage(),
    'michi-method': await pages.michiMethod({ examples }),
    learn: pages.learnHub(),
    guide: pages.guide('print-binder'),
  };
  for (const [name, page] of Object.entries(built)) {
    const html = compose(shell, page);
    assert.ok(isPlainShell(shell) && !isPlainShell(html), `${name}: composed output is not mistaken for the shell`);
    assert.match(html, /<main id="seo">/, `${name}: body present`);
    assert.match(html, /<h1>/, `${name}: has an h1`);
    assert.match(html, /<link rel="canonical" href="https:\/\/michi-maker\.com\//, `${name}: apex canonical`);
    assert.doesNotMatch(html, /poke-michi/, `${name}: no Expo app name in the title`);
    const text = page.body.replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /—/, `${name}: no em dashes in copy`);
    assert.doesNotMatch(text, /\bPRO\b|\bVIP\b/, `${name}: no plan names to guests`);
  }
  assert.match(built.home.head, /<title>Michi-Maker: free Pokémon card binder planner and page builder<\/title>/);
  assert.match(built.home.head, /href="https:\/\/michi-maker\.com\/"/);
  assert.match(built['michi-method'].body, /href="https:\/\/michi-maker\.com\/binder\/b1">Eeveelutions<\/a>/, 'links the example binders');
  assert.match(built['michi-method'].body, /@peeplop/, 'credits Michi');
  assert.match(built['michi-method'].body, /12 pockets/);
  assert.match(built['michi-method'].body, /63 by 88 mm/);
});

/* ---- which binders are indexed */

const slots = (n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({ card_id: `c${i}`, image_url: null, ...extra }));
const binder = (over: Record<string, unknown> = {}) => ({
  title: 'Eeveelutions',
  description: null,
  hidden_from_feeds: false,
  binder_pages: [{ binder_slots: slots(MIN_FILLED) }],
  ...over,
});

test('a hidden binder (the daily puzzles) is never indexed, however full', () => {
  assert.deepEqual(indexDecision(binder({ hidden_from_feeds: true, binder_pages: [{ binder_slots: slots(200) }] })), {
    index: false,
    reason: 'hidden',
  });
  assert.equal(indexDecision(binder({ title: 'Daily Puzzles: 2027-05-17 to 2027-05-30' })).reason, 'hidden');
});

test('a binder needs enough pockets a visitor can see, counting only cards and approved pictures', () => {
  assert.equal(indexDecision(binder()).index, true);
  assert.equal(indexDecision(binder({ binder_pages: [{ binder_slots: slots(MIN_FILLED - 1) }] })).reason, 'thin');
  // Under the MIC-029 visitor policy an unapproved picture's slot is not returned at all; an empty
  // pocket comes back with neither field.
  const empty = { card_id: null, image_url: null };
  assert.equal(
    indexDecision(binder({ binder_pages: [{ binder_slots: [...slots(MIN_FILLED - 1), empty] }] })).reason,
    'thin',
  );
  const approvedPicture = { card_id: null, image_url: 'https://x/y.png' };
  assert.equal(indexDecision(binder({ binder_pages: [{ binder_slots: [...slots(MIN_FILLED - 1), approvedPicture] }] })).index, true);
});

test("the app's placeholder names are not indexed unless the owner wrote a description", () => {
  for (const t of ['Woge', 'Luwe', 'Bohe']) assert.equal(indexDecision(binder({ title: t })).reason, 'unnamed');
  assert.equal(indexDecision(binder({ title: 'Woge', description: 'My favourite grass types' })).index, true);
  assert.equal(indexDecision(binder({ title: 'Pika' })).reason, 'unnamed');
  assert.equal(indexDecision(binder({ title: 'Mew line' })).index, true);
});

/* ---- routes */

interface Rewrite {
  source: string;
  destination: string;
  has?: { type: string; key?: string; value: string }[];
}
const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
  rewrites: Rewrite[];
  redirects: Rewrite[];
};

/** Vercel source → RegExp, for the forms vercel.json uses. */
const sourceRe = (s: string) =>
  new RegExp(`^${s.replace(/:path\*/g, '.*').replace(/:[a-z]+/g, '[^/]+')}$`);

/** The URL paths src/app serves (dynamic segments filled with a sample value). */
function appPaths(dir = path.join(ROOT, 'src/app'), prefix = ''): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const full = path.join(dir, f);
    if (statSync(full).isDirectory()) {
      out.push(...appPaths(full, `${prefix}/${f}`));
      continue;
    }
    const name = f.replace(/\.(web\.)?tsx$/, '');
    if (name.startsWith('_') || name.startsWith('+')) continue;
    const seg = name === 'index' ? '' : `/${name.replace(/^\[.+\]$/, 'x')}`;
    out.push(`${prefix}${seg}` || '/');
  }
  return out;
}

test('every route the app has is served, and only an unknown path reaches the 404', () => {
  const plain = vercel.rewrites.filter((r) => !r.has);
  const last = plain[plain.length - 1];
  assert.equal(last.source, '/:path*');
  assert.match(last.destination, /route=404/);
  const served = plain.slice(0, -1);
  for (const p of appPaths()) {
    if (p === '/') continue; // dist/index.html, the composed home page, straight from the filesystem
    assert.ok(served.some((r) => sourceRe(r.source).test(p)), `${p} is rewritten before the 404 catch-all`);
  }
  for (const p of ['/llms.txt', '/this-does-not-exist-xyz', '/wp-admin', '/binder']) {
    assert.ok(!served.some((r) => sourceRe(r.source).test(p)), `${p} reaches the 404`);
  }
});

test('no rewrite branches on a search engine or AI crawler (social link previews only)', () => {
  for (const r of vercel.rewrites.filter((x) => x.has?.some((h) => h.key === 'user-agent'))) {
    const ua = new RegExp(r.has!.find((h) => h.key === 'user-agent')!.value, 'i');
    for (const bot of ['Googlebot', 'bingbot', 'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Applebot', 'DuckDuckBot']) {
      assert.ok(!ua.test(`Mozilla/5.0 (compatible; ${bot}/2.1)`), `${r.source} must not send ${bot} somewhere else`);
    }
  }
});

test('www redirects to the apex, the bare root included', () => {
  const www = vercel.redirects.filter((r) => r.has?.some((h) => h.type === 'host' && h.value === 'www.michi-maker.com'));
  assert.ok(www.some((r) => r.source === '/' && r.destination === 'https://michi-maker.com/'));
  assert.ok(www.some((r) => r.source === '/:path*'));
});

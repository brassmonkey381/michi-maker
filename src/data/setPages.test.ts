/**
 * MIC-037 phase B: the /sets pilot (SEO plan action 9). Every set page is built from the committed
 * snapshot (scripts/seo/set-pages.json), carries its own canonical, is in the sitemap, says
 * set-specific things, and links into the binder wizard with the set picked (guests can use it). Static HTML with no script:
 * a person and a crawler read the same page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { esc, pagePlan, renderHub, renderSetPage, setFacts } from '../../scripts/seo/setPage.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshot = JSON.parse(readFileSync(path.join(ROOT, 'scripts/seo/set-pages.json'), 'utf8'));
const index = require('../../api/_sets.json');
const { STATIC } = require('../../api/sitemap.js');

type Set = { id: number; slug: string; name: string; printed: number; patterns: number; cards: unknown[]; notable: { name: string }[] };
const sets = snapshot.sets as Set[];
const bySlug = (slug: string) => sets.find((s) => s.slug === slug)!;

test('the pilot is 20 to 30 sets with unique slugs, and the sitemap index matches it', () => {
  assert.ok(sets.length >= 20 && sets.length <= 30, `${sets.length} sets`);
  assert.equal(new Set(sets.map((s) => s.slug)).size, sets.length);
  assert.deepEqual(index.sets.map((s: { slug: string }) => s.slug), sets.map((s) => s.slug));
  for (const s of sets) assert.match(s.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('every set page and the hub are in the sitemap', () => {
  const paths = new Set(STATIC.map((s: { path: string }) => s.path));
  assert.ok(paths.has('/sets'));
  for (const s of sets) assert.ok(paths.has(`/sets/${s.slug}`), `/sets/${s.slug} in the sitemap`);
});

test('each set page has its own canonical, title, h1, start link and checklist, and nothing else runs', () => {
  for (const s of sets) {
    const html = renderSetPage(s, { taken: snapshot.taken });
    assert.equal((html.match(/<link rel="canonical"/g) ?? []).length, 1, s.slug);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://michi-maker\\.com/sets/${s.slug}">`));
    assert.equal((html.match(/<title>/g) ?? []).length, 1);
    assert.ok(html.includes(`<h1>${esc(s.name)} binder planner</h1>`), `${s.slug} h1`);
    assert.ok(html.includes(`href="https://michi-maker.com/new-binder?kind=set&amp;set=${s.id}"`), `${s.slug} start link opens the wizard on the set`);
    assert.ok(!html.includes('/collect'), 'no link a guest cannot use');
    assert.doesNotMatch(html, /with an account/);
    assert.doesNotMatch(html, /<script/i, 'static: no script, so no difference between a reader and a crawler');
    assert.doesNotMatch(html, /noindex/);
    const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /—/, `${s.slug}: no em dashes`);
    assert.doesNotMatch(text, /\bPRO\b|\bVIP\b/, `${s.slug}: no plan names`);
    // Set-specific: every card's row is there, and the most valuable card is named.
    assert.equal((html.match(/<td class="num">\d+<\/td><\/tr>/g) ?? []).length >= s.cards.length, true, `${s.slug} checklist rows`);
    if (s.notable[0]) assert.ok(text.includes(esc(s.notable[0].name)), `${s.slug} names its top card`);
  }
});

test('the counts are right for a set whose numbers are known: Scarlet & Violet 151', () => {
  const f = setFacts(bySlug('scarlet-violet-151'));
  assert.equal(f.complete, 207); // 165 + 42 secret rares
  assert.equal(f.secrets.length, 42);
  const nine = f.sizes.find((x) => x.pockets === 9)!;
  assert.deepEqual([nine.pages, nine.sheets], [23, 12]);
  const twelve = f.sizes.find((x) => x.pockets === 12)!;
  assert.deepEqual([twelve.pages, twelve.sheets], [18, 9]);
  assert.ok(f.master > f.complete, 'a master set adds the reverse holos');
});

test('pattern variants count toward the master set, not the checklist (Prismatic Evolutions)', () => {
  const s = bySlug('prismatic-evolutions');
  const f = setFacts(s);
  assert.equal(f.complete, s.cards.length);
  assert.ok(s.patterns > 0);
  assert.equal(f.master, f.complete + f.reverses + s.patterns);
  assert.ok(f.cards.every((c: { name: string }) => !/\((Poke|Master) Ball Pattern\)/.test(c.name)), 'no pattern printing in the checklist');
});

test('the page plan puts nine cards on a page, in number order', () => {
  const cards = setFacts(bySlug('base-set')).cards;
  const plan = pagePlan(cards, 9);
  assert.equal(plan.length, Math.ceil(cards.length / 9));
  assert.equal(plan[0].first.number, cards[0].number);
  assert.equal(plan[0].last.number, cards[8].number);
  assert.equal(plan.reduce((n, p) => n + p.count, 0), cards.length);
});

test('a gap in the card list is said on the page, not hidden (Base Set has no 008/102 entry)', () => {
  const html = renderSetPage(bySlug('base-set'), { taken: snapshot.taken });
  assert.match(html, /no entry for number 8,/);
});

test('the hub links every set and has its own canonical', () => {
  const html = renderHub(sets, { taken: snapshot.taken });
  assert.match(html, /<link rel="canonical" href="https:\/\/michi-maker\.com\/sets">/);
  for (const s of sets) assert.ok(html.includes(`href="https://michi-maker.com/sets/${s.slug}"`), s.slug);
  assert.doesNotMatch(html, /<script/i);
});

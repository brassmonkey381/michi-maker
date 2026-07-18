/**
 * Refresh the ENRICHMENT on the committed public/browse/catalog.json.
 *
 * The committed catalog.json is the migration-period fallback (src/lib/catalogSource.ts); at some
 * point it was published SLIM — no types / illustrator / evolution data — while the authoritative
 * gated `catalog.enc` the app loads at runtime carries the full enrichment. That left the michi
 * page methods that key off enrichment (evolution/story, artist, colour theme) unable to cluster
 * when the app falls back to the local copy, and it left our build scripts (the example collection)
 * mining blind.
 *
 * This pulls the enrichment fields for every card LIVE from the tcgscan-data PostgREST `cards`
 * table (public-read, publishable key — same source as build-release-binders.mjs) and merges them
 * into catalog.json in place, matching the RawCard snake_case shape the kit reads. Structure
 * (ids, images, sets, series) is untouched. Run: `node scripts/enrich-catalog.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'public', 'browse', 'catalog.json');

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const API_KEY = env.EXPO_PUBLIC_CATALOG_API_KEY;
const API_URL = `${new URL(env.EXPO_PUBLIC_CATALOG_BROWSE_URL).origin}/rest/v1`;

// The enrichment fields the kit's RawCard reads (plus a couple useful extras).
const SELECT = [
  'id', 'illustrator', 'types', 'stage', 'hp',
  'evolves_from', 'evolution_line', 'evolution_stage_index', 'subtypes', 'dex',
].join(',');
const PAGE = 1000;

async function fetchPage(offset) {
  const res = await fetch(`${API_URL}/cards?select=${SELECT}&order=id&limit=${PAGE}&offset=${offset}`, {
    headers: { apikey: API_KEY },
  });
  if (!res.ok) throw new Error(`cards fetch ${res.status}: ${await res.text()}`);
  return res.json();
}

console.log('Reading local catalog.json …');
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const cards = catalog.cards;
const totalLocal = Object.keys(cards).length;

console.log(`Fetching enrichment for ~${totalLocal} cards from ${API_URL}/cards …`);
let offset = 0;
let matched = 0;
for (;;) {
  const rows = await fetchPage(offset);
  if (!rows.length) break;
  for (const r of rows) {
    const c = cards[String(r.id)];
    if (!c) continue;
    matched += 1;
    // Merge only the enrichment fields, preserving the existing structure/ids/images.
    if (r.illustrator != null) c.illustrator = r.illustrator;
    if (r.types != null) c.types = r.types;
    if (r.stage != null) c.stage = r.stage;
    if (r.hp != null) c.hp = r.hp;
    if (r.evolves_from != null) c.evolves_from = r.evolves_from;
    if (r.evolution_line != null) c.evolution_line = r.evolution_line;
    if (r.evolution_stage_index != null) c.evolution_stage_index = r.evolution_stage_index;
    if (r.subtypes != null) c.subtypes = r.subtypes;
    if (r.dex != null) c.dex = r.dex;
  }
  offset += rows.length;
  process.stdout.write(`\r  fetched ${offset}, matched ${matched}`);
  if (rows.length < PAGE) break;
}
console.log('');

writeFileSync(CATALOG, JSON.stringify(catalog));

// coverage report
const all = Object.values(cards);
const cov = (f) => all.filter(f).length;
console.log(`\nEnriched catalog.json written (${all.length} cards, ${matched} matched from server).`);
console.log(`  types:        ${cov((c) => (c.types || []).length > 0)}`);
console.log(`  illustrator:  ${cov((c) => c.illustrator && String(c.illustrator).trim())}`);
console.log(`  evolution>1:  ${cov((c) => (c.evolution_line || []).length > 1)}`);
console.log(`  evo stage:    ${cov((c) => c.evolution_stage_index != null)}`);

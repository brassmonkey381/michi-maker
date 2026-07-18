/**
 * Build the "Try it out!" example collection CSV.
 *
 * Emits src/data/exampleCollection.ts — a bundled ~200-card sample collection a new user can
 * one-tap import to populate their first `user_cards` inventory, then feed straight into the
 * Build-a-binder wizard. The card ids are REAL TCGPlayer product ids mined from the local
 * catalog (public/browse/catalog.json), all from recent Scarlet & Violet / Mega Evolution sets.
 *
 * WHY these particular cards: the slim 28k catalog carries NO enrichment (no types, evolution
 * lines, or illustrators — see docs/roadmap + the dataset-enrichment backlog), so the wizard can
 * only cluster on the three signals that survive: chase VALUE (prices-summary.json), SPECIES
 * (derived from the card name, mirroring pageComposer.speciesOf), and SET. This script curates
 * for exactly those three so the wizard produces a Chase board, several single-species gallery
 * pages, and a couple of same-set pages, then sweeps the rest into tidy colour-blocked bulk.
 *
 * It SIMULATES the wizard (proposePages) at the end and prints the resulting page plan, so the
 * curation is verified at build time, not guessed. Re-run after a catalog refresh:
 *   node scripts/build-example-collection.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/browse/catalog.json'), 'utf8'));
const prices = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/browse/prices-summary.json'), 'utf8'));

const PORTFOLIO_NAME = 'Example cards (safe to delete)';
const TARGET = 200;
const RECENT_SERIES = new Set(['Scarlet & Violet', 'Mega Evolution']);

// ---- mirror pageComposer.speciesOf (name-token path — evolutionLine is empty here) ----------
const NAME_DECORATIONS = new Set([
  'ex', 'gx', 'v', 'vmax', 'vstar', 'v-union', 'break', 'prime', 'radiant', 'shining',
  'dark', 'light', 'delta', 'star', 'lv.x', 'mega', 'm', 'x', 'y',
]);
const speciesOf = (name) =>
  name
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => !NAME_DECORATIONS.has(t) && !/['’]s$/.test(t))
    .join(' ')
    .trim();

const priceOf = (id) => prices[id]?.cur ?? 0;

// ---- candidate pool: recent, standard (not jumbo), real image, priced ------------------------
const vunionIds = new Set();
for (const g of catalog.vunionGroups ?? catalog.vunion ?? []) for (const p of g.pieces ?? []) vunionIds.add(String(p));

const pool = Object.values(catalog.cards)
  .filter((c) => RECENT_SERIES.has(c.series || ''))
  .filter((c) => !c.jumbo && c.kind !== 'jumbo' && c.kind !== 'vunion' && !vunionIds.has(String(c.id)))
  .filter((c) => (c.card_type || []).includes('Pokemon')) // Pokémon only — no trainers/energy/items
  .filter((c) => c.number || '')
  .map((c) => ({
    id: String(c.id),
    name: c.name,
    set: c.set_name || '',
    number: c.number || '',
    release: c.release_date || '',
    species: speciesOf(c.name),
    price: priceOf(String(c.id)),
  }))
  .filter((c) => c.species);

const byId = new Map(pool.map((c) => [c.id, c]));
const chosen = new Map(); // id -> { ...card, qty }
const add = (card, qty = 1) => {
  if (!card || chosen.has(card.id)) return false;
  chosen.set(card.id, { ...card, qty });
  return true;
};

// ---- 1. CHASE board: 9 iconic hits (>= $10), distinct species, spread of values -------------
const CHASE_FLOOR = 12;
const chaseCandidates = pool
  .filter((c) => c.price >= CHASE_FLOOR && c.price <= 400)
  .sort((a, b) => b.price - a.price);
const chaseSpecies = new Set();
const chaseSets = new Set();
for (const c of chaseCandidates) {
  if (chosen.size >= 9) break;
  if (chaseSpecies.has(c.species)) continue; // one hit per species -> visually varied board
  if (chaseSets.has(c.set) && chaseSets.size >= 5) continue; // spread across sets
  chaseSpecies.add(c.species);
  chaseSets.add(c.set);
  add(c, 1);
}
const chaseIds = new Set(chosen.keys());

// ---- 2. SPECIES gallery pages: iconic species with >=5 cheap (<$10) distinct prints ----------
// Cheap so the chase board never steals a print out from under the species page.
const ICONIC = [
  'pikachu', 'charizard', 'eevee', 'mewtwo', 'mew', 'gardevoir', 'gengar', 'lucario',
  'snorlax', 'greninja', 'sylveon', 'umbreon', 'rayquaza', 'gyarados', 'dragonite',
  'tyranitar', 'garchomp', 'blastoise', 'venusaur', 'lapras', 'magikarp', 'absol',
];
const cheapBySpecies = new Map();
for (const c of pool) {
  if (c.price >= 10 || chaseSpecies.has(c.species)) continue;
  const list = cheapBySpecies.get(c.species) ?? [];
  list.push(c);
  cheapBySpecies.set(c.species, list);
}
const speciesUsed = new Set();
const rankSpecies = (s) => {
  const i = ICONIC.indexOf(s);
  return i === -1 ? 999 : i;
};
const speciesPageSpecies = [...cheapBySpecies.entries()]
  .filter(([, list]) => list.length >= 5)
  .sort((a, b) => rankSpecies(a[0]) - rankSpecies(b[0]) || b[1].length - a[1].length)
  .slice(0, 8)
  .map(([s]) => s);
for (const s of speciesPageSpecies) {
  const prints = cheapBySpecies.get(s).sort((a, b) => (a.release < b.release ? 1 : -1)).slice(0, 6);
  prints.forEach((c, i) => add(c, i === 0 ? 2 : 1)); // a duplicate here and there feels real
  speciesUsed.add(s);
}

// ---- 3. SET showcase pages: 3 sets, 9 distinct-species cheap cards each (fresh species) -------
const cheapBySet = new Map();
for (const c of pool) {
  if (c.price >= 10 || chosen.has(c.id) || speciesUsed.has(c.species)) continue;
  const list = cheapBySet.get(c.set) ?? [];
  list.push(c);
  cheapBySet.set(c.set, list);
}
const setPageSets = [...cheapBySet.entries()]
  .filter(([, list]) => new Set(list.map((c) => c.species)).size >= 9)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 3)
  .map(([s]) => s);
for (const setName of setPageSets) {
  const seen = new Set();
  const picks = [];
  for (const c of cheapBySet.get(setName).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))) {
    if (seen.has(c.species) || speciesUsed.has(c.species)) continue;
    seen.add(c.species);
    picks.push(c);
    if (picks.length >= 9) break;
  }
  picks.forEach((c) => add(c));
}

// ---- 4. FILLER to ~200: cheap Pokémon spread ACROSS sets (round-robin) so bulk stays varied ---
const fillerBySet = new Map();
for (const c of pool) {
  if (c.price >= 8 || chosen.has(c.id)) continue;
  const list = fillerBySet.get(c.set) ?? [];
  list.push(c);
  fillerBySet.set(c.set, list);
}
// Newest sets first, but one card at a time from each in turn (no single-set dumps).
const queues = [...fillerBySet.entries()]
  .sort((a, b) => (a[1][0].release < b[1][0].release ? 1 : -1))
  .map(([, list]) => list.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })));
let fi = 0;
let drained = false;
while (chosen.size < TARGET && !drained) {
  drained = true;
  for (const q of queues) {
    if (chosen.size >= TARGET) break;
    const c = q.shift();
    if (!c) continue;
    drained = false;
    if (add(c, fi % 6 === 0 ? 2 : 1)) fi += 1;
  }
}

// ---- emit CSV --------------------------------------------------------------------------------
const rows = [...chosen.values()];
const csvField = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const header = 'Product ID,Quantity,Simple Name,Set Name,Card Number';
const lines = rows.map((c) => [c.id, c.qty, csvField(c.name), csvField(c.set), csvField(c.number)].join(','));
const csv = [header, ...lines].join('\n');
const totalCopies = rows.reduce((n, c) => n + c.qty, 0);

const ts = `/**
 * Example "Try it out!" collection — AUTO-GENERATED by scripts/build-example-collection.mjs.
 * Do not edit by hand; re-run the script to regenerate.
 *
 * ${rows.length} real recent-set cards (${totalCopies} copies) as a TCGPlayer-style CSV, bundled so
 * the empty My-collection state can one-tap import a starter inventory and hand it to the
 * Build-a-binder wizard. Cards are curated so the wizard produces a chase board, single-species
 * gallery pages, and same-set pages (see the script header for why these three signals).
 */
export const EXAMPLE_COLLECTION_NAME = ${JSON.stringify(PORTFOLIO_NAME)};
export const EXAMPLE_COLLECTION_COUNT = ${rows.length};
export const EXAMPLE_COLLECTION_COPIES = ${totalCopies};

export const EXAMPLE_COLLECTION_CSV = ${JSON.stringify(csv)};
`;

fs.writeFileSync(path.join(ROOT, 'src/data/exampleCollection.ts'), ts);
// A human-readable copy for docs / manual inspection.
fs.writeFileSync(path.join(ROOT, 'docs/example-collection.csv'), csv + '\n');

// ---- simulate the wizard (proposePages) to VERIFY the page plan ------------------------------
const MIN_SIZE = { chase: 3, evolution: 4, species: 4, artist: 5, set: 6, type: 6 };
const KIND_PRIORITY = { chase: 6, evolution: 5, species: 4, artist: 3, set: 2, type: 1 };
const freeIds = rows.map((c) => c.id);
const cards = freeIds.map((id) => byId.get(id));
const used = new Set();
const plan = [];

const hits = cards.map((c) => ({ c, v: c.price })).filter((x) => x.v >= 10).sort((a, b) => b.v - a.v);
if (hits.length >= MIN_SIZE.chase) {
  const top = hits.slice(0, 9);
  top.forEach((x) => used.add(x.c.id));
  plan.push({ kind: 'chase', title: 'Chase board', n: top.length, detail: top.map((x) => `${x.c.name} $${x.v}`) });
}
const clusters = new Map();
const put = (c, kind, key, title) => {
  const k = `${kind}|${key}`;
  const ex = clusters.get(k) ?? { kind, title, cards: [] };
  ex.cards.push(c);
  clusters.set(k, ex);
};
for (const c of cards) {
  put(c, 'species', c.species, c.species);
  if (c.set) put(c, 'set', c.set, c.set);
}
const ranked = [...clusters.values()].sort(
  (a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind] || b.cards.length - a.cards.length,
);
for (const cl of ranked) {
  if (plan.length >= 13) break;
  const avail = cl.cards.filter((c) => !used.has(c.id));
  if (avail.length < MIN_SIZE[cl.kind]) continue;
  avail.slice(0, 9).forEach((c) => used.add(c.id));
  plan.push({ kind: cl.kind, title: cl.title, n: Math.min(avail.length, 9) });
}
const leftovers = cards.filter((c) => !used.has(c.id));
const bulkPages = Math.ceil(leftovers.length / 9);

console.log(`\nExample collection written: ${rows.length} cards, ${totalCopies} copies`);
console.log(`  src/data/exampleCollection.ts`);
console.log(`  docs/example-collection.csv\n`);
console.log('Simulated wizard page plan:');
for (const p of plan) {
  console.log(`  [${p.kind}] ${p.title} (${p.n} cards)`);
  if (p.detail) p.detail.forEach((d) => console.log(`        - ${d}`));
}
console.log(`  [bulk] ~${bulkPages} colour-blocked bulk page(s) from ${leftovers.length} leftover cards`);
console.log(`\nTheme pages: ${plan.length}  ·  bulk pages: ~${bulkPages}`);

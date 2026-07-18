/**
 * Build the "Try it out!" example collection CSV → src/data/exampleCollection.ts.
 *
 * A ~200-card TCGPlayer-style CSV a new user one-tap imports to populate their first collection,
 * then feeds into the Build-a-binder wizard. The catalog is now ENRICHED (run scripts/enrich-catalog.mjs
 * first — it merges types / illustrator / evolution lines from the tcgscan-data cards table into
 * public/browse/catalog.json), so the wizard can cluster the real michi page methods:
 *   Chase board (anchor) · Evolution line (themed/story) · Single species · Artist · Set · Colour(type).
 *
 * We curate for exactly those: full evolution families (Eevee, Charizard, Gardevoir…), depth from a
 * couple of prolific illustrators, a multi-print species, a spread of energy types for colour pages,
 * and plenty of expensive/rare cards. It SIMULATES the wizard at the end to verify the page plan.
 *
 * Run:  node scripts/enrich-catalog.mjs && node scripts/build-example-collection.mjs
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

const NAME_DECORATIONS = new Set([
  'ex', 'gx', 'v', 'vmax', 'vstar', 'v-union', 'break', 'prime', 'radiant', 'shining',
  'dark', 'light', 'delta', 'star', 'lv.x', 'mega', 'm', 'x', 'y',
]);
// Mirror pageComposer.speciesOf: evolution-line member contained in the name wins, else name tokens.
const speciesOf = (name, line) => {
  const n = name.toLowerCase();
  if (line && line.length) {
    const hit = [...line].sort((a, b) => b.length - a.length).find((s) => n.includes(s));
    if (hit) return hit;
  }
  return n.split(/\s+/).filter((t) => !NAME_DECORATIONS.has(t) && !/['’]s$/.test(t)).join(' ').trim();
};
const priceOf = (id) => prices[id]?.cur ?? 0;

const vunionIds = new Set();
for (const g of catalog.vunionGroups ?? catalog.vunion ?? []) for (const p of g.pieces ?? []) vunionIds.add(String(p));

const pool = Object.values(catalog.cards)
  .filter((c) => RECENT_SERIES.has(c.series || ''))
  .filter((c) => !c.jumbo && c.kind !== 'jumbo' && c.kind !== 'vunion' && !vunionIds.has(String(c.id)))
  .filter((c) => (c.card_type || []).includes('Pokemon') && (c.number || ''))
  .map((c) => ({
    id: String(c.id),
    name: c.name,
    set: c.set_name || '',
    setId: String(c.set_id ?? c.set_code ?? ''),
    number: c.number || '',
    release: c.release_date || '',
    line: c.evolution_line || [],
    evoKey: (c.evolution_line || []).length > 1 ? (c.evolution_line || []).join('>') : '',
    illustrator: (c.illustrator || '').trim(),
    type: (c.types || [])[0] || '',
    price: priceOf(String(c.id)),
  }))
  .map((c) => ({ ...c, species: speciesOf(c.name, c.line) }))
  .filter((c) => c.species);

const byId = new Map(pool.map((c) => [c.id, c]));
const chosen = new Map();
const put = (id, qty = 1) => { if (id && !chosen.has(id)) chosen.set(id, qty); };
const topN = (list, n) => [...list].sort((a, b) => b.price - a.price).slice(0, n);

// ---- 1. EVOLUTION FAMILIES (themed / story pages) — full iconic lines, rares preferred ---------
const FAMILIES = [
  'eevee>vaporeon>jolteon>flareon>espeon>umbreon>leafeon>glaceon>sylveon', // the Eevee family
  'charmander>charmeleon>charizard',
  'ralts>kirlia>gardevoir>gallade',
  'squirtle>wartortle>blastoise',
  'bulbasaur>ivysaur>venusaur',
];
for (const fam of FAMILIES) {
  const members = pool.filter((c) => c.evoKey === fam);
  // one nice print per species in the family, then top up with extra prints, cap 9
  const bySpecies = new Map();
  for (const c of members.sort((a, b) => b.price - a.price)) if (!bySpecies.has(c.species)) bySpecies.set(c.species, c);
  const picks = [...bySpecies.values()];
  for (const c of members) { if (picks.length >= 9) break; if (!picks.includes(c)) picks.push(c); }
  picks.slice(0, 9).forEach((c) => put(c.id, 1));
}

// ---- 2. ARTIST pages — depth from a couple of prolific illustrators (>=6 cards each) -----------
const byArtist = new Map();
for (const c of pool) if (c.illustrator) (byArtist.get(c.illustrator) ?? byArtist.set(c.illustrator, []).get(c.illustrator)).push(c);
const artistPick = [...byArtist.entries()].filter(([, l]) => l.length >= 8).sort((a, b) => b[1].length - a[1].length).slice(0, 2);
for (const [, list] of artistPick) topN(list.filter((c) => c.price < 60), 6).forEach((c) => put(c.id, 1));

// ---- 3. SINGLE SPECIES page — Pikachu across sets --------------------------------------------
topN(pool.filter((c) => /pikachu/i.test(c.name)), 6).forEach((c) => put(c.id, 1));

// ---- 3b. TRAINER page — one character's team ("X's Pokémon" naming), distinct species ---------
const byTrainer = new Map();
for (const c of pool) {
  const t = /^(.+?)['’]s\s/.exec(c.name)?.[1];
  if (!t) continue;
  const l = byTrainer.get(t) ?? [];
  l.push(c);
  byTrainer.set(t, l);
}
const trainerPick = [...byTrainer.entries()]
  .filter(([, l]) => new Set(l.map((c) => c.species)).size >= 7)
  .sort((a, b) => b[1].length - a[1].length)[0];
if (trainerPick) {
  const seen = new Set();
  for (const c of trainerPick[1].sort((a, b) => b.price - a.price)) {
    if (seen.has(c.species)) continue;
    seen.add(c.species);
    put(c.id, 1);
    if (seen.size >= 7) break;
  }
}

// ---- 4. CHASE board (anchor) — the grails ----------------------------------------------------
const chaseSp = new Set();
for (const c of [...pool].sort((a, b) => b.price - a.price)) {
  if (chosen.size && chaseSp.size >= 9) break;
  if (c.price < 15 || chaseSp.has(c.species)) continue;
  chaseSp.add(c.species); put(c.id, 1);
  if (chaseSp.size >= 9) break;
}

// ---- 5. COLOUR variety — ensure several energy types are represented for colour pages ---------
for (const t of ['Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Darkness', 'Fighting', 'Metal']) {
  topN(pool.filter((c) => c.type === t && c.price < 25), 7).forEach((c) => put(c.id, 1));
}

// ---- 6. RARES tranche — make the collection feel valuable -------------------------------------
const rareSp = new Set();
for (const c of [...pool].sort((a, b) => b.price - a.price)) {
  if (chosen.size >= 90) break;
  if (c.price < 20 || rareSp.has(c.species)) continue;
  rareSp.add(c.species); put(c.id, 1);
}

// ---- 7. FILL to ~200 — varied recent cards across sets (healthy value mix, not just bulk) ------
const fillBySet = new Map();
for (const c of pool) {
  if (chosen.has(c.id) || c.price > 60) continue;
  const l = fillBySet.get(c.set) ?? [];
  l.push(c);
  fillBySet.set(c.set, l);
}
const queues = [...fillBySet.values()].map((l) => l.sort((a, b) => b.price - a.price));
let qi = 0, drained = false;
while (chosen.size < TARGET && !drained) {
  drained = true;
  for (const q of queues) {
    if (chosen.size >= TARGET) break;
    const c = q.shift();
    if (!c) continue;
    drained = false;
    put(c.id, qi % 6 === 0 ? 2 : 1);
    qi += 1;
  }
}

// ---- emit CSV --------------------------------------------------------------------------------
const rows = [...chosen.entries()].map(([id, qty]) => ({ ...byId.get(id), qty }));
const csvField = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const header = 'Product ID,Quantity,Simple Name,Set Name,Card Number';
const csv = [header, ...rows.map((c) => [c.id, c.qty, csvField(c.name), csvField(c.set), csvField(c.number)].join(','))].join('\n');
const totalCopies = rows.reduce((n, c) => n + c.qty, 0);
const bookValue = rows.reduce((n, c) => n + c.price * c.qty, 0);

const ts = `/**
 * Example "Try it out!" collection — AUTO-GENERATED by scripts/build-example-collection.mjs.
 * Do not edit by hand; re-run the script to regenerate.
 *
 * ${rows.length} recent-set cards (${totalCopies} copies, ~$${Math.round(bookValue).toLocaleString('en-US')} book value) as a TCGPlayer-style CSV,
 * bundled so the empty My-collection state can one-tap import a starter inventory and hand it to
 * the Build-a-binder wizard. Curated (against the enriched catalog) to yield the michi page
 * methods — chase/anchor, evolution-line story pages, single species, artist, set, and colour.
 */
export const EXAMPLE_COLLECTION_NAME = ${JSON.stringify(PORTFOLIO_NAME)};
export const EXAMPLE_COLLECTION_COUNT = ${rows.length};
export const EXAMPLE_COLLECTION_COPIES = ${totalCopies};

export const EXAMPLE_COLLECTION_CSV = ${JSON.stringify(csv)};
`;
fs.writeFileSync(path.join(ROOT, 'src/data/exampleCollection.ts'), ts);
fs.writeFileSync(path.join(ROOT, 'docs/example-collection.csv'), csv + '\n');

// ---- simulate the wizard (proposePages) to VERIFY a rich, method-diverse plan -----------------
const MIN = { chase: 3, trainer: 5, evolution: 4, species: 4, artist: 5, set: 6, type: 6 };
const PRIO = { chase: 7, trainer: 6, evolution: 5, species: 4, artist: 3, set: 2, type: 1 };
const cards = rows.map((c) => byId.get(c.id));
const used = new Set();
const plan = [];
const hits = cards.map((c) => ({ c, v: c.price })).filter((x) => x.v >= 10).sort((a, b) => b.v - a.v);
if (hits.length >= MIN.chase) { hits.slice(0, 9).forEach((x) => used.add(x.c.id)); plan.push({ kind: 'chase', title: 'Chase board', n: Math.min(9, hits.length) }); }
const clusters = new Map();
const putC = (c, kind, key, title) => { const k = `${kind}|${key}`; (clusters.get(k) ?? clusters.set(k, { kind, title, cards: [] }).get(k)).cards.push(c); };
for (const c of cards) {
  const tr = /^(.+?)['’]s\s/.exec(c.name)?.[1];
  if (tr) putC(c, 'trainer', tr.toLowerCase(), `${tr}'s team`);
  if (c.evoKey) putC(c, 'evolution', c.evoKey, `${c.line[0]} line`);
  if (c.species) putC(c, 'species', c.species, c.species);
  if (c.illustrator) putC(c, 'artist', c.illustrator.toLowerCase(), `Art by ${c.illustrator}`);
  if (c.setId) putC(c, 'set', c.setId, c.set);
  if (c.type) putC(c, 'type', c.type, `${c.type} colors`);
}
const ranked = [...clusters.values()].sort((a, b) => PRIO[b.kind] - PRIO[a.kind] || b.cards.length - a.cards.length);
for (const cl of ranked) {
  if (plan.length >= 13) break;
  const avail = cl.cards.filter((c) => !used.has(c.id));
  if (avail.length < MIN[cl.kind]) continue;
  avail.slice(0, 9).forEach((c) => used.add(c.id));
  plan.push({ kind: cl.kind, title: cl.title, n: Math.min(avail.length, 9) });
}
const leftovers = cards.filter((c) => !used.has(c.id));
console.log(`Example collection: ${rows.length} cards, ${totalCopies} copies, ~$${Math.round(bookValue).toLocaleString('en-US')} book value\n`);
console.log('Simulated wizard page plan (theme pages, before bulk):');
for (const p of plan) console.log(`  [${p.kind}] ${p.title} (${p.n} cards)`);
const byLeftType = new Map();
for (const c of leftovers) byLeftType.set(c.type || 'Colorless', (byLeftType.get(c.type || 'Colorless') || 0) + 1);
console.log(`  bulk sweep -> ${[...byLeftType.entries()].map(([t, n]) => `${t}:${n}`).join(' ')} (${leftovers.length} cards)`);

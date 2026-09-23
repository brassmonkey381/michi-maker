/**
 * STAGE 10: one pocket per named species, when the caption says there is one of each.
 *
 * WHAT STAGE 8 LEFT. Scoping searches the UNION of the group's species, because the caption's order
 * is not the photograph's. That is the right default, and it is why a group of three printings of
 * one Pokemon still works. But it lets two pockets win the same species: "Kabutops, Aerodactyl"
 * came back as two Kabutops and no Aerodactyl, which is a page a reader spots instantly.
 *
 * WHEN THIS APPLIES. Only where the caption names as many DISTINCT species as the photograph has
 * cards. Then one of each is what the caption asserts, and a pocket taking a second Kabutops is
 * necessarily stealing Aerodactyl's. Where the counts do not line up (four pockets, two names: two
 * Hitmonlee and two Hitmonchan) nothing is asserted and nothing is changed.
 *
 * NO MODEL RUNS. Stage 8 kept the 64 floats per pocket for exactly this. Every number below is a
 * dot product against anchors already in memory, so the whole stage is seconds rather than an hour.
 *
 * GREEDY THEN SWAPS, NOT HUNGARIAN. The groups are at most sixteen pockets, and a greedy assignment
 * improved by pairwise swaps until nothing improves reaches the same answer on inputs this size
 * without a page of index juggling that would need its own tests to trust.
 *
 *   node --import ./scripts/connected-art/lib/register.mjs scripts/connected-art/10-assign.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { cosineTopK, parseAnchorIndex } from '@/lib/recognition-core';
import { baseName, norm } from '@/lib/name-match';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');
const APP = join(here, '..', '..', '..', 'tcgscan-app');

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);

const inPath = join(DIR, 'rescoped.json');
if (!existsSync(inPath)) fail('rescoped.json not found. Run 8-rescope.mjs first.');
const doc = JSON.parse(readFileSync(inPath, 'utf8'));

step(1, 'loading the anchor index and the catalog names');
const index = parseAnchorIndex(
  JSON.parse(readFileSync(join(APP, 'public', 'data', 'capG-e15', 'embeddings.json'), 'utf8')),
  JSON.parse(readFileSync(join(APP, 'public', 'data', 'capG-e15', 'cards_lookup.json'), 'utf8')),
);
const catalog = JSON.parse(readFileSync(join(DIR, 'scanner-catalog.json'), 'utf8'));
const nameById = new Map();
for (const [id, c] of Object.entries(catalog.cards ?? {})) if (c?.name) nameById.set(String(id), c.name);

const rowsByWord = new Map();
for (const [row, cardId] of Object.entries(index.lookup)) {
  const name = nameById.get(String(cardId));
  if (!name) continue;
  for (const w of norm(baseName(name)).split(' ')) {
    if (!w) continue;
    if (!rowsByWord.has(w)) rowsByWord.set(w, new Set());
    rowsByWord.get(w).add(Number(row));
  }
}
/** The anchor rows for ONE species. Every word of a multi-word name must hit. */
function rowsFor(name) {
  const words = norm(baseName(name)).split(' ').filter(Boolean);
  if (!words.length) return new Set();
  let acc = null;
  for (const w of words) {
    const hit = rowsByWord.get(w);
    if (!hit) return new Set();
    acc = acc === null ? new Set(hit) : new Set([...acc].filter((r) => hit.has(r)));
  }
  return acc ?? new Set();
}

step(2, 'assigning');
let looked = 0;
let rebalanced = 0;
let moved = 0;

for (const g of Object.values(doc.results)) {
  const names = g.names ?? [];
  if (!g.pockets?.length || names.length < 2) continue;
  // The caption has to assert one of each: as many distinct names as there are cards.
  const distinct = [...new Set(names.map((n) => norm(baseName(n))))];
  if (distinct.length !== names.length) continue;
  if (g.pockets.length !== names.length) continue;
  // A pocket with no stored embedding predates this stage and cannot be re-scored.
  if (g.pockets.some((p) => !p.embedding?.length)) continue;

  const scopes = names.map((n) => rowsFor(n));
  if (scopes.some((s) => s.size === 0)) continue; // a name the catalog does not know
  looked += 1;

  // cost[pocket][name] = the best card of that species for that pocket, and how well it matches.
  const cost = g.pockets.map((p) => {
    const emb = Float32Array.from(p.embedding);
    return scopes.map((rows) => {
      const [best] = cosineTopK(emb, index, 1, { rows });
      return best ? { cardId: best.cardId, sim: best.similarity } : { cardId: null, sim: -1 };
    });
  });

  const n = names.length;
  // Greedy: take the strongest (pocket, name) pair still available, repeatedly.
  const pairs = [];
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) pairs.push([i, j, cost[i][j].sim]);
  pairs.sort((a, b) => b[2] - a[2]);
  const nameOf = new Array(n).fill(-1);
  const takenName = new Set();
  for (const [i, j] of pairs) {
    if (nameOf[i] !== -1 || takenName.has(j)) continue;
    nameOf[i] = j;
    takenName.add(j);
  }

  // Then swap any two pockets' names while that raises the total. Converges in a few passes at
  // these sizes and removes greedy's one weakness: an early strong pair blocking a better whole.
  for (let pass = 0; pass < n; pass += 1) {
    let improved = false;
    for (let a = 0; a < n; a += 1) {
      for (let b = a + 1; b < n; b += 1) {
        const now = cost[a][nameOf[a]].sim + cost[b][nameOf[b]].sim;
        const swapped = cost[a][nameOf[b]].sim + cost[b][nameOf[a]].sim;
        if (swapped > now + 1e-9) {
          const t = nameOf[a];
          nameOf[a] = nameOf[b];
          nameOf[b] = t;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const before = g.pockets.map((p) => p.cardId);
  let touched = 0;
  g.pockets.forEach((p, i) => {
    const pick = cost[i][nameOf[i]];
    if (!pick.cardId || pick.cardId === p.cardId) return;
    touched += 1;
    p.assignedFrom = { cardId: p.cardId, name: p.name ?? null, similarity: p.similarity };
    p.cardId = pick.cardId;
    p.name = nameById.get(String(pick.cardId)) ?? null;
    p.similarity = Number(pick.sim.toFixed(4));
    p.assigned = true;
  });
  if (!touched) continue;
  rebalanced += 1;
  moved += touched;
  console.log(`  ${g.caption}`);
  g.pockets.forEach((p, i) => {
    if (!p.assignedFrom) return;
    console.log(`      ${p.assignedFrom.name ?? before[i]} (${p.assignedFrom.similarity}) -> ${p.name} (${p.similarity})`);
  });
}

writeFileSync(inPath, JSON.stringify(doc, null, 2));

step(3, 'summary');
console.log(`  groups asserting one of each : ${looked}`);
console.log(`  groups rebalanced            : ${rebalanced}`);
console.log(`  cards moved                  : ${moved}`);
console.log(`\n  rewrote ${inPath}`);
console.log('\nOK: nothing has been written to the database.');

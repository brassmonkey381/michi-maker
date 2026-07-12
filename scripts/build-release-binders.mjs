// @ts-nocheck
/**
 * Build the "upcoming release" example binders → src/data/releaseBinders.json.
 *
 * The release-day hook: three binders a collector would want PREPPED before they even open
 * packs of a new set —
 *
 *   1. Chase Board      — the hits: the crown secret rare centered on page 1, the
 *                         illustration-rare wall, the ex board. (hero / anchor pages)
 *   2. Set Showcase     — what makes THIS set special: its Mega rarity ladders, its story
 *                         characters with their base print next to the secret-rare version,
 *                         partner Pokémon. (themed_story)
 *   3. Beautiful Bulk   — every common/uncommon/plain-rare, color-blocked by energy type so
 *                         opening piles of bulk still fills something that looks curated.
 *
 * Card pool comes LIVE from the tcgscan-data PostgREST API (public-read `cards` table,
 * publishable key from .env) — no dependency on the gated catalog blob. Slot images resolve
 * at runtime by id (cardThumbUrl → hashed tier, falling back to the TCGPlayer CDN for cards
 * the pipeline hasn't mirrored yet — which is exactly the state of an upcoming set).
 *
 * Per-release knobs live in SET_CONFIG; the archetype builders are rule-driven (rarity
 * ladder, name/species matching, type blocks) so pointing at the next set mostly works.
 * Run: `node scripts/build-release-binders.mjs`, then commit the JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'src', 'data', 'releaseBinders.json');

// ---- per-release configuration ---------------------------------------------
const SET_CONFIG = {
  setId: 24688, // ME05: Pitch Black (releases 2026-07-17)
  keyPrefix: 'pitch-black',
  releaseLabel: 'July 17',
  chase: {
    title: 'Pitch Black: Chase Board',
    description:
      'Releases July 17 — prep this before you open a single pack. Every hit worth pulling from ME05: the Mega Hyper Rare Mega Darkrai crowning page one, the full Illustration Rare wall, and the ex board. Duplicate it and check them off as you rip.',
    layoutStyle: 'anchor',
  },
  showcase: {
    title: 'Pitch Black: Mega Showcase',
    description:
      'What makes this set special: Mega Evolution rarity ladders (Double Rare → Ultra Rare → Special Illustration Rare, one Mega per row), the Darkness-type stars, and the Gladion / Gwynn / Rust Syndicate storyline — each character beside their secret-rare self, Silvally beside its partner.',
    layoutStyle: 'themed_story',
  },
  bulk: {
    title: 'Pitch Black: Beautiful Bulk',
    description:
      'The other 74 cards deserve a home too. Every common, uncommon and rare, color-blocked by energy type so page after page of "bulk" reads as one organized, intentional collection. The reward for actually opening packs.',
    layoutStyle: 'color_theme',
  },
  // Story characters (base print + secret prints get paired on the showcase page).
  storyNames: ["gladion's final battle", 'gwynn', 'rust syndicate grunt'],
  // Partner pairs shown together on the story page: [base name, partner note].
  partnerName: 'silvally',
  extraStoryName: 'dark bell',
};

// ---- fetch the pool ---------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const API_KEY = env.EXPO_PUBLIC_CATALOG_API_KEY;
const API_URL = `${new URL(env.EXPO_PUBLIC_CATALOG_BROWSE_URL).origin}/rest/v1`;

const res = await fetch(
  `${API_URL}/cards?set_id=eq.${SET_CONFIG.setId}&select=id,name,number,rarity,types,card_type&order=number`,
  { headers: { apikey: API_KEY } },
);
if (!res.ok) throw new Error(`cards fetch ${res.status}: ${await res.text()}`);
const pool = await res.json();
if (pool.length === 0) throw new Error('empty pool — wrong set id?');

// ---- helpers ----------------------------------------------------------------
const num = (c) => parseInt(String(c.number).split('/')[0], 10) || 0;
const byNum = (a, b) => num(a) - num(b);
const lc = (s) => (s ?? '').toLowerCase();
const ofRarity = (r) => pool.filter((c) => c.rarity === r).sort(byNum);
const isPokemon = (c) => (c.card_type ?? []).includes('Pokemon');
const isSupporter = (c) => (c.card_type ?? []).includes('Supporter');

/** Species key for grouping mega prints: "Mega Darkrai ex" → "darkrai". */
const megaSpecies = (c) => lc(c.name).replace(/^mega\s+/, '').replace(/\s+ex$/, '').trim();

function slot(binderId, pageIdx, row, col, cardId) {
  return { id: `${binderId}_p${pageIdx}_r${row}c${col}`, row, col, rowSpan: 1, colSpan: 1, type: 'card', cardId: String(cardId) };
}

/** A page from an ordered id list (row-major). `center` puts ids[0] in the middle pocket. */
function page(binderId, pageIdx, ids, { rows = 3, cols = 3, center = false } = {}) {
  let order = ids;
  if (center && ids.length > 0) {
    const mid = Math.floor((rows * cols) / 2);
    order = [];
    let ring = 1; // ids[0] goes to the middle; the rest fill around it in reading order
    for (let i = 0; i < rows * cols && order.length < ids.length; i += 1) {
      order.push(i === mid ? ids[0] : ids[ring++]);
      if (ring > ids.length - 1 && i >= mid) break;
    }
    order = order.slice(0, ids.length);
  }
  const slots = order.map((id, i) => slot(binderId, pageIdx, Math.floor(i / cols), i % cols, id));
  return { id: `${binderId}_p${pageIdx}`, rows, cols, slots };
}

const id = (c) => String(c.id);
const firstCover = (pages) => pages[0]?.slots.find((s) => s.cardId)?.cardId;

// ---- 1) Chase Board ----------------------------------------------------------
function chaseBoard() {
  const key = `rel-${SET_CONFIG.keyPrefix}-chase`;
  const mhr = ofRarity('Mega Hyper Rare');
  const sirs = ofRarity('Special Illustration Rare');
  const irs = ofRarity('Illustration Rare');
  const urs = ofRarity('Ultra Rare');
  const drs = ofRarity('Double Rare');

  const crown = mhr[0] ?? sirs[0];
  const crownSpecies = crown ? megaSpecies(crown) : '';
  // Ring around the crown: every SIR, then the URs that echo the crown/SIR Pokémon.
  const sirSpecies = new Set(sirs.filter(isPokemon).map(megaSpecies));
  const echoes = urs
    .filter((c) => isPokemon(c) && (megaSpecies(c) === crownSpecies || sirSpecies.has(megaSpecies(c))))
    .sort((a, b) => (megaSpecies(a) === crownSpecies ? -1 : 0) - (megaSpecies(b) === crownSpecies ? -1 : 0) || byNum(a, b));
  const p1Ids = [crown, ...sirs.filter((c) => c !== crown), ...echoes].filter(Boolean).slice(0, 9).map(id);
  const usedUr = new Set(echoes.slice(0, Math.max(0, 9 - 1 - sirs.length)).map(id));

  const p2Ids = irs.slice(0, 9).map(id);

  const restIr = irs.slice(9);
  const pokemonUr = urs.filter((c) => isPokemon(c) && !usedUr.has(id(c)));
  const supporterUr = urs.filter(isSupporter);
  const p3 = [...restIr, ...pokemonUr, ...supporterUr].slice(0, 9);
  p3.forEach((c) => usedUr.add(id(c)));
  const p3Ids = p3.map(id);

  // ex board: every Double Rare + the prettiest unused Supporter full-arts to square it off.
  const fill = supporterUr.filter((c) => !usedUr.has(id(c)));
  const p4Ids = [...drs, ...fill].slice(0, 12).map(id);

  const bid = key;
  const pages = [
    page(bid, 0, p1Ids, { center: true }),
    page(bid, 1, p2Ids),
    page(bid, 2, p3Ids),
    page(bid, 3, p4Ids, { rows: 3, cols: 4 }),
  ].filter((p) => p.slots.length > 0);
  return { id: bid, ...SET_CONFIG.chase, isExample: true, coverCardId: firstCover(pages), pages };
}

// ---- 2) Set Showcase ---------------------------------------------------------
function setShowcase() {
  const key = `rel-${SET_CONFIG.keyPrefix}-showcase`;
  const bid = key;
  const megas = pool.filter((c) => /^mega\s/i.test(c.name)).sort(byNum);

  // P1 — Mega rarity ladders: one Mega per ROW, its prints ordered by rarity/number
  // (base Double Rare → Ultra Rare → Special Illustration Rare). Rows = species with the
  // most prints (the set's flagship Megas).
  const bySpecies = new Map();
  for (const c of megas) {
    const k = megaSpecies(c);
    (bySpecies.get(k) ?? bySpecies.set(k, []).get(k)).push(c);
  }
  const ladders = [...bySpecies.values()]
    .map((prints) => prints.sort(byNum))
    .sort((a, b) => b.length - a.length || num(a[0]) - num(b[0]));
  const p1Ids = ladders.filter((l) => l.length >= 3).slice(0, 3).flatMap((l) => l.slice(0, 3).map(id));

  // P2 — the rest of the Megas + the set's dark-type stars + its special energies.
  const usedP1 = new Set(p1Ids);
  const restMegas = megas.filter((c) => !usedP1.has(id(c)));
  const darkStars = pool
    .filter((c) => isPokemon(c) && (c.types ?? []).includes('Darkness') && !/common|uncommon/i.test(c.rarity) && !/^mega\s/i.test(c.name) && num(c) <= 84)
    .sort(byNum);
  const energies = pool.filter((c) => (c.card_type ?? []).includes('Energy')).sort(byNum);
  const p2Ids = [...restMegas, ...darkStars, ...energies].slice(0, 9).map(id);

  // P3 — the story: each named character's base print beside their secret-rare prints,
  // then the partner Pokémon pair (base + Illustration Rare), then the extra story card.
  const prints = (name) => pool.filter((c) => lc(c.name) === lc(name)).sort(byNum);
  const p3 = [];
  for (const name of SET_CONFIG.storyNames) p3.push(...prints(name).slice(0, 2));
  p3.push(...prints(SET_CONFIG.partnerName).slice(0, 2));
  p3.push(...prints(SET_CONFIG.extraStoryName).slice(0, 1));
  const p3Ids = p3.slice(0, 9).map(id);

  const pages = [page(bid, 0, p1Ids), page(bid, 1, p2Ids), page(bid, 2, p3Ids)].filter(
    (p) => p.slots.length > 0,
  );
  return { id: bid, ...SET_CONFIG.showcase, isExample: true, coverCardId: firstCover(pages), pages };
}

// ---- 3) Beautiful Bulk ---------------------------------------------------------
function beautifulBulk() {
  const key = `rel-${SET_CONFIG.keyPrefix}-bulk`;
  const bid = key;
  const bulk = pool.filter((c) => ['Common', 'Uncommon', 'Rare'].includes(c.rarity) && num(c) <= 84);

  // Color blocks: Pokémon grouped by their energy type (set's dominant type first), then the
  // trainer cards (Supporter → Item → Tool → Stadium), then Energy. Number order within each.
  const typeCount = new Map();
  for (const c of bulk) for (const t of c.types ?? []) typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
  const typeOrder = [...typeCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const trainerOrder = ['Supporter', 'Item', 'Tool', 'Stadium', 'Energy'];

  const blockKey = (c) => {
    const t = (c.types ?? [])[0];
    if (t) return typeOrder.indexOf(t);
    const tt = trainerOrder.findIndex((k) => (c.card_type ?? []).includes(k));
    return 100 + (tt < 0 ? trainerOrder.length : tt);
  };
  const ordered = [...bulk].sort((a, b) => blockKey(a) - blockKey(b) || byNum(a, b));

  const pages = [];
  for (let p = 0; p * 9 < ordered.length; p += 1) {
    pages.push(page(bid, p, ordered.slice(p * 9, p * 9 + 9).map(id)));
  }
  return { id: bid, ...SET_CONFIG.bulk, isExample: true, coverCardId: firstCover(pages), pages };
}

// ---- assemble ------------------------------------------------------------------
const binders = [chaseBoard(), setShowcase(), beautifulBulk()];
writeFileSync(OUT, JSON.stringify(binders, null, 2) + '\n');

console.log(`Pool: ${pool.length} cards (set ${SET_CONFIG.setId})`);
for (const b of binders) {
  const cards = b.pages.reduce((n, pg) => n + pg.slots.length, 0);
  console.log(`  ${b.id.padEnd(30)} ${String(b.pages.length).padStart(2)} pages, ${String(cards).padStart(3)} cards  cover=${b.coverCardId}`);
}

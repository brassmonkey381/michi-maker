// @ts-nocheck
/**
 * Build the "upcoming release" example binders → src/data/releaseBinders.json.
 *
 * The release-day hook: for each configured set, up to three binders a collector would want
 * PREPPED before opening packs —
 *
 *   1. Chase Board      — the hits: the crown rarity centered on page 1, then the rest of the
 *                         hit tiers in prestige order. (hero / anchor pages)
 *   2. Set Showcase     — what makes THIS set special: Mega rarity ladders when the set has
 *                         Megas (one species per row, base → secret prints), or configured
 *                         species ladders (e.g. an anniversary set's Eevee-line base|ex pairs);
 *                         a "stars" page; and the story page pairing each named character's
 *                         base print with their secret-rare self. (themed_story)
 *   3. Beautiful Bulk   — every common/uncommon/rare, color-blocked by energy type so opening
 *                         piles of bulk still fills something that looks curated.
 *
 * Card pool comes LIVE from the tcgscan-data PostgREST API (public-read `cards` table,
 * publishable key from .env) — no dependency on the gated catalog. Slot images resolve at
 * runtime by id (hashed tier → TCGPlayer CDN fallback for unmirrored cards).
 *
 * Per-release knobs live in SET_CONFIGS (one entry per set, display order); the builders are
 * rule-driven and degrade gracefully (empty pages/binders are dropped), so tiny promo sets
 * work too. Run: `node scripts/build-release-binders.mjs`, then commit the JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'src', 'data', 'releaseBinders.json');

// ---- per-release configuration (display order) -------------------------------
const SET_CONFIGS = [
  {
    setId: 24688, // ME05: Pitch Black — releases 2026-07-17
    keyPrefix: 'pitch-black',
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
    storyNames: ["gladion's final battle", 'gwynn', 'rust syndicate grunt'],
    partnerName: 'silvally',
    extraStoryName: 'dark bell',
    starTypes: ['Darkness'],
  },
  {
    setId: 24722, // ME: 30th Celebration — releases 2026-09
    keyPrefix: '30th-celebration',
    chase: {
      title: '30th Celebration: Chase Board',
      description:
        'The anniversary special (September) — nineteen cards, and the ones to hunt: the Futuristic Rare Mewtwo ex and Mew ex crowns, the Illustration Rare quartet, and every anniversary ex. One page of history in the making.',
      layoutStyle: 'anchor',
    },
    showcase: {
      title: '30th Celebration: Anniversary Showcase',
      description:
        "Thirty years in one spread: the Eevee line's base-and-ex pairs, the anniversary exes and Illustration Rares, and Mew & Mewtwo closing the celebration the way they opened 1996.",
      layoutStyle: 'themed_story',
    },
    bulk: {
      title: '30th Celebration: Every Last Card',
      description:
        'A nineteen-card set is one you can actually COMPLETE — here are the commons and promo prints that finish it, organized by type. Fill the chase pages, then close the book with these.',
      layoutStyle: 'color_theme',
    },
    storyNames: [],
    partnerName: '',
    extraStoryName: '',
    starTypes: [],
    speciesLadders: ['eevee', 'espeon', 'umbreon'],
  },
  {
    setId: 24655, // ME04: Chaos Rising — released 2026-05
    keyPrefix: 'chaos-rising',
    chase: {
      title: 'Chaos Rising: Chase Board',
      description:
        'Still ripping ME04? Every hit in one place: the Mega Hyper Rare crown centered on page one, the Special Illustration Rares, the Illustration Rare wall, and the ex board — duplicate it and track your pulls.',
      layoutStyle: 'anchor',
    },
    showcase: {
      title: 'Chaos Rising: Mega Showcase',
      description:
        'The set’s identity: five Mega Evolutions climbing their rarity ladders one per row (base ex → secret prints), the Dragon-type stars that give ME04 its bite, and the AZ / Emma / Roxie supporter story beside their full-art selves.',
      layoutStyle: 'themed_story',
    },
    bulk: {
      title: 'Chaos Rising: Beautiful Bulk',
      description:
        'Seventy-six commons, uncommons and rares, color-blocked by energy type — the binder that makes a stack of ME04 bulk look like a curated collection instead of a shoebox.',
      layoutStyle: 'color_theme',
    },
    storyNames: ["az's tranquility", 'emma', "roxie's performance", 'philippe'],
    partnerName: '',
    extraStoryName: '',
    starTypes: ['Dragon'],
  },
];

// ---- fetch ---------------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const API_KEY = env.EXPO_PUBLIC_CATALOG_API_KEY;
const API_URL = `${new URL(env.EXPO_PUBLIC_CATALOG_BROWSE_URL).origin}/rest/v1`;

async function fetchPool(setId) {
  const res = await fetch(
    `${API_URL}/cards?set_id=eq.${setId}&select=id,name,number,rarity,types,card_type&order=number`,
    { headers: { apikey: API_KEY } },
  );
  if (!res.ok) throw new Error(`cards fetch ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---- helpers ---------------------------------------------------------------------
const num = (c) => parseInt(String(c.number).split('/')[0], 10) || 0;
const byNum = (a, b) => num(a) - num(b);
const lc = (s) => (s ?? '').toLowerCase();
const isPokemon = (c) => (c.card_type ?? []).includes('Pokemon');
const megaSpecies = (c) => lc(c.name).replace(/^mega\s+/, '').replace(/\s+ex$/, '').trim();

/** Bulk (non-hit) rarities; everything else is a chase tier. */
const BULK_RARITIES = new Set(['Common', 'Uncommon', 'Rare', 'None', '']);
/** Hit tiers in prestige order; unlisted hit rarities append by scarcity (count asc). */
const PRESTIGE = [
  'Mega Hyper Rare',
  'Futuristic Rare',
  'Hyper Rare',
  'Special Illustration Rare',
  'Illustration Rare',
  'Ultra Rare',
  'Double Rare',
  'ACE SPEC Rare',
];

/** The set's printed base size — the collector-number denominator ("008/084" → 84). */
function baseSize(pool) {
  const counts = new Map();
  for (const c of pool) {
    const d = parseInt(String(c.number).split('/')[1], 10);
    if (Number.isFinite(d)) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best = Number.MAX_SAFE_INTEGER;
  let bestN = 0;
  for (const [d, n] of counts) if (n > bestN) [best, bestN] = [d, n];
  return bestN > 0 ? best : Number.MAX_SAFE_INTEGER;
}

/** Hit tiers present in the pool, prestige order first, unknown tiers by scarcity. */
function hitTiers(pool) {
  const present = new Map();
  for (const c of pool) {
    if (BULK_RARITIES.has(c.rarity ?? '')) continue;
    present.set(c.rarity, (present.get(c.rarity) ?? 0) + 1);
  }
  const known = PRESTIGE.filter((r) => present.has(r));
  const unknown = [...present.keys()]
    .filter((r) => !PRESTIGE.includes(r))
    .sort((a, b) => present.get(a) - present.get(b));
  return [...known, ...unknown];
}

function slot(binderId, pageIdx, row, col, cardId) {
  return { id: `${binderId}_p${pageIdx}_r${row}c${col}`, row, col, rowSpan: 1, colSpan: 1, type: 'card', cardId: String(cardId) };
}

/** A page from an ordered id list (row-major). `center` puts ids[0] in the middle pocket. */
function page(binderId, pageIdx, ids, { rows = 3, cols = 3, center = false } = {}) {
  let order = ids;
  if (center && ids.length > 0) {
    const mid = Math.floor((rows * cols) / 2);
    order = [];
    let ring = 1;
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

function makeBinder(key, meta, pages) {
  const kept = pages.filter((p) => p.slots.length > 0);
  if (kept.length === 0) return null;
  return { id: key, ...meta, isExample: true, coverCardId: firstCover(kept), pages: kept };
}

// ---- 1) Chase Board ----------------------------------------------------------
function chaseBoard(cfg, pool) {
  const key = `rel-${cfg.keyPrefix}-chase`;
  const tiers = hitTiers(pool);
  if (tiers.length === 0) return null;
  const byTier = (r) => pool.filter((c) => c.rarity === r).sort(byNum);
  const ordered = tiers.flatMap(byTier);
  if (ordered.length === 0) return null;

  // P1: the crown (first card of the rarest tier) centered, ringed by the next 8 hits.
  const pages = [page(key, 0, ordered.slice(0, 9).map(id), { center: true })];
  // Then the rest of the hits, 9 per page (a 3×4 final page when it tidies the remainder).
  let rest = ordered.slice(9);
  let p = 1;
  while (rest.length > 0) {
    const take = rest.length > 9 && rest.length <= 12 ? 12 : 9;
    pages.push(page(key, p, rest.slice(0, take).map(id), take === 12 ? { rows: 3, cols: 4 } : {}));
    rest = rest.slice(take);
    p += 1;
  }
  return makeBinder(key, cfg.chase, pages);
}

// ---- 2) Set Showcase ---------------------------------------------------------
function setShowcase(cfg, pool) {
  const key = `rel-${cfg.keyPrefix}-showcase`;
  const used = new Set();
  const pages = [];
  let p = 0;

  // P1 — ladders: one species per ROW, its prints ordered by number (base → secret).
  // Megas when the set has them; else the configured species (anniversary lines etc.).
  const megas = pool.filter((c) => /^mega\s/i.test(c.name)).sort(byNum);
  let ladders = [];
  if (megas.length > 0) {
    const bySpecies = new Map();
    for (const c of megas) {
      const k = megaSpecies(c);
      (bySpecies.get(k) ?? bySpecies.set(k, []).get(k)).push(c);
    }
    ladders = [...bySpecies.values()].sort((a, b) => b.length - a.length || num(a[0]) - num(b[0]));
  } else if (cfg.speciesLadders?.length) {
    ladders = cfg.speciesLadders
      .map((sp) => pool.filter((c) => lc(c.name).includes(sp)).sort(byNum))
      .filter((l) => l.length > 0);
  }
  const ladderIds = ladders.filter((l) => l.length >= 2).slice(0, 3).flatMap((l) => {
    const row = l.slice(0, 3);
    row.forEach((c) => used.add(id(c)));
    return row.map(id);
  });
  if (ladderIds.length > 0) pages.push(page(key, p++, ladderIds));

  // P2 — the stars: leftover ladder species prints, the configured star types' non-bulk cards,
  // special energies, then any remaining hits — the set's identity in one page.
  const isBulk = (c) => BULK_RARITIES.has(c.rarity ?? '');
  const starTyped = pool.filter(
    (c) => isPokemon(c) && !isBulk(c) && (c.types ?? []).some((t) => (cfg.starTypes ?? []).includes(t)),
  );
  const energies = pool.filter((c) => (c.card_type ?? []).includes('Energy') && !isBulk(c));
  const leftoverMegas = megas.filter((c) => !used.has(id(c)));
  const remainingHits = pool.filter((c) => !isBulk(c) && isPokemon(c)).sort(byNum);
  const stars = [];
  for (const c of [...leftoverMegas, ...starTyped, ...energies, ...remainingHits]) {
    if (used.has(id(c)) || stars.includes(id(c))) continue;
    stars.push(id(c));
    if (stars.length === 9) break;
  }
  stars.forEach((sid) => used.add(sid));
  if (stars.length > 0) pages.push(page(key, p++, stars));

  // P3 — the story: each named character's base print beside their secret prints, then the
  // partner Pokémon pair, then the extra story card.
  const prints = (name) => pool.filter((c) => lc(c.name) === lc(name)).sort(byNum);
  const story = [];
  for (const name of cfg.storyNames ?? []) story.push(...prints(name).slice(0, 2));
  if (cfg.partnerName) story.push(...prints(cfg.partnerName).slice(0, 2));
  if (cfg.extraStoryName) story.push(...prints(cfg.extraStoryName).slice(0, 1));
  const storyIds = story.slice(0, 9).map(id);
  if (storyIds.length > 0) pages.push(page(key, p++, storyIds));

  return makeBinder(key, cfg.showcase, pages);
}

// ---- 3) Beautiful Bulk ---------------------------------------------------------
function beautifulBulk(cfg, pool) {
  const key = `rel-${cfg.keyPrefix}-bulk`;
  const base = baseSize(pool);
  const bulk = pool.filter((c) => BULK_RARITIES.has(c.rarity ?? '') && num(c) <= base);
  if (bulk.length === 0) return null;

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
    pages.push(page(key, p, ordered.slice(p * 9, p * 9 + 9).map(id)));
  }
  return makeBinder(key, cfg.bulk, pages);
}

// ---- assemble ------------------------------------------------------------------
const binders = [];
for (const cfg of SET_CONFIGS) {
  const pool = await fetchPool(cfg.setId);
  if (pool.length === 0) {
    console.warn(`  !! empty pool for set ${cfg.setId} — skipped`);
    continue;
  }
  for (const b of [chaseBoard(cfg, pool), setShowcase(cfg, pool), beautifulBulk(cfg, pool)]) {
    if (b) binders.push(b);
  }
}
writeFileSync(OUT, JSON.stringify(binders, null, 2) + '\n');

for (const b of binders) {
  const cards = b.pages.reduce((n, pg) => n + pg.slots.length, 0);
  console.log(`  ${b.id.padEnd(34)} ${String(b.pages.length).padStart(2)} pages, ${String(cards).padStart(3)} cards  cover=${b.coverCardId}`);
}

// @ts-nocheck
/**
 * Build catalog-driven example binders → src/data/generatedBinders.json.
 *
 * Reads the browse data (public/browse/{catalog,prices-summary,alternates}.json), applies
 * each approved selectionRule deterministically, and emits a DemoBinder[] where every card
 * slot is a standard 1×1 `type:'card'` slot whose `cardId` is the TCGPlayer id (images
 * resolve at runtime via resolveCard → /card-imgs/<id>.jpg).
 *
 * Only cards whose local image file (public/card-imgs/<id>.jpg) exists are ever included.
 * Node ESM, built-ins only. Run: `node scripts/build-example-binders.mjs`.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BROWSE = join(ROOT, 'public', 'browse');
const IMG_DIR = join(ROOT, 'public', 'card-imgs');
const OUT = join(ROOT, 'src', 'data', 'generatedBinders.json');

// ---- load sources ---------------------------------------------------------
const catalog = JSON.parse(readFileSync(join(BROWSE, 'catalog.json'), 'utf8'));
const prices = JSON.parse(readFileSync(join(BROWSE, 'prices-summary.json'), 'utf8'));
const alternates = JSON.parse(readFileSync(join(BROWSE, 'alternates.json'), 'utf8'));

/** Set of local image filenames that actually exist on disk. */
const imgFiles = new Set(readdirSync(IMG_DIR));

/** All catalog cards keyed by string id. */
const cardsById = new Map();
for (const c of Object.values(catalog.cards)) cardsById.set(String(c.id), c);

// ---- predicates & keys ----------------------------------------------------

/** Does this card have a local /card-imgs/<file>.jpg on disk? */
function hasImage(card) {
  if (!card || !card.image) return false;
  return imgFiles.has(basename(card.image));
}

/** Collector-number sort key: parseInt(number.split('/')[0]); missing → +∞. */
function collectorNum(card) {
  const raw = String(card.number ?? '').split('/')[0];
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** Numeric market price (prices-summary.cur) for an id, or undefined. */
function priceOf(id) {
  const p = prices[String(id)];
  return p && typeof p.cur === 'number' ? p.cur : undefined;
}

const idNum = (card) => parseInt(String(card.id), 10) || 0;

/** Every local-image card, once. */
const localCards = [...cardsById.values()].filter(hasImage);

// ---- selection rules → ordered id lists -----------------------------------

/** base-set-completion: set_id 604, all local, collector-number asc, tie-break lowest id. */
function baseSetCompletion() {
  return localCards
    .filter((c) => c.set_id === 604)
    .sort((a, b) => collectorNum(a) - collectorNum(b) || idNum(a) - idNum(b))
    .map((c) => String(c.id));
}

/** newest-era-mega-evolution: set_id 24380 (ME01), all local, collector-number asc. */
function megaEvolution() {
  return localCards
    .filter((c) => c.set_id === 24380)
    .sort((a, b) => collectorNum(a) - collectorNum(b) || idNum(a) - idNum(b))
    .map((c) => String(c.id));
}

/** scarlet-violet-series-showcase: lowest-collector rep per SV set, ordered by set release. */
function svSeriesShowcase() {
  const setIds = (catalog.series['Scarlet & Violet']?.set_ids ?? []).map(Number);
  const reps = [];
  for (const setId of setIds) {
    const inSet = localCards
      .filter((c) => c.set_id === setId)
      .sort((a, b) => collectorNum(a) - collectorNum(b) || idNum(a) - idNum(b));
    if (inSet.length === 0) continue; // skip sets with zero usable reps
    // set release_date = earliest release_date among the set's local cards
    const release = inSet
      .map((c) => c.release_date || '')
      .filter(Boolean)
      .sort()[0] ?? '';
    reps.push({ id: String(inSet[0].id), release, setId });
  }
  reps.sort((a, b) => (a.release || '').localeCompare(b.release || '') || a.setId - b.setId);
  return reps.map((r) => r.id);
}

/** prismatic-rarity-ladder: one top-cur card per rarity tier, in ladder order. */
function prismaticLadder() {
  const ladder = [
    'Common',
    'Uncommon',
    'Rare',
    'Double Rare',
    'ACE SPEC Rare',
    'Ultra Rare',
    'Special Illustration Rare',
    'Hyper Rare',
  ];
  const pool = localCards.filter((c) => c.set_id === 23821);
  const out = [];
  for (const tier of ladder) {
    const tierCards = pool
      .filter((c) => c.rarity === tier)
      .sort((a, b) => {
        const pa = priceOf(a.id) ?? -1;
        const pb = priceOf(b.id) ?? -1;
        return pb - pa || collectorNum(a) - collectorNum(b);
      });
    if (tierCards.length) out.push(String(tierCards[0].id));
  }
  return out;
}

/** grail-wall: top 18 priced local cards by cur desc. */
function grailWall() {
  return localCards
    .filter((c) => priceOf(c.id) !== undefined)
    .sort((a, b) => priceOf(b.id) - priceOf(a.id) || idNum(a) - idNum(b))
    .slice(0, 18)
    .map((c) => String(c.id));
}

/** dollar-bin-holos: Holo Rare, 0 < cur <= 2, cheapest first; take 45. */
function dollarBinHolos() {
  return localCards
    .filter((c) => {
      if (c.rarity !== 'Holo Rare') return false;
      const p = priceOf(c.id);
      return p !== undefined && p > 0 && p <= 2.0;
    })
    .sort((a, b) => {
      const pa = priceOf(a.id);
      const pb = priceOf(b.id);
      if (pa !== pb) return pa - pb;
      const rd = (b.release_date || '').localeCompare(a.release_date || '');
      if (rd !== 0) return rd;
      return idNum(a) - idNum(b);
    })
    .slice(0, 45)
    .map((c) => String(c.id));
}

/** sv-supporter-gallery: SV Supporters, top 18 by cur desc. */
function svSupporters() {
  const setIds = new Set((catalog.series['Scarlet & Violet']?.set_ids ?? []).map(Number));
  return localCards
    .filter((c) => setIds.has(c.set_id) && (c.card_type ?? []).includes('Supporter'))
    .sort((a, b) => {
      const pa = priceOf(a.id) ?? -1;
      const pb = priceOf(b.id) ?? -1;
      return pb - pa || idNum(a) - idNum(b);
    })
    .slice(0, 18)
    .map((c) => String(c.id));
}

/**
 * vintage-vs-modern-grails: two pages of 9.
 * Returns { vintage: id[], modern: id[] }.
 */
function vintageVsModern() {
  const priced = localCards.filter((c) => {
    const p = priceOf(c.id);
    return p !== undefined && p > 0;
  });
  const byCur = (a, b) => priceOf(b.id) - priceOf(a.id) || idNum(a) - idNum(b);
  const vintage = priced
    .filter((c) => (c.release_date || '') < '2001-01-01' && c.release_date)
    .sort(byCur)
    .slice(0, 9)
    .map((c) => String(c.id));
  const modern = priced
    .filter((c) => (c.release_date || '') >= '2025-01-01')
    .sort(byCur)
    .slice(0, 9)
    .map((c) => String(c.id));
  return { vintage, modern };
}

/**
 * reprints-doppelgangers: top 9 cross_set_reprint Pokémon groups, fully imaged.
 * Returns an array of groups, each group an array of member ids ordered by release asc.
 */
function reprintGroups() {
  const groups = [];
  for (const [anchorId, info] of Object.entries(alternates)) {
    if (info.reason !== 'cross_set_reprint') continue;
    const anchor = cardsById.get(String(anchorId));
    if (!anchor || !(anchor.card_type ?? []).includes('Pokemon')) continue;
    const memberIds = [String(anchorId), ...(info.alternates ?? []).map((a) => String(a.id))];
    // every member must have a catalog entry AND a local image
    const members = memberIds.map((id) => cardsById.get(id));
    if (members.some((m) => !m || !hasImage(m))) continue;
    if (members.length < 2) continue;
    const anchorCur = priceOf(anchorId) ?? 0;
    groups.push({ members, anchorCur });
  }
  groups.sort(
    (a, b) => b.members.length - a.members.length || b.anchorCur - a.anchorCur,
  );
  return groups.slice(0, 9).map((g) =>
    g.members
      .slice()
      .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || '') || idNum(a) - idNum(b))
      .map((m) => String(m.id)),
  );
}

// ---- page builders --------------------------------------------------------

function slot(binderId, pageIdx, row, col, cardId) {
  return {
    id: `${binderId}_p${pageIdx}_r${row}c${col}`,
    row,
    col,
    rowSpan: 1,
    colSpan: 1,
    type: 'card',
    cardId,
  };
}

/** Paginate a flat id list row-major into rows×cols pages. */
function gridPages(binderId, ids, rows = 3, cols = 3) {
  const perPage = rows * cols;
  const pages = [];
  for (let p = 0; p * perPage < ids.length; p += 1) {
    const chunk = ids.slice(p * perPage, (p + 1) * perPage);
    const slots = chunk.map((id, i) =>
      slot(binderId, p, Math.floor(i / cols), i % cols, id),
    );
    pages.push({ id: `${binderId}_p${p}`, rows, cols, slots });
  }
  return pages;
}

/** One page per fixed id list (each already ≤ rows*cols). */
function fixedPages(binderId, lists, rows = 3, cols = 3) {
  return lists.map((ids, p) => ({
    id: `${binderId}_p${p}`,
    rows,
    cols,
    slots: ids.map((id, i) => slot(binderId, p, Math.floor(i / cols), i % cols, id)),
  }));
}

/** One group per ROW: `rows` groups per page, members left-to-right. */
function rowPages(binderId, groups, rows = 3, cols = 3) {
  const pages = [];
  for (let p = 0; p * rows < groups.length; p += 1) {
    const chunk = groups.slice(p * rows, (p + 1) * rows);
    const slots = [];
    chunk.forEach((members, r) => {
      members.slice(0, cols).forEach((id, c) => {
        slots.push(slot(binderId, p, r, c, id));
      });
    });
    pages.push({ id: `${binderId}_p${p}`, rows, cols, slots });
  }
  return pages;
}

const firstCover = (pages) => {
  for (const pg of pages) for (const s of pg.slots) if (s.cardId) return s.cardId;
  return undefined;
};

function makeBinder({ key, title, description, layoutStyle, pages }) {
  const id = `gen-${key}`;
  return { id, title, description, layoutStyle, isExample: true, coverCardId: firstCover(pages), pages };
}

// ---- assemble -------------------------------------------------------------

const META = {
  'base-set-completion': { title: 'Base Set: All 102', description: 'The one that started it all. Every 1999 Base Set card in collector-number order, a full run from Alakazam #1 to the last common.', layoutStyle: 'freeform' },
  'scarlet-violet-series-showcase': { title: 'Scarlet & Violet: One from Every Set', description: 'A tour of the whole Scarlet & Violet era — the opening card of every set, from the Base Set to White Flare, in release order.', layoutStyle: 'freeform' },
  'prismatic-rarity-ladder': { title: 'Prismatic Evolutions: Common to Hyper', description: 'Climb the rarity ladder of one modern set — one standout card from each tier, common all the way up to the gold Hyper Rare.', layoutStyle: 'themed_story' },
  'grail-wall': { title: 'The Grail Wall', description: "The heaviest hitters in the whole catalog by market price — a $10,000 Shadowless Charizard leads a wall of chase cards you'll probably never touch.", layoutStyle: 'full_page_spread' },
  'dollar-bin-holos': { title: 'Dollar-Bin Holos', description: "Proof that a shiny binder doesn't need a big budget — Holo Rares you can grab for pocket change, cheapest first.", layoutStyle: 'freeform' },
  'reprints-doppelgangers': { title: 'Same Art, Different Set', description: 'Doppelgangers — the same Pokémon artwork reprinted across sets. Each row is one card wearing different set symbols and numbers; read the bottom to tell them apart.', layoutStyle: 'themed_story' },
  'vintage-vs-modern-grails': { title: '1999 vs Now: Grail Face-Off', description: "The WoTC old guard on one page, today's chase cards on the next — the priciest survivors of the first era against the newest heavy hitters.", layoutStyle: 'anchor' },
  'sv-supporter-gallery': { title: 'The Support Cast', description: "No Pokémon allowed — a gallery of Scarlet & Violet's Supporter cards, the trainers and characters that run the deck, led by the priciest full-arts.", layoutStyle: 'freeform' },
  'newest-era-mega-evolution': { title: 'Newest Era: Mega Evolution 01', description: 'Fresh off the press — the debut mainline set of the Mega Evolution era (Sept 2025), every available card in collector order.', layoutStyle: 'freeform' },
};

const binders = [];

function push(key, pages) {
  binders.push(makeBinder({ key, ...META[key], pages }));
}

push('base-set-completion', gridPages('gen-base-set-completion', baseSetCompletion()));
push('scarlet-violet-series-showcase', gridPages('gen-scarlet-violet-series-showcase', svSeriesShowcase()));
push('prismatic-rarity-ladder', gridPages('gen-prismatic-rarity-ladder', prismaticLadder()));
push('grail-wall', gridPages('gen-grail-wall', grailWall()));
push('dollar-bin-holos', gridPages('gen-dollar-bin-holos', dollarBinHolos()));
push('reprints-doppelgangers', rowPages('gen-reprints-doppelgangers', reprintGroups()));
{
  const { vintage, modern } = vintageVsModern();
  push('vintage-vs-modern-grails', fixedPages('gen-vintage-vs-modern-grails', [vintage, modern]));
}
push('sv-supporter-gallery', gridPages('gen-sv-supporter-gallery', svSupporters()));
push('newest-era-mega-evolution', gridPages('gen-newest-era-mega-evolution', megaEvolution()));

writeFileSync(OUT, JSON.stringify(binders, null, 2) + '\n');

// ---- summary --------------------------------------------------------------
console.log(`Local-image card pool: ${localCards.length} / ${cardsById.size} catalog cards`);
console.log(`Wrote ${binders.length} example binders → ${OUT}\n`);
let totalCards = 0;
for (const b of binders) {
  const cards = b.pages.reduce((n, pg) => n + pg.slots.length, 0);
  totalCards += cards;
  console.log(`  ${b.id.padEnd(34)} ${String(b.pages.length).padStart(2)} pages, ${String(cards).padStart(3)} cards  cover=${b.coverCardId}`);
}
console.log(`\nTotal card slots: ${totalCards}`);

/**
 * ARRANGE LAB, step 1: build the blind review rounds.
 *
 * The same shape as the Colour Lab (tcgscan-data-science, color_lab.py): the owner sees several
 * finished pages side by side, never told which mode or setting made which, and picks the one
 * that reads best (or ties, or none). Every pick is a row in votes.jsonl; results.mjs tallies them
 * per hidden variant. Nothing here is published and the app is not touched.
 *
 * SINGLE PAGES ONLY, and every pool is ALL FULL ARTS or ALL WINDOWED cards (owner, 2026-10-21;
 * the product's constraint too, so the bench only tests what ships). Pools come from two places:
 *   page   the owner's own full pages (fakemichi, michimaker): 3x3 and 3x4 pages holding only
 *          one-by-one cards of one art class. What Arrange actually meets.
 *   theme  12 cards sharing a scene (lava, sea, forest, night, snow, city), four per depth band,
 *          one pool of full arts and one of windowed cards per theme, on a 3x4 page: the pools
 *          where Strata has something to say.
 *
 * Card facts come straight from the data project's cards_en (the pipeline's columns), and the depth
 * words are the card's scene tags filtered to the stratum vocabulary in caption order, which is
 * exactly what `score_cards_by_theme` hands the app. The seating is the real module,
 * src/data/arrange.ts, imported as TypeScript by Node.
 *
 * Tests (which column is which is hidden in the page; columns are shuffled per round):
 *   duel      the ARRANGER (data/arranger) as it stands, against a copy with one weight nudged
 *             (halved or doubled); the owner picks the page that reads better. results.mjs
 *             tallies per nudge, and `--adopt` moves the champion (weights.json) to the nudges
 *             that won; the app's ARRANGER_WEIGHTS then follows by hand.
 *   misses    the arranger's own answer, big; click the cards that sit wrong (per-card precision)
 *
 * Likeness between the pool's cards is read straight off cards_en.embedding here (cosine, the
 * same number Find Similar hands the app), one query per pool.
 *
 *   node scripts/arrange-lab/build.mjs            -> state/out/arrange-lab/rounds.json
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT, appSql, dataSql, cardImageUrl, fail, imageManifest, q, step, textArray } from '../lib/michi.mjs';

const src = (p) => pathToFileURL(join(ROOT, 'src', p)).href;
const A = await import(src('data/arrange.ts'));
const R = await import(src('data/arranger.ts'));
const { ART_TEMPLATES } = await import(src('data/artTemplates.ts'));

const OUT_DIR = join(ROOT, 'state', 'out', 'arrange-lab');
const OUT = join(OUT_DIR, 'rounds.json');
/** The champion so far: ARRANGER_WEIGHTS under any nudges earlier runs adopted (results.mjs --adopt). */
const WEIGHTS_FILE = join(OUT_DIR, 'weights.json');
const champion = { ...R.ARRANGER_WEIGHTS, ...(existsSync(WEIGHTS_FILE) ? JSON.parse(readFileSync(WEIGHTS_FILE, 'utf8')) : {}) };
const SEED = 20261021;

// Deterministic shuffles, so a rebuild with the same data keeps the same rounds and their votes.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (xs, r) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------------------------

const THEMES = [
  { label: 'lava', tags: ['scene:lava', 'scene:volcano'] },
  { label: 'sea', tags: ['scene:underwater', 'scene:ocean', 'scene:beach', 'scene:coral'] },
  { label: 'forest', tags: ['scene:forest', 'scene:jungle', 'scene:meadow'] },
  { label: 'night', tags: ['scene:stars', 'scene:moon', 'scene:space', 'scene:night'] },
  { label: 'snow', tags: ['scene:snow', 'scene:ice', 'scene:mountain'] },
  { label: 'city', tags: ['scene:city', 'scene:town', 'scene:road'] },
];

step(1, 'the owner\'s full pages: 3x3 and 3x4, cards only');
// Every page of the two house accounts holding only one-by-one cards, with its rank inside the
// binder (for the label). Art class is checked once the card facts are in: a page that mixes
// full arts and windowed cards is left out, as the product leaves it out.
const pages = await appSql(`
  with pg as (
    select p.id, p.binder_id, p.rows, p.cols, b.title,
           row_number() over (partition by p.binder_id order by p.position, p.created_at) - 1 as rank,
           count(s.id) filter (where s.slot_type = 'card' and s.card_id is not null and s.row_span = 1 and s.col_span = 1) as cards,
           count(s.id) filter (where s.slot_type <> 'card' or s.row_span > 1 or s.col_span > 1) as other
      from public.binder_pages p
      join public.binders b on b.id = p.binder_id
      join public.profiles pr on pr.id = b.owner_id
      left join public.binder_slots s on s.page_id = p.id
     where pr.username in ('fakemichi', 'michimaker')
     group by p.id, p.binder_id, p.rows, p.cols, b.title, p.position, p.created_at)
  select id, binder_id, rows, cols, title, rank::int as rank, cards::int as cards
    from pg where other = 0 and cards = rows * cols and rows = 3 and cols in (3, 4)
   order by binder_id, rank;`);
if (pages.length < 20) fail(`only ${pages.length} full pages found; expected hundreds`);
console.log(`  ${pages.length} full pages`);

const slots = await appSql(`
  select page_id, card_id, row_index, col_index from public.binder_slots
   where page_id in (${pages.map((p) => q(p.id)).join(',')}) and slot_type = 'card' and card_id is not null and row_span = 1 and col_span = 1;`);
const slotsByPage = new Map();
for (const s of slots) slotsByPage.set(s.page_id, [...(slotsByPage.get(s.page_id) ?? []), s]);

step(2, 'theme pools from the card catalog');
// Each theme gives two pools, one of full arts and one of windowed cards, each STRATIFIED: four
// cards whose first depth word is sky, four ground, four underground (a short band gives its
// pockets to the others), so Strata has the material it would have on a page the owner built
// for it. Hash-ordered, so a rebuild draws the same cards.
const DEPTH_TAGS = new Set(A.depthTagQuery());
const themePools = [];
for (const t of THEMES) {
  const rows = await dataSql(`
    select id, scene_tags, full_art_kind from public.cards_en
     where scene_tags && ${textArray(t.tags)} and color_art is not null
     order by md5(id || ${q(String(SEED))}) limit 1200;`);
  for (const cls of ['full', 'windowed']) {
    const byBand = { above: [], surface: [], below: [], free: [] };
    for (const r of rows) {
      if (A.artClassOf(r.full_art_kind) !== cls) continue;
      byBand[A.depthOf({ depthWords: (r.scene_tags ?? []).filter((x) => DEPTH_TAGS.has(x)) }).depth ?? 'free'].push(r.id);
    }
    const take = [];
    const got = {};
    for (const b of ['above', 'surface', 'below']) {
      const xs = byBand[b].splice(0, 4);
      got[b] = xs.length;
      take.push(...xs);
    }
    for (const b of ['surface', 'above', 'below', 'free']) while (take.length < 12 && byBand[b].length) take.push(byBand[b].shift());
    if (take.length < 12) {
      console.log(`  ${t.label} ${cls}: only ${take.length} cards, skipped`);
      continue;
    }
    themePools.push({ label: `${t.label} ${cls}`, cls, ids: take });
    console.log(`  ${t.label} ${cls}: 12 cards (sky ${got.above}, ground ${got.surface}, underground ${got.below})`);
  }
}

step(3, 'card facts and pictures');
const r0 = rng(SEED);
// More pages than the rounds need, because the art-class check below drops the mixed ones.
const pagePick = shuffle(pages.filter((p) => p.cols === 3), r0).slice(0, 80);
const wide = shuffle(pages.filter((p) => p.cols === 4), r0).slice(0, 20);
const wantIds = new Set();
for (const p of [...pagePick, ...wide]) for (const s of slotsByPage.get(p.id)) wantIds.add(s.card_id);
for (const t of themePools) for (const id of t.ids) wantIds.add(id);
const ids = [...wantIds];
const facts = new Map();
for (let i = 0; i < ids.length; i += 400) {
  const rows = await dataSql(`
    select id, name, set_name, number, rarity, illustrator, evolution_line, evolution_stage_index, full_art_kind, full_art, scene_tags, color_art, types
      from public.cards_en where id = any(${textArray(ids.slice(i, i + 400))});`);
  for (const r of rows) facts.set(r.id, r);
}
const manifest = await imageManifest();

/** Pairwise likeness among a pool's cards: cosine between their art embeddings, 0..1. */
async function similarityOf(ids) {
  const rows = await dataSql(`
    select a.id as a, b.id as b, (1 - (a.embedding <=> b.embedding))::float as sim
      from public.cards_en a join public.cards_en b on b.id > a.id
     where a.id = any(${textArray(ids)}) and b.id = any(${textArray(ids)})
       and a.embedding is not null and b.embedding is not null;`);
  const sim = new Map();
  const put = (x, y, v) => {
    if (!sim.has(x)) sim.set(x, new Map());
    sim.get(x).set(y, Math.max(0, Math.min(1, v)));
  };
  for (const r of rows) {
    put(r.a, r.b, r.sim);
    put(r.b, r.a, r.sim);
  }
  return sim;
}
function arrangeCard(id) {
  const f = facts.get(id);
  if (!f) return null;
  return {
    id,
    name: f.name,
    depthWords: (f.scene_tags ?? []).filter((t) => DEPTH_TAGS.has(t)),
    evolutionLine: f.evolution_line ?? [],
    evolutionStage: (f.evolution_stage_index ?? -2) + 1,
    illustrator: f.illustrator || undefined,
    setId: f.set_name || undefined,
    number: f.number || undefined,
    fullArtKind: f.full_art_kind || undefined,
    fullArt: typeof f.full_art === 'boolean' ? f.full_art : undefined,
    rarity: f.rarity || undefined,
    palette: (f.color_art ?? []).map(([L, a, b, w]) => ({ L, a, b, w })),
    types: f.types ?? [],
  };
}
const cardInfo = {};
let missingImg = 0;
for (const id of ids) {
  const f = facts.get(id);
  if (!f) continue;
  const img = cardImageUrl(manifest, id);
  if (!img) missingImg += 1;
  cardInfo[id] = { name: f.name, set: f.set_name, img: img ?? '' };
}
console.log(`  ${facts.size} cards described, ${missingImg} without a picture`);

// ---------------------------------------------------------------------------------------------
// Seating helpers
// ---------------------------------------------------------------------------------------------

/** The canvas as the page draws it: every cell, with the card, art, or open state. */
function gridOf(shape, placements, artKeys) {
  const at = new Map(placements.map((p) => [A.cellKey(p.cell), p.cardId]));
  return A.allCells(shape.rows, shape.cols, shape.spread).map((cell) => {
    const k = A.cellKey(cell);
    const card = at.get(k);
    return { leaf: cell.leaf, row: cell.row, col: cell.col, card: card ?? null, art: !card && artKeys.has(k), open: !card && !artKeys.has(k) };
  });
}

const signature = (grid) => grid.map((c) => c.card ?? (c.art ? '#' : '.')).join('|');

const cardsOfPage = (p) => slotsByPage.get(p.id).map((s) => arrangeCard(s.card_id)).filter(Boolean);
const poolOfPage = (p) => ({ kind: 'page', label: `${p.title ?? 'untitled'} p${p.rank + 1}`, shape: { rows: p.rows, cols: p.cols, spread: false }, cards: cardsOfPage(p), current: new Map(slotsByPage.get(p.id).map((s) => [s.card_id, { leaf: 'single', row: s.row_index, col: s.col_index }])) });
const poolOfTheme = (t) => ({ kind: 'theme', label: t.label, shape: { rows: 3, cols: 4, spread: false }, cards: t.ids.map(arrangeCard).filter(Boolean) });

// A pool whose cards repeat an id (the same card twice on a page) is skipped: Arrange seats by
// pocket in the app, but here the picture is the card, and two of one card would read as a bug.
// A pool that mixes full arts and windowed cards is skipped because the product skips it.
const clean = (pool) => new Set(pool.cards.map((c) => c.id)).size === pool.cards.length && !A.pageArtMix(pool.cards).mixed;

const allPagePools = [...pagePick.map(poolOfPage), ...wide.map(poolOfPage)];
const pagePools = allPagePools.filter(clean);
const theme = themePools.map(poolOfTheme).filter(clean);
console.log(`  ${pagePools.length} of ${allPagePools.length} owner pages are one art class (${pagePools.filter((p) => A.pageArtMix(p.cards).full).length} full art, ${pagePools.filter((p) => !A.pageArtMix(p.cards).full).length} windowed)`);
if (pagePools.length < 12) fail('too few one-class owner pages');

// ---------------------------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------------------------

step(4, 'rounds');
const rounds = [];
const r1 = rng(SEED + 1);
const usedCards = new Set();
const noteCards = (grid) => grid.forEach((c) => c.card && usedCards.add(c.card));

// The arranger's answer on a pool, as a column.
function arrangerColumn(pool, weights, sim) {
  const templates = ART_TEMPLATES.filter((t) => t.rows === pool.shape.rows && t.cols === pool.shape.cols && t.spread === pool.shape.spread);
  const a = R.arrangePage({ ...pool.shape, cards: pool.cards, templates, current: pool.current, similarity: sim, weights });
  if (!a) return null;
  const b = a.best;
  const artKeys = b.template ? A.templateCells(b.template, pool.shape.spread) : new Set();
  return { grid: gridOf(pool.shape, b.placements, artKeys), held: b.held.map((c) => c.id), template: b.template?.id ?? 'page', terms: b.terms, score: b.score, reason: b.reason };
}

// duel: the champion against one nudge, on pools where the nudge changes the answer.
const NUDGES = [];
for (const term of ['palette', 'similar', 'rowSimilar', 'depth', 'lines', 'type', 'art', 'held', 'open']) for (const factor of [0.5, 2]) NUDGES.push({ term, factor });
{
  const pools = shuffle([...theme, ...pagePools], r1);
  const simOf = new Map();
  for (const pool of pools) simOf.set(pool.label, await similarityOf(pool.cards.map((c) => c.id)));
  let n = 0;
  const perNudge = new Map();
  for (const nudge of shuffle(NUDGES, r1)) {
    const challenger = { ...champion, [nudge.term]: champion[nudge.term] * nudge.factor };
    let got = 0;
    for (const pool of shuffle(pools, r1)) {
      if (got >= 2) break;
      const sim = simOf.get(pool.label);
      const a = arrangerColumn(pool, champion, sim);
      const b = arrangerColumn(pool, challenger, sim);
      if (!a || !b || signature(a.grid) === signature(b.grid)) continue;
      got += 1;
      n += 1;
      const cols = shuffle([{ v: 'champion', ...a }, { v: `${nudge.term}x${nudge.factor}`, ...b }], r1);
      cols.forEach((c) => noteCards(c.grid));
      rounds.push({
        id: `duel-${nudge.term}-${nudge.factor}-${pool.label.replace(/\W+/g, '_')}-${n}`,
        test: 'duel',
        nudge,
        prompt: 'The same cards, arranged twice. Which page reads better?',
        pool: { kind: pool.kind, label: pool.label },
        shape: pool.shape,
        cols,
      });
    }
    perNudge.set(`${nudge.term}x${nudge.factor}`, got);
  }
  console.log(`  duel: ${n} rounds (${[...perNudge.entries()].filter(([, k]) => k === 0).map(([k]) => k).join(', ') || 'every nudge'} ${[...perNudge.values()].some((k) => k === 0) ? 'changed nothing on these pools' : 'changed an answer'})`);

  // misses: the champion's own answer, big.
  let m = 0;
  for (const pool of shuffle(pools, r1).slice(0, 6)) {
    const a = arrangerColumn(pool, champion, simOf.get(pool.label));
    if (!a) continue;
    m += 1;
    noteCards(a.grid);
    const words = {};
    for (const c of pool.cards) words[c.id] = c.depthWords;
    rounds.push({
      id: `misses-arranger-${pool.label.replace(/\W+/g, '_')}-${m}`,
      test: 'misses',
      mode: 'arranger',
      prompt: `Arranged: ${a.reason}. Click every card that sits wrong.`,
      pool: { kind: pool.kind, label: pool.label },
      shape: pool.shape,
      words,
      grid: a.grid,
    });
  }
  console.log(`  misses: ${m} rounds`);
}

// Only the cards the rounds show go into the file.
const cards = {};
for (const id of usedCards) if (cardInfo[id]) cards[id] = cardInfo[id];

mkdirSync(OUT_DIR, { recursive: true });
const VOTES = join(OUT_DIR, 'votes.jsonl');
if (existsSync(VOTES)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  renameSync(VOTES, join(OUT_DIR, `votes-${stamp}.jsonl`));
  console.log(`  earlier answers moved aside as votes-${stamp}.jsonl (the rounds are new)`);
}
writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString(), seed: SEED, champion, cards, rounds }));
console.log(`  ${rounds.length} rounds, ${Object.keys(cards).length} cards -> ${OUT}`);
console.log('DONE.');

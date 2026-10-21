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
 * Tests (variant keys are hidden in the page; columns are shuffled per round):
 *   modes     one pool, one column per mode that is offered          strata | lines | flow | mirror
 *   sheet     the three candidates the app would rank first, with their art panels; which one?
 *   variants  one mode, one column per setting of one Tuning knob    (DEFAULT_TUNING vs the rest)
 *   misses    one arranged page, big; click the cards that sit wrong (per-card precision)
 *
 *   node scripts/arrange-lab/build.mjs            -> state/out/arrange-lab/rounds.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT, appSql, dataSql, cardImageUrl, fail, imageManifest, q, step, textArray } from '../lib/michi.mjs';

const src = (p) => pathToFileURL(join(ROOT, 'src', p)).href;
const A = await import(src('data/arrange.ts'));
const { ART_TEMPLATES } = await import(src('data/artTemplates.ts'));

const OUT_DIR = join(ROOT, 'state', 'out', 'arrange-lab');
const OUT = join(OUT_DIR, 'rounds.json');
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
    select id, name, set_name, number, rarity, illustrator, evolution_line, evolution_stage_index, full_art_kind, scene_tags, color_art
      from public.cards_en where id = any(${textArray(ids.slice(i, i + 400))});`);
  for (const r of rows) facts.set(r.id, r);
}
const manifest = await imageManifest();
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
    rarity: f.rarity || undefined,
    palette: (f.color_art ?? []).map(([L, a, b, w]) => ({ L, a, b, w })),
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

function ctxFor(shape, cards, reservedKeys = new Set(), tuning) {
  return {
    cells: A.cardCells(shape.rows, shape.cols, shape.spread, reservedKeys),
    rows: shape.rows,
    cols: shape.cols,
    spread: shape.spread,
    pairs: A.connectedPairs(cards),
    tuning,
  };
}

/** One mode on a bare canvas (no template), as a column: null when the mode is not offered. */
function modeColumn(shape, cards, mode, tuning) {
  const ctx = ctxFor(shape, cards, new Set(), tuning);
  const res = A.seatWith(mode, cards, ctx);
  if (!res) return null;
  const cand = A.toCandidate(res, mode, null, ctx, ctx.cells.length);
  return { cand, grid: gridOf(shape, cand.placements, new Set()), held: cand.held.map((c) => c.id) };
}

const signature = (grid) => grid.map((c) => c.card ?? (c.art ? '#' : '.')).join('|');

/** Drop columns whose seating repeats an earlier column: the owner cannot tell them apart. */
function distinctColumns(cols) {
  const seen = new Set();
  return cols.filter((c) => {
    const k = signature(c.grid);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

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
const MODES = ['strata', 'lines', 'flow', 'mirror'];
const usedCards = new Set();
const noteCards = (grid) => grid.forEach((c) => c.card && usedCards.add(c.card));

// modes: theme spreads and owner pages, one column per offered mode.
{
  let n = 0;
  const pools = [...shuffle(theme, r1).slice(0, 6), ...shuffle(pagePools, r1).slice(0, 8)];
  for (const pool of pools) {
    const cols = distinctColumns(MODES.map((m) => modeColumn(pool.shape, pool.cards, m)).filter(Boolean).map((c) => ({ v: c.cand.mode, grid: c.grid, held: c.held })));
    if (cols.length < 2) continue;
    n += 1;
    const shuffled = shuffle(cols, r1);
    shuffled.forEach((c) => noteCards(c.grid));
    rounds.push({
      id: `modes-${pool.label.replace(/\W+/g, '_')}-${n}`,
      test: 'modes',
      prompt: 'The same cards, seated four ways. Which page reads best?',
      pool: { kind: pool.kind, label: pool.label },
      shape: pool.shape,
      cols: shuffled,
    });
    if (n >= 12) break;
  }
  console.log(`  modes: ${n} rounds`);
}

// sheet: the app's own list, top three, on owner pages (templates offered as the sheet offers them).
{
  let n = 0;
  for (const pool of shuffle(pagePools, r1)) {
    const templates = ART_TEMPLATES.filter((t) => t.rows === pool.shape.rows && t.cols === pool.shape.cols && t.spread === pool.shape.spread);
    const cands = A.arrangeCandidates({ ...pool.shape, cards: pool.cards, templates, current: pool.current }).filter((c) => c.mode !== 'current');
    if (cands.length < 2) continue;
    const top = cands.slice(0, 3).map((c, rank) => {
      const artKeys = c.template ? A.templateCells(c.template, pool.shape.spread) : new Set();
      return { v: c.id, rank: rank + 1, mode: c.mode, template: c.template?.id ?? 'page', grid: gridOf(pool.shape, c.placements, artKeys), held: c.held.map((x) => x.id) };
    });
    const cols = distinctColumns(top);
    if (cols.length < 2) continue;
    n += 1;
    const shuffled = shuffle(cols, r1);
    shuffled.forEach((c) => noteCards(c.grid));
    rounds.push({
      id: `sheet-${pool.label.replace(/\W+/g, '_')}-${n}`,
      test: 'sheet',
      prompt: 'Arrange would offer these first for this page. Hatched pockets are where a template puts art. Which would you use?',
      pool: { kind: pool.kind, label: pool.label },
      shape: pool.shape,
      cols: shuffled,
    });
    if (n >= 10) break;
  }
  console.log(`  sheet: ${n} rounds`);
}

// variants: one knob at a time, the default against the alternatives, on the pools where the mode shows.
{
  const KNOBS = [
    { knob: 'strataOrder', mode: 'strata', values: ['hue', 'light', 'chain'], pools: theme, take: 4 },
    { knob: 'transitionsAtEnds', mode: 'strata', values: [true, false], pools: theme, take: 3 },
    { knob: 'flowVertical', mode: 'flow', values: [0.5, 0, 1], pools: pagePools, take: 4 },
    { knob: 'flowStart', mode: 'flow', values: ['dark', 'light'], pools: [...theme, ...pagePools], take: 3 },
    { knob: 'mirrorTwin', mode: 'mirror', values: ['illustrator', 'palette'], pools: pagePools.filter((p) => p.shape.cols % 2 === 1), take: 3 },
  ];
  let total = 0;
  for (const k of KNOBS) {
    let n = 0;
    for (const pool of shuffle(k.pools, r1)) {
      const cols = distinctColumns(
        k.values.map((v) => modeColumn(pool.shape, pool.cards, k.mode, { [k.knob]: v })).map((c, i) => c && { v: `${k.knob}=${String(k.values[i])}`, grid: c.grid, held: c.held }).filter(Boolean),
      );
      if (cols.length < 2) continue;
      n += 1;
      const shuffled = shuffle(cols, r1);
      shuffled.forEach((c) => noteCards(c.grid));
      rounds.push({
        id: `variants-${k.knob}-${pool.label.replace(/\W+/g, '_')}-${n}`,
        test: 'variants',
        knob: k.knob,
        prompt: `${A.MODE_LABEL[k.mode]}, the same cards, one setting changed. Which page reads best?`,
        pool: { kind: pool.kind, label: pool.label },
        shape: pool.shape,
        cols: shuffled,
      });
      if (n >= k.take) break;
    }
    console.log(`  variants ${k.knob}: ${n} rounds`);
    total += n;
  }
  console.log(`  variants: ${total} rounds`);
}

// misses: one arranged page, big; the owner clicks the cards that sit wrong.
{
  let n = 0;
  const BAND_NAME = { above: 'sky', surface: 'ground', below: 'underground' };
  for (const pool of shuffle(theme, r1).slice(0, 6)) {
    const col = modeColumn(pool.shape, pool.cards, 'strata');
    if (!col) continue;
    n += 1;
    noteCards(col.grid);
    // Which band each row shows, read from the cards seated there (the module's bandRows after merging).
    const bands = {};
    for (const c of col.grid) {
      if (!c.card || bands[c.row]) continue;
      const d = A.depthOf({ depthWords: arrangeCard(c.card).depthWords }).depth;
      if (d) bands[c.row] = BAND_NAME[d];
    }
    const words = {};
    for (const c of pool.cards) words[c.id] = c.depthWords;
    const order = Array.from({ length: pool.shape.rows }, (_, i) => bands[i] ?? 'open').join(', ');
    rounds.push({
      id: `misses-strata-${pool.label.replace(/\W+/g, '_')}-${n}`,
      test: 'misses',
      mode: 'strata',
      prompt: `Rows are depths, top to bottom: ${order}. Click every card that sits in the wrong row.`,
      pool: { kind: pool.kind, label: pool.label },
      shape: pool.shape,
      bands,
      words,
      grid: col.grid,
    });
  }
  for (const pool of shuffle(pagePools, r1).slice(0, 4)) {
    const col = modeColumn(pool.shape, pool.cards, 'flow');
    if (!col) continue;
    n += 1;
    noteCards(col.grid);
    rounds.push({
      id: `misses-flow-${pool.label.replace(/\W+/g, '_')}-${n}`,
      test: 'misses',
      mode: 'flow',
      prompt: 'One colour gradient across the spread. Click every card that breaks it.',
      pool: { kind: pool.kind, label: pool.label },
      shape: pool.shape,
      grid: col.grid,
    });
  }
  console.log(`  misses: ${n} rounds`);
}

// Only the cards the rounds show go into the file.
const cards = {};
for (const id of usedCards) if (cardInfo[id]) cards[id] = cardInfo[id];

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString(), seed: SEED, cards, rounds }));
console.log(`  ${rounds.length} rounds, ${Object.keys(cards).length} cards -> ${OUT}`);
console.log('DONE.');

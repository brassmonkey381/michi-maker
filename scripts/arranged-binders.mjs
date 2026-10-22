/**
 * ARRANGED THEME BINDERS, second cut (owner, 2026-10-21).
 *
 * First cut dealt a theme's full arts onto pages by depth band and arranged each page; the owner:
 * "the cards on a page did not belong together ... there needs to be a clear identity to each page,
 * maybe decided first by loading 25-50% of the page's cards with intentionality, and then filled
 * by similarity, color, or theme (or multiple if it fits a single coherent page idea)".
 *
 * So each page is built the way Complete page builds one, at binder scale:
 *   1. POOL      a theme's full arts, ranked by how strongly they are that theme.
 *   2. IDENTITY  tight groups found in the pool, each one page's reason: an evolution family, one
 *                illustrator, one palette (a hue family, or the darks, or the pales), or a clique of
 *                cards whose art reads alike. Three to six SEED cards per identity, placed first.
 *   3. FILL      the rest of the page from the pool, by the identity's own method (likeness to the
 *                seeds' centre, palette distance to the seeds, the same line or hand first), and ONLY
 *                while the candidate still holds the identity: a card that does not pass is not
 *                placed, and the page stays short. A short page gets an art template from Arrange.
 *   4. ARRANGE   the shipped arranger (src/data/arranger.ts, the same weights as the G key).
 *   5. ORDER     pages sequenced by hue so the binder flows.
 *
 * Likeness is cards_en.embedding cosine (what Find Similar hands the app); palette distance is the
 * arranger's own paletteDist on the pipeline's color_art.
 *
 *   node scripts/arranged-binders.mjs            dry run: prints every page and why
 *   node scripts/arranged-binders.mjs --apply    writes the binders, private, replacing same titles
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT, appSql, dataSql, fail, q, step, textArray } from './lib/michi.mjs';

const src = (p) => pathToFileURL(join(ROOT, 'src', p)).href;
const A = await import(src('data/arrange.ts'));
const R = await import(src('data/arranger.ts'));
const { ART_TEMPLATES, templateArtSlots } = await import(src('data/artTemplates.ts'));

const APPLY = process.argv.includes('--apply');
const USERNAME = 'fakemichi';
const ROWS = 3;
const COLS = 4;
const PAGE = ROWS * COLS;
const MAX_PAGES = 6;
const MIN_PAGE = 6;
const POOL = 420;
const SEED = 20261021;

const BINDERS = [
  { title: 'Arranged: Sea', description: 'Full arts from the sea. Each page seeded with one idea, filled only with cards that keep it, then seated by Arrange.', tags: ['scene:underwater', 'scene:ocean', 'scene:beach', 'scene:coral'] },
  { title: 'Arranged: Night', description: 'Full arts under the night sky. Each page seeded with one idea, filled only with cards that keep it, then seated by Arrange.', tags: ['scene:stars', 'scene:moon', 'scene:space', 'scene:night'] },
  { title: 'Arranged: Forest', description: 'Full arts from the forest. Each page seeded with one idea, filled only with cards that keep it, then seated by Arrange.', tags: ['scene:forest', 'scene:jungle', 'scene:meadow'] },
];

/** Likeness floors: a fill card must sit this close to the seeds' centre; the seeds themselves this close to each other. */
const SIM_FLOOR = 0.68;
/** Kin (the same line, the same hand) may sit this far under the floor: they are the identity itself. */
const KIN_SLACK = 0.08;
const SIM_CLIQUE = 0.74;
/** Palette: a fill card's mean distance to the seeds, in Lab units, past the seeds' own spread. */
const PAL_FILL_SLACK = 6;
const PAL_CEIL = 28;

const DEPTH_TAGS = new Set(A.depthTagQuery());
const TEMPLATES_3x4 = ART_TEMPLATES.filter((t) => t.rows === ROWS && t.cols === COLS && !t.spread);
const TEMPLATE_SIZES = [...new Set(TEMPLATES_3x4.map((t) => t.cardPockets))].filter((n) => n >= MIN_PAGE).sort((a, b) => a - b);
const NAME_DECORATIONS = new Set(['ex', 'gx', 'v', 'vmax', 'vstar', 'v-union', 'break', 'prime', 'radiant', 'shining', 'dark', 'light', 'delta', 'star', 'lv.x', 'mega', 'm', 'x', 'y']);

step(1, 'account');
const [who] = await appSql(`select id from public.profiles where username = ${q(USERNAME)};`);
if (!who) fail(`no profile ${USERNAME}`);
console.log(`  @${USERNAME} ${who.id.slice(0, 8)}`);

// ---------------------------------------------------------------------------------------------
// Card facts
// ---------------------------------------------------------------------------------------------

function toCard(f, tags) {
  const scene = f.scene_tags ?? [];
  const hits = scene.filter((t) => tags.includes(t));
  return {
    id: f.id,
    name: f.name,
    depthWords: scene.filter((t) => DEPTH_TAGS.has(t)),
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
    supertype: f.supertype ?? '',
    // How strongly the card is the theme: matching words, and a bonus when one leads the caption.
    strength: hits.length + (scene.slice(0, 3).some((t) => tags.includes(t)) ? 1 : 0),
  };
}

/** The species a card is of (pageCompleter's rule): its line member named in it, else the name without decorations. */
function speciesOf(card) {
  const n = card.name.toLowerCase();
  if (card.evolutionLine.length) {
    const hit = [...card.evolutionLine].sort((a, b) => b.length - a.length).find((s) => n.includes(s.toLowerCase()));
    if (hit) return hit.toLowerCase();
  }
  return n.split(/\s+/).filter((t) => !NAME_DECORATIONS.has(t) && !/['’]s$/.test(t)).join(' ').trim();
}

async function poolFor(b) {
  const rows = await dataSql(`
    select id, name, card_type as supertype, set_name, number, rarity, illustrator, evolution_line, evolution_stage_index, full_art_kind, full_art, scene_tags, color_art, types
      from public.cards_en
     where scene_tags && ${textArray(b.tags)} and color_art is not null and embedding is not null
       and (full_art = true or full_art_kind in ('special_illustration_rare','illustration_rare','named_full_art','measured','double_rare'))
     order by cardinality(array(select unnest(scene_tags) intersect select unnest(${textArray(b.tags)}))) desc, md5(id || ${q(String(SEED))})
     limit ${POOL * 2};`);
  const cards = rows.map((r) => toCard(r, b.tags)).filter((c) => A.artClassOf(c.fullArtKind, c.fullArt) === 'full');
  cards.sort((x, y) => y.strength - x.strength);
  return cards.slice(0, POOL);
}

/** Every pair in the pool that reads alike, cosine above SIM_CLIQUE - slack, so cliques and fills can be read off it. */
async function strongPairs(ids) {
  const rows = await dataSql(`
    select a.id as a, b.id as b, (1 - (a.embedding <=> b.embedding))::float as sim
      from public.cards_en a join public.cards_en b on b.id > a.id
     where a.id = any(${textArray(ids)}) and b.id = any(${textArray(ids)})
       and (1 - (a.embedding <=> b.embedding)) > ${SIM_FLOOR};`);
  const sim = new Map();
  const put = (x, y, v) => {
    if (!sim.has(x)) sim.set(x, new Map());
    sim.get(x).set(y, v);
  };
  for (const r of rows) {
    put(r.a, r.b, r.sim);
    put(r.b, r.a, r.sim);
  }
  return sim;
}

/** Likeness of every pool card to the centre of the seeds (the server averages their art vectors). */
async function likenessToCentre(seedIds, poolIds) {
  const rows = await dataSql(`
    with c as (select avg(embedding) as v from public.cards_en where id = any(${textArray(seedIds)}))
    select id, (1 - (embedding <=> (select v from c)))::float as sim
      from public.cards_en where id = any(${textArray(poolIds)});`);
  return new Map(rows.map((r) => [r.id, r.sim]));
}

/** Pairwise likeness among one page's cards, for the arranger. */
async function similarityOf(ids) {
  const rows = await dataSql(`
    select a.id as a, b.id as b, (1 - (a.embedding <=> b.embedding))::float as sim
      from public.cards_en a join public.cards_en b on b.id > a.id
     where a.id = any(${textArray(ids)}) and b.id = any(${textArray(ids)});`);
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

// ---------------------------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------------------------

const simOf = (sim, a, b) => sim.get(a)?.get(b) ?? 0;
const meanPairSim = (sim, ids) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
    s += simOf(sim, ids[i], ids[j]);
    n += 1;
  }
  return n ? s / n : 0;
};
const meanPalDist = (cards, to) => to.reduce((s, c) => s + A.paletteDist(cards, c), 0) / to.length;
const meanPairPal = (cards) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < cards.length; i += 1) for (let j = i + 1; j < cards.length; j += 1) {
    s += A.paletteDist(cards[i], cards[j]);
    n += 1;
  }
  return n ? s / n : 0;
};

/** Hue family of a card's dominant colour: a 30-degree bin for a saturated card, else dark, pale or grey. */
function hueFamily(card) {
  const d = A.dominant(card);
  const chroma = Math.hypot(d.a, d.b);
  if (chroma < 16) return d.L < 32 ? 'darks' : d.L > 72 ? 'pales' : null;
  const h = ((Math.atan2(d.b, d.a) * 180) / Math.PI + 360) % 360;
  return `hue${Math.floor(h / 30) * 30}`;
}
const HUE_NAMES = { hue0: 'Pinks and reds', hue30: 'Reds and oranges', hue60: 'Oranges and golds', hue90: 'Golds and yellows', hue120: 'Yellow greens', hue150: 'Greens', hue180: 'Teals', hue210: 'Sea blues', hue240: 'Blues', hue270: 'Blues and violets', hue300: 'Violets', hue330: 'Magentas', darks: 'After dark', pales: 'Pale and soft' };

/**
 * Every identity the pool offers. Each: { kind, name, seeds: cards, fill: method, quality }.
 * Seeds are three to six; the fill method is the identity's own.
 */
function identities(pool, sim) {
  const out = [];
  const byId = new Map(pool.map((c) => [c.id, c]));

  // Evolution families: a line with two or more species present, the best print of each as seeds.
  const lines = new Map();
  for (const c of pool) if (c.evolutionLine.length >= 2) lines.set(c.evolutionLine.join('>'), [...(lines.get(c.evolutionLine.join('>')) ?? []), c]);
  for (const [key, cards] of lines) {
    const bySpecies = new Map();
    for (const c of cards) bySpecies.set(speciesOf(c), [...(bySpecies.get(speciesOf(c)) ?? []), c]);
    if (bySpecies.size < 2 || cards.length < 3) continue;
    // One print per species first, the one that reads most like the others; then more prints up to six.
    const seeds = [];
    for (const prints of bySpecies.values()) seeds.push([...prints].sort((x, y) => cards.reduce((s, o) => s + simOf(sim, y.id, o.id), 0) - cards.reduce((s, o) => s + simOf(sim, x.id, o.id), 0))[0]);
    const rest = cards.filter((c) => !seeds.includes(c)).sort((x, y) => y.strength - x.strength);
    while (seeds.length < 6 && rest.length) seeds.push(rest.shift());
    const line = key.split('>');
    out.push({ kind: 'lines', name: `The ${line[0][0].toUpperCase()}${line[0].slice(1)} family`, seeds, fill: 'lines', quality: bySpecies.size * 2 + cards.length * 0.25 });
  }

  // One hand: an illustrator with four or more cards here.
  const hands = new Map();
  for (const c of pool) if (c.illustrator) hands.set(c.illustrator, [...(hands.get(c.illustrator) ?? []), c]);
  for (const [who, cards] of hands) {
    if (cards.length < 4) continue;
    const ranked = [...cards].sort((x, y) => cards.reduce((s, o) => s + simOf(sim, y.id, o.id), 0) - cards.reduce((s, o) => s + simOf(sim, x.id, o.id), 0));
    out.push({ kind: 'artist', name: `By ${who}`, seeds: ranked.slice(0, Math.min(6, Math.max(3, Math.floor(cards.length / 2)))), fill: 'artist', quality: Math.min(cards.length, 12) * 0.6 + 1 });
  }

  // One palette: a hue family with six or more cards; the seeds are its medoids.
  const families = new Map();
  for (const c of pool) {
    const f = hueFamily(c);
    if (f) families.set(f, [...(families.get(f) ?? []), c]);
  }
  for (const [f, cards] of families) {
    if (cards.length < 6) continue;
    const ranked = [...cards].sort((x, y) => meanPalDist(x, cards) - meanPalDist(y, cards));
    const seeds = ranked.slice(0, 4);
    out.push({ kind: 'palette', name: HUE_NAMES[f] ?? f, seeds, fill: 'palette', quality: 2 + Math.min(cards.length, 24) / 6 - meanPairPal(seeds) / 10 });
  }

  // A clique: cards whose art reads alike, grown greedily from the best-connected card.
  const taken = new Set();
  const degree = (id) => [...(sim.get(id)?.values() ?? [])].filter((v) => v >= SIM_CLIQUE).length;
  const ranked = pool.filter((c) => degree(c.id) >= 2).sort((x, y) => degree(y.id) - degree(x.id));
  for (const c of ranked) {
    if (taken.has(c.id)) continue;
    const clique = [c.id];
    const cand = [...(sim.get(c.id)?.entries() ?? [])].filter(([id, v]) => v >= SIM_CLIQUE && !taken.has(id)).sort((x, y) => y[1] - x[1]).map(([id]) => id);
    for (const id of cand) {
      if (clique.length >= 6) break;
      if (clique.every((m) => simOf(sim, m, id) >= SIM_CLIQUE - 0.04)) clique.push(id);
    }
    if (clique.length < 3) continue;
    clique.forEach((id) => taken.add(id));
    const seeds = clique.map((id) => byId.get(id));
    const tight = meanPairSim(sim, clique);
    out.push({ kind: 'alike', name: `Alike: ${seeds[0].name.replace(/\s*\(.*$/, '')}`, seeds, fill: 'similar', quality: 3 + clique.length * 0.5 + (tight - SIM_CLIQUE) * 20 });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fill
// ---------------------------------------------------------------------------------------------

/**
 * The page's other pockets, from the pool, by the identity's method, each card only while it still
 * holds the identity. Returns the page's cards (seeds first) and a note on why it stopped.
 */
async function fillPage(ident, pool, used, sim) {
  const seeds = ident.seeds.filter((c) => !used.has(c.id));
  const page = [...seeds];
  const species = new Set(page.map(speciesOf));
  const ok = (c) => !used.has(c.id) && !page.includes(c) && !species.has(speciesOf(c)) && c.supertype !== 'Trainer' || (c.supertype === 'Trainer' && ident.kind === 'artist' && !used.has(c.id) && !page.includes(c));
  const add = (c) => {
    page.push(c);
    species.add(speciesOf(c));
  };
  const seedIds = seeds.map((c) => c.id);
  const centre = await likenessToCentre(seedIds, pool.map((c) => c.id));
  // A fill card must read at least as alike to the seeds' centre as the seeds do to each other.
  const simFloor = Math.max(SIM_FLOOR, meanPairSim(sim, seedIds));
  const palCeil = Math.min(PAL_CEIL, meanPairPal(seeds) + PAL_FILL_SLACK);
  let why = '';

  // First pass: the identity's own kin (same line, same hand), still gated by likeness.
  if (ident.fill === 'lines' || ident.fill === 'artist') {
    const kin = pool.filter((c) => ok(c) && (ident.fill === 'lines' ? c.evolutionLine.join('>') === seeds[0].evolutionLine.join('>') : c.illustrator === seeds[0].illustrator))
      .sort((x, y) => (centre.get(y.id) ?? 0) - (centre.get(x.id) ?? 0));
    for (const c of kin) {
      if (page.length >= PAGE) break;
      if ((centre.get(c.id) ?? 0) >= simFloor - KIN_SLACK) add(c);
    }
  }
  // Then the method proper.
  if (ident.fill === 'palette') {
    const cand = pool.filter(ok).map((c) => ({ c, d: meanPalDist(c, seeds), s: centre.get(c.id) ?? 0 })).sort((x, y) => x.d - y.d);
    for (const { c, d } of cand) {
      if (page.length >= PAGE) break;
      if (d > palCeil) {
        why = `palette stopped at ${d.toFixed(0)} > ${palCeil.toFixed(0)}`;
        break;
      }
      add(c);
    }
  } else {
    const cand = pool.filter(ok).map((c) => ({ c, s: centre.get(c.id) ?? 0, d: meanPalDist(c, seeds) })).sort((x, y) => y.s - x.s);
    for (const { c, s, d } of cand) {
      if (page.length >= PAGE) break;
      if (s < simFloor) {
        why = `likeness stopped at ${s.toFixed(2)} < ${simFloor.toFixed(2)}`;
        break;
      }
      // Like the seeds, but a palette far from everything else on the page is still a sore thumb.
      if (d > PAL_CEIL + 10) continue;
      add(c);
    }
  }
  return { cards: page, why: why || (page.length >= PAGE ? 'full' : 'pool ran out'), simFloor, palCeil };
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

const plan = [];
for (const b of BINDERS) {
  step(2, `${b.title}: pool`);
  const pool = await poolFor(b);
  console.log(`  ${pool.length} full arts, strength ${pool[0]?.strength} down to ${pool[pool.length - 1]?.strength}`);
  const sim = await strongPairs(pool.map((c) => c.id));
  console.log(`  ${[...sim.values()].reduce((n, m) => n + m.size, 0) / 2} pairs alike above ${SIM_FLOOR}`);

  step(3, `${b.title}: identities`);
  const idents = identities(pool, sim).sort((x, y) => y.quality - x.quality);
  const counts = {};
  for (const i of idents) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  console.log(`  ${idents.length} identities: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);

  step(4, `${b.title}: pages`);
  // Round-robin over kinds so a binder is not six palettes; within a kind, the best first.
  const used = new Set();
  const pages = [];
  const queues = new Map();
  for (const i of idents) queues.set(i.kind, [...(queues.get(i.kind) ?? []), i]);
  const order = ['alike', 'lines', 'palette', 'artist'];
  let idle = 0;
  while (pages.length < MAX_PAGES && idle < order.length) {
    const kind = order[(pages.length + idle) % order.length];
    const qn = queues.get(kind) ?? [];
    let ident = null;
    while (qn.length) {
      const cand = qn.shift();
      if (cand.seeds.filter((c) => !used.has(c.id)).length >= 3) {
        ident = cand;
        break;
      }
    }
    if (!ident) {
      idle += 1;
      continue;
    }
    const filled = await fillPage(ident, pool, used, sim);
    if (filled.cards.length < MIN_PAGE) {
      console.log(`  skipped ${ident.name}: ${filled.cards.length} cards (${filled.why})`);
      continue;
    }
    idle = 0;
    // Trim to a template size (the last cards added were the weakest fits), so Arrange has a page
    // that fits exactly: no hole, nothing to the tray.
    const size = [...TEMPLATE_SIZES].filter((n) => n <= filled.cards.length).pop();
    if (!size) {
      console.log(`  skipped ${ident.name}: no template seats ${filled.cards.length}`);
      continue;
    }
    if (size < filled.cards.length) {
      filled.why += `; trimmed ${filled.cards.length} to ${size}`;
      filled.cards = filled.cards.slice(0, size);
    }
    filled.cards.forEach((c) => used.add(c.id));
    pages.push({ ident, ...filled });
    console.log(`  ${ident.name} [${ident.kind}]: ${ident.seeds.length} seeds + ${filled.cards.length - ident.seeds.filter((c) => filled.cards.includes(c)).length} filled = ${filled.cards.length} (${filled.why})`);
  }
  if (pages.length < 2) fail(`${b.title}: only ${pages.length} pages`);
  // Pages in hue order, so the binder flows.
  const meanHue = (p) => {
    let x = 0;
    let y = 0;
    for (const c of p.cards) {
      const h = (A.hue(c) * Math.PI) / 180;
      x += Math.cos(h);
      y += Math.sin(h);
    }
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };
  pages.sort((x, y) => meanHue(x) - meanHue(y));
  plan.push({ ...b, pages });
}

step(5, 'arranging every page');
const templates = TEMPLATES_3x4;
console.log(`  template sizes: ${TEMPLATE_SIZES.join(', ')}`);
for (const b of plan) {
  console.log(`\n  ${b.title}`);
  for (const [pi, p] of b.pages.entries()) {
    const cards = p.cards;
    const sim = await similarityOf(cards.map((c) => c.id));
    // The page's cards were chosen one by one, so no template may send one to the tray, and no
    // pocket is left open: the page was trimmed to a template size, and only templates of that
    // exact size are offered. A full page gets The Complete Run.
    const fitting = templates.filter((t) => t.cardPockets === cards.length);
    const a = R.arrangePage({ rows: ROWS, cols: COLS, spread: false, cards, templates: fitting, similarity: sim, weights: R.ARRANGER_WEIGHTS });
    if (!a) fail(`${b.title} p${pi + 1}: the arranger had no answer`);
    p.best = a.best;
    const byCell = new Map(a.best.placements.map((x) => [`${x.cell.row},${x.cell.col}`, x.cardId]));
    const artKeys = a.best.template ? A.templateCells(a.best.template, false) : new Set();
    const nameOf = new Map(cards.map((c) => [c.id, c.name]));
    console.log(`   p${pi + 1} ${p.ident.name} [${p.ident.kind}, ${cards.length} cards]: ${a.best.reason}${a.best.held.length ? ` (${a.best.held.length} to the tray)` : ''}`);
    for (let r = 0; r < ROWS; r += 1) {
      const line = [];
      for (let c = 0; c < COLS; c += 1) {
        const k = `${r},${c}`;
        const id = byCell.get(k);
        line.push(id ? nameOf.get(id).slice(0, 14).padEnd(14) : artKeys.has(k) ? '[art]'.padEnd(14) : '.'.padEnd(14));
      }
      console.log(`      ${line.join(' ')}`);
    }
  }
}

if (!APPLY) {
  console.log('\nDry run. Add --apply to write the binders.');
  process.exit(0);
}

step(6, 'writing the binders, private');
for (const b of plan) {
  await appSql(`delete from public.binders where owner_id = ${q(who.id)} and title = ${q(b.title)};`);
  const binderId = randomUUID();
  const coverCard = b.pages[0].best.placements[0]?.cardId ?? b.pages[0].cards[0].id;
  await appSql(`
    insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id, is_public, is_demo)
    values (${q(binderId)}, ${q(who.id)}, ${q(b.title)}, ${q(b.description)}, 'themed_story', ${q(coverCard)}, false, false);`);
  const pageIds = b.pages.map(() => randomUUID());
  await appSql(`
    insert into public.binder_pages (id, binder_id, position, title, notes, rows, cols, is_public)
    values ${b.pages.map((p, i) => `(${q(pageIds[i])}, ${q(binderId)}, ${i}, ${q(p.ident.name)}, ${q(`${p.ident.seeds.length} seeds, filled by ${p.ident.fill}; ${p.why}. Arranged: ${p.best.reason}.`)}, ${ROWS}, ${COLS}, false)`).join(',\n           ')};`);
  const rows = [];
  let trayCol = 0;
  b.pages.forEach((p, i) => {
    const best = p.best;
    for (const x of best.placements) rows.push(`(${q(randomUUID())}, ${q(pageIds[i])}, null, ${x.cell.row}, ${x.cell.col}, 1, 1, 'card', ${q(x.cardId)}, null)`);
    if (best.template) {
      for (const s of templateArtSlots(best.template, randomUUID)) {
        rows.push(`(${q(s.id)}, ${q(pageIds[i])}, null, ${s.row}, ${s.col}, ${s.rowSpan}, ${s.colSpan}, 'artwork', null, ${q(`${s.artTemplateId ?? ''}:${s.artRole}`)})`);
      }
    }
    for (const h of best.held) {
      rows.push(`(${q(randomUUID())}, null, ${q(binderId)}, 0, ${trayCol}, 1, 1, 'card', ${q(h.id)}, null)`);
      trayCol += 1;
    }
  });
  await appSql(`
    insert into public.binder_slots (id, page_id, binder_id, row_index, col_index, row_span, col_span, slot_type, card_id, notes)
    values ${rows.join(',\n           ')};`);
  const check = await appSql(`
    select p.position, p.title,
           count(s.id) filter (where s.slot_type = 'card') as cards,
           count(s.id) filter (where s.slot_type = 'artwork') as art
      from public.binder_pages p left join public.binder_slots s on s.page_id = p.id
     where p.binder_id = ${q(binderId)} group by p.position, p.title order by p.position;`);
  const [tray] = await appSql(`select count(*)::int as n from public.binder_slots where binder_id = ${q(binderId)} and page_id is null;`);
  const [vis] = await appSql(`select is_public from public.binders where id = ${q(binderId)};`);
  console.log(`\n  ${b.title}  public ${vis.is_public}, tray ${tray.n}`);
  for (const r of check) console.log(`    p${Number(r.position) + 1} ${r.title}: ${r.cards} cards, ${r.art} art pockets`);
  console.log(`  https://michi-maker.com/binder/${binderId}`);
}
console.log('\nOK');

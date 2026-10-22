/**
 * ARRANGED THEME BINDERS: private inspection binders built by the Story binder's "Curated pages"
 * planner (src/data/storyPages.ts) from the command line, so the method can be judged on real cards
 * without a VIP account or a browser.
 *
 * History (owner, 2026-10-21): the first cut dealt a theme's full arts onto pages by depth band and
 * arranged each page; "the cards on a page did not belong together". The second cut, identity
 * first then fill while coherent, was "one of the best so far for binder building" and became the
 * planner this script now calls. The method itself is documented in docs/STORY-BINDERS.md.
 *
 * Here the pool is a theme's full arts by scene word straight from cards_en, likeness is
 * cards_en.embedding cosine in SQL (the same number Find Similar hands the app), depth words are
 * the scene tags filtered to the stratum vocabulary.
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
const { planPages } = await import(src('data/storyPages.ts'));

const APPLY = process.argv.includes('--apply');
const USERNAME = 'fakemichi';
const SHAPE = { rows: 3, cols: 4 };
const MAX_PAGES = 6;
const FILL_FLOOR = 0.68;
const POOL = 420;
const SEED = 20261021;

const BINDERS = [
  { title: 'Arranged: Sea', description: 'Full arts from the sea, one idea per page.', tags: ['scene:underwater', 'scene:ocean', 'scene:beach', 'scene:coral'] },
  { title: 'Arranged: Night', description: 'Full arts under the night sky, one idea per page.', tags: ['scene:stars', 'scene:moon', 'scene:space', 'scene:night'] },
  { title: 'Arranged: Forest', description: 'Full arts from the forest, one idea per page.', tags: ['scene:forest', 'scene:jungle', 'scene:meadow'] },
];

const DEPTH_TAGS = new Set(A.depthTagQuery());

step(1, 'account');
const [who] = await appSql(`select id from public.profiles where username = ${q(USERNAME)};`);
if (!who) fail(`no profile ${USERNAME}`);
console.log(`  @${USERNAME} ${who.id.slice(0, 8)}`);

/** A theme's full arts as the planner's PoolCards, strongest first. */
async function poolFor(b) {
  const rows = await dataSql(`
    select id, name, card_type, set_name, number, rarity, illustrator, evolution_line, evolution_stage_index, full_art_kind, full_art, scene_tags, color_art, types
      from public.cards_en
     where scene_tags && ${textArray(b.tags)} and color_art is not null and embedding is not null
       and (full_art = true or full_art_kind in ('special_illustration_rare','illustration_rare','named_full_art','measured','double_rare'))
     order by cardinality(array(select unnest(scene_tags) intersect select unnest(${textArray(b.tags)}))) desc, md5(id || ${q(String(SEED))})
     limit ${POOL * 2};`);
  const cards = rows
    .map((f) => {
      const scene = f.scene_tags ?? [];
      const hits = scene.filter((t) => b.tags.includes(t));
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
        palette: (f.color_art ?? []).map(([L, a, b2, w]) => ({ L, a, b: b2, w })),
        types: f.types ?? [],
        trainer: !(f.types ?? []).length,
        strength: hits.length + (scene.slice(0, 3).some((t) => b.tags.includes(t)) ? 1 : 0),
      };
    })
    .filter((c) => A.artClassOf(c.fullArtKind, c.fullArt) === 'full');
  cards.sort((x, y) => y.strength - x.strength);
  return cards.slice(0, POOL);
}

/** The planner's providers, answered by SQL over cards_en.embedding. */
const providers = {
  async likenessToCentre(seedIds, poolIds) {
    const rows = await dataSql(`
      with c as (select avg(embedding) as v from public.cards_en where id = any(${textArray([...seedIds])}))
      select id, (1 - (embedding <=> (select v from c)))::float as sim
        from public.cards_en where id = any(${textArray([...poolIds])});`);
    return new Map(rows.map((r) => [r.id, Math.max(0, Math.min(1, r.sim))]));
  },
  async pairwise(ids) {
    const rows = await dataSql(`
      select a.id as a, b.id as b, (1 - (a.embedding <=> b.embedding))::float as sim
        from public.cards_en a join public.cards_en b on b.id > a.id
       where a.id = any(${textArray([...ids])}) and b.id = any(${textArray([...ids])});`);
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
  },
};

const plan = [];
for (const b of BINDERS) {
  step(2, `${b.title}`);
  const pool = await poolFor(b);
  console.log(`  ${pool.length} full arts in the pool`);
  const out = await planPages(pool, providers, { shape: SHAPE, maxPages: MAX_PAGES, fillFloor: FILL_FLOOR, mkId: randomUUID });
  for (const s of out.skipped) console.log(`  skipped ${s.name}: ${s.why}`);
  for (const [pi, p] of out.pages.entries()) {
    const a = p.arrangement;
    const byCell = new Map(a.placements.map((x) => [`${x.cell.row},${x.cell.col}`, x.cardId]));
    const artKeys = a.template ? A.templateCells(a.template, false) : new Set();
    const nameOf = new Map(p.cards.map((c) => [c.id, c.name]));
    console.log(`   p${pi + 1} ${p.identity.name} [${p.identity.kind}, ${p.cards.length} cards, ${p.why}]: ${a.reason}`);
    for (let r = 0; r < SHAPE.rows; r += 1) {
      const line = [];
      for (let c = 0; c < SHAPE.cols; c += 1) {
        const k = `${r},${c}`;
        const id = byCell.get(k);
        line.push(id ? nameOf.get(id).slice(0, 14).padEnd(14) : artKeys.has(k) ? '[art]'.padEnd(14) : '.'.padEnd(14));
      }
      console.log(`      ${line.join(' ')}`);
    }
  }
  if (out.pages.length < 2) fail(`${b.title}: only ${out.pages.length} pages`);
  plan.push({ ...b, pages: out.pages });
}

if (!APPLY) {
  console.log('\nDry run. Add --apply to write the binders.');
  process.exit(0);
}

step(3, 'writing the binders, private');
for (const b of plan) {
  await appSql(`delete from public.binders where owner_id = ${q(who.id)} and title = ${q(b.title)};`);
  const binderId = randomUUID();
  const coverCard = b.pages[0].arrangement.placements[0]?.cardId ?? b.pages[0].cards[0].id;
  await appSql(`
    insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id, is_public, is_demo)
    values (${q(binderId)}, ${q(who.id)}, ${q(b.title)}, ${q(b.description)}, 'themed_story', ${q(coverCard)}, false, false);`);
  await appSql(`
    insert into public.binder_pages (id, binder_id, position, title, notes, rows, cols, is_public)
    values ${b.pages.map((p, i) => `(${q(p.page.id)}, ${q(binderId)}, ${i}, ${q(p.page.title)}, ${q(`${p.page.description} ${p.why}. Arranged: ${p.arrangement.reason}.`)}, ${SHAPE.rows}, ${SHAPE.cols}, false)`).join(',\n           ')};`);
  const rows = [];
  for (const p of b.pages) {
    for (const s of p.page.slots) {
      if (s.type === 'card') rows.push(`(${q(s.id)}, ${q(p.page.id)}, ${s.row}, ${s.col}, 1, 1, 'card', ${q(s.cardId)}, null)`);
      else rows.push(`(${q(s.id)}, ${q(p.page.id)}, ${s.row}, ${s.col}, ${s.rowSpan}, ${s.colSpan}, 'artwork', null, ${q(`${s.artTemplateId ?? ''}:${s.artRole}`)})`);
    }
  }
  await appSql(`
    insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id, notes)
    values ${rows.join(',\n           ')};`);
  const check = await appSql(`
    select p.position, p.title,
           count(s.id) filter (where s.slot_type = 'card') as cards,
           count(s.id) filter (where s.slot_type = 'artwork') as art
      from public.binder_pages p left join public.binder_slots s on s.page_id = p.id
     where p.binder_id = ${q(binderId)} group by p.position, p.title order by p.position;`);
  console.log(`\n  ${b.title}  private`);
  for (const r of check) console.log(`    p${Number(r.position) + 1} ${r.title}: ${r.cards} cards, ${r.art} art pockets`);
  console.log(`  https://michi-maker.com/binder/${binderId}`);
}
console.log('\nOK');

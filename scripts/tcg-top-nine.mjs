/**
 * EIGHT PAGES, ONE PER GAME, THE NINE MOST EXPENSIVE CARDS OF EACH (owner, 2026-10-22), arranged
 * by the arranger with an exact-fit art template, the art pockets filled with that game's own card
 * art, the cover carrying each game's single most expensive card. Private, on the owner's account.
 *
 * Prices come from each game's published prices-summary.json (the same file the app sorts by).
 * Pokémon's cards come from cards_en (depth words, palette, evolution line, embeddings for
 * likeness); the other games' from their published catalog.json, with palettes decoded from their
 * colour blob by the documented byte layout. Art pockets show the 10th to 15th most expensive cards
 * of the same game, whole, origin 'card', the way the studio stamps catalog art.
 *
 *   node scripts/tcg-top-nine.mjs            dry run: prints every page
 *   node scripts/tcg-top-nine.mjs --apply    writes the binder, replacing one of the same title
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT, appSql, dataSql, fail, q, step, textArray } from './lib/michi.mjs';

const src = (p) => pathToFileURL(join(ROOT, 'src', p)).href;
const A = await import(src('data/arrange.ts'));
const { arrangePage } = await import(src('data/arranger.ts'));
const { ART_TEMPLATES, templateArtSlots } = await import(src('data/artTemplates.ts'));

const APPLY = process.argv.includes('--apply');
const USERNAME = 'fakemichi';
const TITLE = 'The Most Expensive Cards, Eight Games';
const DESCRIPTION = 'One page per game: the nine most expensive cards in each, with the dearest of all on the cover.';
const BROWSE = 'https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/browse';
const ROWS = 3;
const COLS = 4;
const TOP = 9;
const ART_FROM = 9; // art pockets draw from the cards ranked after the nine
const DEPTH_TAGS = new Set(A.depthTagQuery());

const GAMES = [
  { key: 'pokemon', label: 'Pokémon', prefix: '' },
  { key: 'magic', label: 'Magic: The Gathering', prefix: 'magic' },
  { key: 'yugioh', label: 'Yu-Gi-Oh!', prefix: 'yugioh' },
  { key: 'onepiece', label: 'One Piece', prefix: 'onepiece' },
  { key: 'lorcana', label: 'Disney Lorcana', prefix: 'lorcana' },
  { key: 'digimon', label: 'Digimon', prefix: 'digimon' },
  { key: 'riftbound', label: 'Riftbound', prefix: 'riftbound' },
  { key: 'cyberpunk', label: 'Cyberpunk TCG', prefix: 'cyberpunk' },
];

const fetchJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
};
const base = (g) => (g.prefix ? `${BROWSE}/${g.prefix}` : BROWSE);

/** Top ids by current price from a game's summary, highest first. */
function rankedIds(summary, limit) {
  return Object.entries(summary)
    .map(([id, v]) => [id, Number(v?.cur ?? 0)])
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/** A game's colour blob, decoded: id -> art-region palette [{L,a,b,w}]. Fails soft to an empty map. */
async function paletteIndex(g) {
  try {
    const b = `${base(g)}/color`;
    const [meta, ids, bin] = await Promise.all([fetchJson(`${b}/card_colors_meta.json`), fetchJson(`${b}/card_colors_ids.json`), fetch(`${b}/card_colors.bin`).then((r) => r.arrayBuffer())]);
    const bytes = new Uint8Array(bin);
    const ri = Math.max(0, meta.regions.indexOf('art'));
    const out = new Map();
    ids.forEach((id, row) => {
      const cols = [];
      for (let c = 0; c < meta.colors_per_card; c += 1) {
        const off = row * meta.bytes_per_card + ri * meta.colors_per_card * meta.bytes_per_color + c * meta.bytes_per_color;
        const w = bytes[off + 3] / 255;
        if (w > 0) cols.push({ L: bytes[off], a: bytes[off + 1] - 128, b: bytes[off + 2] - 128, w });
      }
      out.set(id, cols);
    });
    return out;
  } catch (e) {
    console.log(`  (no colour blob for ${g.key}: ${e.message})`);
    return new Map();
  }
}

/** Image URL from a game's manifest (schema 1). */
function manifestUrl(m, id, field = 'image') {
  const i = m.fields.indexOf(field);
  const entry = m.cards[id];
  if (i < 0 || !entry || !entry[i]) return null;
  return `${m.base[field]}/${entry[i]}`;
}

step(1, 'account');
const [who] = await appSql(`select id from public.profiles where username = ${q(USERNAME)};`);
if (!who) fail(`no profile ${USERNAME}`);
console.log(`  @${USERNAME} ${who.id.slice(0, 8)}`);

step(2, 'the cards');
const pages = [];
for (const g of GAMES) {
  const summary = await fetchJson(`${base(g)}/prices-summary.json`);
  const ranked = rankedIds(summary, 60);
  let cards = [];
  let similarity = new Map();
  if (g.key === 'pokemon') {
    const ids = ranked.map(([id]) => id);
    const rows = await dataSql(`
      select id, name, image_url, rarity, illustrator, evolution_line, evolution_stage_index, full_art_kind, full_art, scene_tags, color_art, types, set_name, number
        from public.cards_en where id = any(${textArray(ids)});`);
    const byId = new Map(rows.map((r) => [r.id, r]));
    cards = ids.filter((id) => byId.has(id)).map((id) => {
      const f = byId.get(id);
      return {
        id,
        name: f.name,
        price: summary[id].cur,
        image: f.image_url,
        depthWords: (f.scene_tags ?? []).filter((t) => DEPTH_TAGS.has(t)),
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
      };
    });
    const nine = cards.slice(0, TOP).map((c) => c.id);
    const sim = await dataSql(`
      select a.id as a, b.id as b, (1 - (a.embedding <=> b.embedding))::float as s
        from public.cards_en a join public.cards_en b on b.id > a.id
       where a.id = any(${textArray(nine)}) and b.id = any(${textArray(nine)}) and a.embedding is not null and b.embedding is not null;`);
    for (const r of sim) {
      if (!similarity.has(r.a)) similarity.set(r.a, new Map());
      if (!similarity.has(r.b)) similarity.set(r.b, new Map());
      similarity.get(r.a).set(r.b, r.s);
      similarity.get(r.b).set(r.a, r.s);
    }
  } else {
    const [catalog, manifest, palettes] = await Promise.all([fetchJson(`${base(g)}/catalog.json`), fetchJson(`${base(g)}/images.json`), paletteIndex(g)]);
    cards = ranked
      .filter(([id]) => catalog.cards[id] && manifestUrl(manifest, id))
      .map(([id, price]) => {
        const c = catalog.cards[id];
        return {
          id,
          name: c.name,
          price,
          image: manifestUrl(manifest, id),
          evolutionLine: c.evolution_line ?? [],
          setId: c.set_id || undefined,
          number: c.number || undefined,
          rarity: c.rarity || undefined,
          palette: palettes.get(id) ?? [],
          types: c.types ?? [],
        };
      });
  }
  if (cards.length < TOP + 3) fail(`${g.label}: only ${cards.length} priced cards with pictures`);
  const nine = cards.slice(0, TOP);
  const art = cards.slice(ART_FROM, ART_FROM + 6);
  console.log(`  ${g.label}: ${nine.map((c) => `${c.name} $${c.price}`).join(' · ')}`);

  step(3, `arranging ${g.label}`);
  const templates = ART_TEMPLATES.filter((t) => t.rows === ROWS && t.cols === COLS && !t.spread && t.cardPockets === TOP);
  const answer = arrangePage({ rows: ROWS, cols: COLS, spread: false, cards: nine, templates, similarity });
  if (!answer) fail(`${g.label}: the arranger had no answer`);
  const a = answer.best;
  if (a.held.length) fail(`${g.label}: ${a.held.length} cards held`);
  const artSlots = a.template ? templateArtSlots(a.template, randomUUID) : [];
  console.log(`   ${a.reason} (${a.template?.id ?? 'no template'}, ${artSlots.length} art pockets)`);
  const byCell = new Map(a.placements.map((x) => [`${x.cell.row},${x.cell.col}`, x.cardId]));
  const artCells = new Set(artSlots.flatMap((s) => { const out = []; for (let r = s.row; r < s.row + s.rowSpan; r += 1) for (let c = s.col; c < s.col + s.colSpan; c += 1) out.push(`${r},${c}`); return out; }));
  const nameOf = new Map(nine.map((c) => [c.id, c.name]));
  for (let r = 0; r < ROWS; r += 1) {
    const line = [];
    for (let c = 0; c < COLS; c += 1) {
      const k = `${r},${c}`;
      const id = byCell.get(k);
      line.push(id ? nameOf.get(id).slice(0, 14).padEnd(14) : artCells.has(k) ? '[art]'.padEnd(14) : '.'.padEnd(14));
    }
    console.log(`      ${line.join(' ')}`);
  }
  pages.push({ game: g, nine, art, arrangement: a, artSlots });
}

if (!APPLY) {
  console.log('\nDry run. Add --apply to write the binder.');
  process.exit(0);
}

step(4, 'writing the binder, private');
await appSql(`delete from public.binders where owner_id = ${q(who.id)} and title = ${q(TITLE)};`);
const binderId = randomUUID();
const cardItem = (c, x, y, i) => ({
  id: randomUUID(),
  kind: 'art',
  name: `${c.game} · ${c.name}`,
  cardId: c.id,
  x,
  y,
  w: 0.3,
  h: 0.419,
  rot: (i % 2 ? 1 : -1) * (1.5 + (i % 3)),
  fit: 'contain',
  aspect: 63 / 88,
  mask: { shape: 'rounded', radius: 0.03 },
});
const tops = pages.map((p) => ({ ...p.nine[0], game: p.game.label }));
const spots = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.72], [0.7, 0.72]];
const cover = {
  modelId: 'vaultx-exotec-zip-12-xl',
  colourway: 'signature-black',
  showCover: true,
  surfaces: {
    front: tops.slice(0, 4).map((c, i) => cardItem(c, spots[i][0], spots[i][1], i)),
    back: tops.slice(4, 8).map((c, i) => cardItem(c, spots[i][0], spots[i][1], i + 4)),
  },
};
await appSql(`
  insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id, is_public, is_demo, cover)
  values (${q(binderId)}, ${q(who.id)}, ${q(TITLE)}, ${q(DESCRIPTION)}, 'themed_story', ${q(tops[0].id)}, false, false, ${q(JSON.stringify(cover))}::jsonb);`);
const pageIds = pages.map(() => randomUUID());
await appSql(`
  insert into public.binder_pages (id, binder_id, position, title, notes, rows, cols, is_public)
  values ${pages.map((p, i) => `(${q(pageIds[i])}, ${q(binderId)}, ${i}, ${q(p.game.label)}, ${q(`The nine most expensive ${p.game.label} cards. Arranged: ${p.arrangement.reason}.`)}, ${ROWS}, ${COLS}, false)`).join(',\n         ')};`);
const rows = [];
pages.forEach((p, i) => {
  for (const x of p.arrangement.placements) rows.push(`(${q(randomUUID())}, ${q(pageIds[i])}, ${x.cell.row}, ${x.cell.col}, 1, 1, 'card', ${q(x.cardId)}, null, null, null, null)`);
  p.artSlots.forEach((s, k) => {
    const pic = p.art[k % p.art.length];
    const attribution = JSON.stringify({ sourceName: 'official card art', origin: 'card' });
    rows.push(`(${q(randomUUID())}, ${q(pageIds[i])}, ${s.row}, ${s.col}, ${s.rowSpan}, ${s.colSpan}, 'artwork', null, ${q(pic.image)}, null, 'cover', ${q(attribution)}::jsonb)`);
  });
});
await appSql(`
  insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id, image_url, image_crop, image_fit, image_attribution)
  values ${rows.join(',\n         ')};`);
const check = await appSql(`
  select p.position, p.title, count(s.id) filter (where s.slot_type = 'card') as cards, count(s.id) filter (where s.slot_type = 'artwork') as art
    from public.binder_pages p left join public.binder_slots s on s.page_id = p.id
   where p.binder_id = ${q(binderId)} group by p.position, p.title order by p.position;`);
for (const r of check) console.log(`  p${Number(r.position) + 1} ${r.title}: ${r.cards} cards, ${r.art} art pockets`);
console.log(`\nOK: private  https://michi-maker.com/binder/${binderId}`);

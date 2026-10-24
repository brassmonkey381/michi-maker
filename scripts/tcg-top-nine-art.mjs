/**
 * RE-ARRANGE THE EIGHT-GAME BINDER AND CURATE ITS ART (owner, 2026-10-24: "call the arrange
 * function on each and pick an arrangement, and then curate some art for the placeholder spots.
 * I dont want to use card art. Use art from our art sources").
 *
 * Works on the binder as it stands (the owner has edited it since it was built), page by page:
 * the cards already on the page are the cards, the arranger gets every 3x4 template, and the take
 * is the best one unless its template repeats the page before, in which case the first alternate
 * that seats every card takes its place, so eight pages do not read as one. The art pockets are
 * filled from the app's art sources, Pexels and Pixabay, with one query per game and the hit whose
 * shape best fits the pocket (the same choice `pickStockHit` makes in the app). Every picture is
 * re-hosted into the owner's binder-art folder and credited to the photographer, origin
 * 'external', exactly as the Add art sheet would stamp it.
 *
 *   node scripts/tcg-top-nine-art.mjs            dry run: arrangements and the chosen photos
 *   node scripts/tcg-top-nine-art.mjs --apply    rewrites the pages' slots in place
 */
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT, appSql, dataSql, fail, q, readVars, step, textArray } from './lib/michi.mjs';

const src = (p) => pathToFileURL(join(ROOT, 'src', p)).href;
const A = await import(src('data/arrange.ts'));
const { arrangePage } = await import(src('data/arranger.ts'));
const { ART_TEMPLATES, templateArtSlots } = await import(src('data/artTemplates.ts'));

const APPLY = process.argv.includes('--apply');
const BINDER_ID = process.argv.find((a) => /^[0-9a-f-]{36}$/.test(a)) ?? 'eda55ff7-7614-457c-8980-ff44594f0e27';
const BROWSE = 'https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/browse';
const APP = 'https://piikwvntldytjejxmcla.supabase.co';
const DEPTH_TAGS = new Set(A.depthTagQuery());

const env = readVars(join(ROOT, '.env'), ['EXPO_PUBLIC_PEXELS_KEY', 'EXPO_PUBLIC_PIXABAY_KEY']);
const secrets = readVars('C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets', ['APP_SECRET_KEY']);
if (!env.EXPO_PUBLIC_PEXELS_KEY && !env.EXPO_PUBLIC_PIXABAY_KEY) fail('no stock art keys in .env');
if (APPLY && !secrets.APP_SECRET_KEY) fail('APP_SECRET_KEY not in the secrets file (needed to host pictures in the owner folder)');

/** One query per game: the world the game lives in, not its cards. */
const THEMES = {
  pokemon: { q: 'thunderstorm lightning night sky', kind: 'photo' },
  magic: { q: 'misty mountains castle fantasy', kind: 'photo' },
  yugioh: { q: 'egypt pyramids desert night stars', kind: 'photo' },
  onepiece: { q: 'sailing ship ocean sunset', kind: 'photo' },
  lorcana: { q: 'enchanted castle fairy lights', kind: 'photo' },
  digimon: { q: 'digital data network glowing', kind: 'any' },
  riftbound: { q: 'glowing crystal cave', kind: 'photo' },
  cyberpunk: { q: 'neon city night rain', kind: 'photo' },
};
const GAME_OF_TITLE = {
  'Pokémon': 'pokemon', 'Magic: The Gathering': 'magic', 'Yu-Gi-Oh!': 'yugioh', 'One Piece': 'onepiece',
  'Disney Lorcana': 'lorcana', 'Digimon': 'digimon', 'Riftbound': 'riftbound', 'Cyberpunk TCG': 'cyberpunk',
};
const PREFIX = { pokemon: '', magic: 'magic', yugioh: 'yugioh', onepiece: 'onepiece', lorcana: 'lorcana', digimon: 'digimon', riftbound: 'riftbound', cyberpunk: 'cyberpunk' };

const fetchJson = async (url, init) => {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url.toString().replace(/key=[^&]+/, 'key=…')} -> ${r.status}`);
  return r.json();
};
const base = (game) => (PREFIX[game] ? `${BROWSE}/${PREFIX[game]}` : BROWSE);

async function paletteIndex(game) {
  try {
    const b = `${base(game)}/color`;
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
    console.log(`  (no colour blob for ${game}: ${e.message})`);
    return new Map();
  }
}

/** The arranger's card records for one page's ids, by game. */
async function cardsFor(game, ids) {
  if (game === 'pokemon') {
    const rows = await dataSql(`
      select id, name, rarity, illustrator, evolution_line, evolution_stage_index, full_art_kind, full_art, scene_tags, color_art, types, set_name, number
        from public.cards_en where id = any(${textArray(ids)});`);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const cards = ids.filter((id) => byId.has(id)).map((id) => {
      const f = byId.get(id);
      return {
        id, name: f.name,
        depthWords: (f.scene_tags ?? []).filter((t) => DEPTH_TAGS.has(t)),
        evolutionLine: f.evolution_line ?? [],
        evolutionStage: (f.evolution_stage_index ?? -2) + 1,
        illustrator: f.illustrator || undefined, setId: f.set_name || undefined, number: f.number || undefined,
        fullArtKind: f.full_art_kind || undefined, fullArt: typeof f.full_art === 'boolean' ? f.full_art : undefined,
        rarity: f.rarity || undefined,
        palette: (f.color_art ?? []).map(([L, a, b2, w]) => ({ L, a, b: b2, w })),
        types: f.types ?? [],
      };
    });
    const similarity = new Map();
    const sim = await dataSql(`
      select a.id as a, b.id as b, (1 - (a.embedding <=> b.embedding))::float as s
        from public.cards_en a join public.cards_en b on b.id > a.id
       where a.id = any(${textArray(ids)}) and b.id = any(${textArray(ids)}) and a.embedding is not null and b.embedding is not null;`);
    for (const r of sim) {
      if (!similarity.has(r.a)) similarity.set(r.a, new Map());
      if (!similarity.has(r.b)) similarity.set(r.b, new Map());
      similarity.get(r.a).set(r.b, r.s);
      similarity.get(r.b).set(r.a, r.s);
    }
    return { cards, similarity };
  }
  const [catalog, palettes] = await Promise.all([fetchJson(`${base(game)}/catalog.json`), paletteIndex(game)]);
  const cards = ids.filter((id) => catalog.cards[id]).map((id) => {
    const c = catalog.cards[id];
    return {
      id, name: c.name, evolutionLine: c.evolution_line ?? [], setId: c.set_id || undefined, number: c.number || undefined,
      rarity: c.rarity || undefined, palette: palettes.get(id) ?? [], types: c.types ?? [],
    };
  });
  return { cards, similarity: new Map() };
}

/* ---------- stock art, the app's two providers, asked directly ---------- */
const panelAspect = (rs, cs) => (cs * 63 + (cs - 1) * 4) / (rs * 88 + (rs - 1) * 4);
const orientationFor = (aspect) => (aspect > 1.2 ? 'landscape' : aspect < 0.85 ? 'portrait' : 'square');

async function pexels(query, orientation, per) {
  if (!env.EXPO_PUBLIC_PEXELS_KEY) return [];
  const u = new URL('https://api.pexels.com/v1/search');
  u.searchParams.set('query', query);
  u.searchParams.set('per_page', String(per));
  if (orientation) u.searchParams.set('orientation', orientation);
  const body = await fetchJson(u, { headers: { Authorization: env.EXPO_PUBLIC_PEXELS_KEY } });
  return (body.photos ?? []).map((p) => {
    const scale = p.width > 0 ? Math.min(1, 1880 / Math.max(p.width, p.height)) : 1;
    return { provider: 'pexels', id: String(p.id), url: p.src.large2x ?? p.src.large ?? p.src.original, width: Math.round(p.width * scale), height: Math.round(p.height * scale), author: p.photographer, authorUrl: p.photographer_url, pageUrl: p.url };
  });
}
async function pixabay(query, orientation, kind, per) {
  if (!env.EXPO_PUBLIC_PIXABAY_KEY) return [];
  const u = new URL('https://pixabay.com/api/');
  u.searchParams.set('key', env.EXPO_PUBLIC_PIXABAY_KEY);
  u.searchParams.set('q', query);
  u.searchParams.set('image_type', kind === 'illustration' ? 'illustration' : kind === 'photo' ? 'photo' : 'all');
  u.searchParams.set('orientation', orientation === 'portrait' ? 'vertical' : orientation === 'landscape' ? 'horizontal' : 'all');
  u.searchParams.set('per_page', String(Math.max(3, Math.min(per, 50))));
  u.searchParams.set('safesearch', 'true');
  const body = await fetchJson(u);
  return (body.hits ?? []).map((h) => {
    const scale = h.imageWidth > 0 ? Math.min(1, 1280 / Math.max(h.imageWidth, h.imageHeight)) : 1;
    return { provider: 'pixabay', id: String(h.id), url: h.largeImageURL, width: Math.round(h.imageWidth * scale), height: Math.round(h.imageHeight * scale), author: h.user, authorUrl: `https://pixabay.com/users/${encodeURIComponent(h.user)}-${h.user_id}/`, pageUrl: h.pageURL, tags: h.tags };
  });
}
/** The app's pick: closest shape, printable size, not used yet, earlier hits favoured. */
function pickStockHit(hits, aspect, used) {
  let bestHit = null;
  let bestCost = Infinity;
  for (const [i, h] of hits.entries()) {
    if (used.has(`${h.provider}:${h.id}`) || !h.width || !h.height || Math.min(h.width, h.height) < 700) continue;
    const cost = Math.abs(Math.log(h.width / h.height / aspect)) + i * 0.03;
    if (cost < bestCost) { bestCost = cost; bestHit = h; }
  }
  return bestHit;
}
const searchCache = new Map();
async function search(theme, orientation) {
  const key = `${theme.q}|${orientation}`;
  if (!searchCache.has(key)) {
    const [a, b] = await Promise.all([pexels(theme.q, orientation, 15).catch((e) => (console.log(`  (pexels: ${e.message})`), [])), pixabay(theme.q, orientation, theme.kind, 15).catch((e) => (console.log(`  (pixabay: ${e.message})`), []))]);
    // Interleave so neither provider owns the top of the list.
    const mixed = [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) { if (a[i]) mixed.push(a[i]); if (b[i]) mixed.push(b[i]); }
    searchCache.set(key, mixed);
  }
  return searchCache.get(key);
}

/* ---------- the binder as it stands ---------- */
step(1, 'the binder');
const [binder] = await appSql(`select id, owner_id, title from public.binders where id = ${q(BINDER_ID)};`);
if (!binder) fail(`no binder ${BINDER_ID}`);
const pages = await appSql(`select id, position, title, rows, cols from public.binder_pages where binder_id = ${q(BINDER_ID)} order by position;`);
const slots = await appSql(`select page_id, slot_type, card_id from public.binder_slots where page_id in (${pages.map((p) => q(p.id)).join(',')});`);
console.log(`  ${binder.title}: ${pages.length} pages, owner ${binder.owner_id.slice(0, 8)}`);

step(2, 'arranging each page from the cards on it');
const plans = [];
let previousTemplate = null;
for (const p of pages) {
  const game = GAME_OF_TITLE[p.title];
  if (!game) fail(`page "${p.title}" is not one of the eight games`);
  const ids = slots.filter((s) => s.page_id === p.id && s.slot_type === 'card' && s.card_id).map((s) => s.card_id);
  const { cards, similarity } = await cardsFor(game, ids);
  if (cards.length !== ids.length) fail(`${p.title}: ${ids.length - cards.length} cards missing from the catalog`);
  // Only templates that seat every card: this is a most-expensive binder, and the arranger would
  // otherwise hold a card to buy itself a bigger art panel.
  const templates = ART_TEMPLATES.filter((t) => t.rows === p.rows && t.cols === p.cols && !t.spread && t.cardPockets >= cards.length);
  const answer = arrangePage({ rows: p.rows, cols: p.cols, spread: false, cards, templates, similarity });
  if (!answer) fail(`${p.title}: the arranger had no answer`);
  const takes = [answer.best, ...answer.alternates].filter((a) => a.held.length === 0);
  if (!takes.length) fail(`${p.title}: no take seats all ${cards.length} cards`);
  // A take with art pockets when one seats every card (a 3x4 page of ten has none: the only
  // template past nine is the full dozen, which has no art). Variety: skip a template that repeats
  // the previous page's when another take with art does not.
  const withArt = takes.filter((a) => a.template && a.template.panels.length);
  const chosen = withArt.find((a) => a.template.id !== previousTemplate) ?? withArt[0] ?? takes[0];
  previousTemplate = chosen.template?.id ?? null;
  const artSlots = chosen.template ? templateArtSlots(chosen.template, randomUUID) : [];
  const which = chosen === answer.best ? 'best' : chosen.name.toLowerCase();
  console.log(`  ${p.title} (${cards.length} cards): ${chosen.template?.id ?? 'plain page'}, ${artSlots.length} art pocket${artSlots.length === 1 ? '' : 's'} [${which}]`);
  console.log(`     ${chosen.reason}`);
  const nameOf = new Map(cards.map((c) => [c.id, c.name]));
  const byCell = new Map(chosen.placements.map((x) => [`${x.cell.row},${x.cell.col}`, x.cardId]));
  const artCells = new Set(artSlots.flatMap((s) => { const out = []; for (let r = s.row; r < s.row + s.rowSpan; r += 1) for (let c = s.col; c < s.col + s.colSpan; c += 1) out.push(`${r},${c}`); return out; }));
  for (let r = 0; r < p.rows; r += 1) {
    const line = [];
    for (let c = 0; c < p.cols; c += 1) { const k = `${r},${c}`; const id = byCell.get(k); line.push(id ? nameOf.get(id).slice(0, 14).padEnd(14) : artCells.has(k) ? '[art]'.padEnd(14) : '.'.padEnd(14)); }
    console.log(`      ${line.join(' ')}`);
  }
  plans.push({ page: p, game, chosen, artSlots });
}

step(3, 'choosing photos from Pexels and Pixabay');
const used = new Set();
for (const plan of plans) {
  const theme = THEMES[plan.game];
  plan.art = [];
  for (const s of plan.artSlots) {
    const aspect = panelAspect(s.rowSpan, s.colSpan);
    const hits = await search(theme, orientationFor(aspect));
    const hit = pickStockHit(hits, aspect, used) ?? pickStockHit(await search(theme, undefined), aspect, used);
    if (!hit) fail(`${plan.page.title}: no photo for "${theme.q}" (${s.colSpan}x${s.rowSpan})`);
    used.add(`${hit.provider}:${hit.id}`);
    plan.art.push({ slot: s, hit });
    console.log(`  ${plan.page.title}: ${s.colSpan}x${s.rowSpan} ← ${hit.provider} ${hit.id} by ${hit.author} (${hit.width}x${hit.height}) ${hit.pageUrl}`);
  }
}

if (!APPLY) {
  console.log('\nDry run. Add --apply to rewrite the pages.');
  process.exit(0);
}

step(4, 'hosting the photos in the owner folder');
const headers = { Authorization: `Bearer ${secrets.APP_SECRET_KEY}`, apikey: secrets.APP_SECRET_KEY };
for (const plan of plans) {
  for (const a of plan.art) {
    const res = await fetch(a.hit.url);
    if (!res.ok) fail(`${a.hit.provider} ${a.hit.id}: download ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const h = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const path = `${binder.owner_id}/stock-${a.hit.provider}-${a.hit.id}-${h}.${ext}`;
    const up = await fetch(`${APP}/storage/v1/object/binder-art/${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': type, 'x-upsert': 'true' }, body: bytes });
    const text = await up.text();
    if (!up.ok && !/already exists|Duplicate/i.test(text)) fail(`${path}: ${up.status} ${text.slice(0, 200)}`);
    a.hosted = `${APP}/storage/v1/object/public/binder-art/${path}`;
    console.log(`  ${plan.page.title}: ${Math.round(bytes.length / 1024)} KB hosted`);
  }
}

step(5, 'rewriting the pages');
const rows = [];
for (const plan of plans) {
  for (const x of plan.chosen.placements) rows.push(`(${q(randomUUID())}, ${q(plan.page.id)}, ${x.cell.row}, ${x.cell.col}, 1, 1, 'card', ${q(x.cardId)}, null, null, null, null)`);
  for (const a of plan.art) {
    const attribution = JSON.stringify({ artist: a.hit.author, sourceName: a.hit.provider === 'pexels' ? 'Pexels' : 'Pixabay', sourceUrl: a.hit.pageUrl, origin: 'external' });
    rows.push(`(${q(randomUUID())}, ${q(plan.page.id)}, ${a.slot.row}, ${a.slot.col}, ${a.slot.rowSpan}, ${a.slot.colSpan}, 'artwork', null, ${q(a.hosted)}, null, 'cover', ${q(attribution)}::jsonb)`);
  }
}
await appSql(`
  delete from public.binder_slots where page_id in (${plans.map((p) => q(p.page.id)).join(',')});
  insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id, image_url, image_crop, image_fit, image_attribution)
  values ${rows.join(',\n         ')};
  ${plans.map((p) => `update public.binder_pages set notes = ${q(`Arranged: ${p.chosen.reason}`)} where id = ${q(p.page.id)};`).join('\n  ')}
  update public.binders set updated_at = now() where id = ${q(BINDER_ID)};`);
const check = await appSql(`
  select p.position, p.title, count(s.id) filter (where s.slot_type = 'card') as cards, count(s.id) filter (where s.slot_type = 'artwork') as art
    from public.binder_pages p left join public.binder_slots s on s.page_id = p.id
   where p.binder_id = ${q(BINDER_ID)} group by p.position, p.title order by p.position;`);
for (const r of check) console.log(`  p${Number(r.position) + 1} ${r.title}: ${r.cards} cards, ${r.art} art pockets`);
console.log(`\nOK  https://michi-maker.com/binder/${BINDER_ID}`);

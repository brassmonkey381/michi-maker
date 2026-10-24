/**
 * Windowed cards as stock cards: the approved mock-up (owner, 2026-10-24: "I like this C-natural!
 * Save that as the method to use without rescaling.").
 *
 * A windowed (non full-art) Pokémon card is shown as its ART WINDOW ALONE, cropped out of the
 * card scan and laid at full pocket width with NO rescaling in either direction beyond fitting
 * that width, on a black stock card. Under the window: the name in a bold serif, a small-caps
 * line (dex number, type, stage), a ruled table of series, set, number, illustrator and release
 * year, and the dex number as a faint watermark in the bottom corner. Full-art cards are left as
 * they are. Two rejected siblings for the record: the window stretched vertically to fill the
 * card (liked, but this one was preferred), and the bare window scaled into a pocket.
 *
 * Usage: node scripts/lab/windowed-stock-card.mjs [puzzle date YYYY-MM-DD]
 *        node scripts/lab/windowed-stock-card.mjs --binder <id> [--page <n, from 1>]
 *   Renders the day's daily puzzle, or one binder page, to state/out/windowed-<source>.jpg, and
 *   beside it windowed-<source>-connected.jpg: the bare windows at their natural size, butted
 *   edge to edge at their grid positions with no pockets and no rescaling (owner, 2026-10-24:
 *   "just adjacent and connected"), for pages whose cards share one continuing illustration.
 *
 * THE OPEN PROBLEM is the window geometry: `windowFor` is a hand-set table by series, as
 * fractions of the card. Good enough for a mock; a feature needs a per-set table or an edge
 * detector. The evolution-stage tab sits inside the window on every modern card and is kept.
 */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { appSql, dataSql, q, step, fail, ROOT, imageManifest, cardImageUrl } from '../lib/michi.mjs';

const sharp = (await import('sharp')).default;
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const BINDER = flag('--binder');
const PAGE_NO = Number(flag('--page') ?? 1);
const DAY = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 10);
const OUT = `${ROOT}/state/out`;
mkdirSync(OUT, { recursive: true });

/** Art window as [x0, y0, x1, y1] fractions of the card, by series. */
function windowFor(card) {
  const s = card.series ?? '';
  if (/Sword & Shield|Scarlet & Violet|Mega Evolution/.test(s)) return [0.064, 0.118, 0.936, 0.468];
  if (/Promos/.test(s)) return [0.07, 0.108, 0.93, 0.462];
  return [0.07, 0.125, 0.93, 0.49]; // Sun & Moon, XY, BW, HGSS, Platinum, DP, EX
}

const PW = 300, PH = 419, GAP = 14, PAD = 28, R = 10;
const SANS = 'Helvetica, Arial, sans-serif', SERIF = 'Georgia, serif';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rounded = (w, h) => Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${R}" fill="#fff"/></svg>`);

async function plainCard(bytes) {
  return sharp(bytes).resize(PW, PH, { fit: 'cover' }).composite([{ input: rounded(PW, PH), blend: 'dest-in' }]).png().toBuffer();
}
const row = (y, label, value, wx, ww) => `
  <text x="${wx}" y="${y}" font-family="${SANS}" font-size="9" letter-spacing="1.6" fill="#7d7868">${esc(label)}</text>
  <text x="${wx + ww}" y="${y}" text-anchor="end" font-family="${SANS}" font-size="12.5" fill="#e4dfd0">${esc(value)}</text>`;

/** The art window cropped out of the scan, at the scan's own size. */
async function artWindow(bytes, card) {
  const img = sharp(bytes); const m = await img.metadata();
  const [x0, y0, x1, y1] = windowFor(card);
  return img.extract({ left: Math.round(x0 * m.width), top: Math.round(y0 * m.height), width: Math.round((x1 - x0) * m.width), height: Math.round((y1 - y0) * m.height) }).toBuffer();
}

/** The stock card for one windowed card: window at natural size, text block beneath. */
async function stockCard(bytes, card) {
  const art = await artWindow(bytes, card);
  const wx = Math.round(0.07 * PW), ww = Math.round(0.86 * PW), wy = 20;
  const fitted = await sharp(art).resize(ww).toBuffer(); const fm = await sharp(fitted).metadata();
  const by = wy + fm.height;
  const nameY = by + 38, subY = nameY + 18, ruleY = subY + 14, firstRow = ruleY + 24, rowH = 24;
  const dex = String(card.dex?.[0] ?? '').padStart(3, '0');
  const sub = [dex && `NO. ${dex}`, card.types?.[0]?.toUpperCase(), card.stage?.toUpperCase()].filter(Boolean).join('  ·  ');
  const rows = [['SERIES', card.series], ['SET', card.set_name], ['NUMBER', card.number], ['ILLUSTRATOR', card.illustrator], ['RELEASED', card.release_date?.slice(0, 4)]].filter(([, v]) => v);
  const svg = Buffer.from(`<svg width="${PW}" height="${PH}">
    <rect width="${PW}" height="${PH}" rx="${R}" fill="#111114"/>
    <rect x="6" y="6" width="${PW - 12}" height="${PH - 12}" rx="${R - 3}" fill="none" stroke="#2a2a30" stroke-width="1"/>
    ${dex ? `<text x="${wx + ww + 2}" y="${PH - 14}" text-anchor="end" font-family="${SERIF}" font-size="56" fill="#1b1b20">${dex}</text>` : ''}
    <text x="${wx}" y="${nameY}" font-family="${SERIF}" font-size="27" font-weight="bold" fill="#f2efe6">${esc(card.name)}</text>
    <text x="${wx}" y="${subY}" font-family="${SANS}" font-size="10.5" letter-spacing="1.8" fill="#a39e8e">${esc(sub)}</text>
    <line x1="${wx}" y1="${ruleY}" x2="${wx + ww}" y2="${ruleY}" stroke="#34343c" stroke-width="1"/>
    ${rows.map(([l, v], i) => row(firstRow + i * rowH, l, v, wx, ww)).join('')}
    ${rows.slice(1).map((_, i) => `<line x1="${wx}" y1="${firstRow + i * rowH + 9}" x2="${wx + ww}" y2="${firstRow + i * rowH + 9}" stroke="#1f1f25" stroke-width="1"/>`).join('')}
  </svg>`);
  return sharp(svg).composite([{ input: fitted, left: wx, top: wy }]).png().toBuffer();
}

/** Where each card sits: {id, row, col} plus the grid, from the puzzle or the binder page. */
async function source() {
  if (BINDER) {
    const [page] = await appSql(`select id, title, rows, cols from public.binder_pages where binder_id = ${q(BINDER)} order by position offset ${PAGE_NO - 1} limit 1;`);
    if (!page) fail(`binder ${BINDER} has no page ${PAGE_NO}`);
    const slots = await appSql(`select row_index, col_index, card_id from public.binder_slots where page_id = ${q(page.id)} and slot_type = 'card' and card_id is not null order by row_index, col_index;`);
    return { label: `${BINDER.slice(0, 8)}-p${PAGE_NO}`, title: page.title, rows: page.rows, cols: page.cols, seats: slots.map((s) => ({ id: s.card_id, row: s.row_index, col: s.col_index })) };
  }
  const [puzzle] = await appSql(`select card_ids, rows, cols from public.daily_puzzles where publish_on = ${q(DAY)};`);
  if (!puzzle) fail(`no puzzle on ${DAY}`);
  return { label: DAY, title: `daily puzzle ${DAY}`, rows: puzzle.rows, cols: puzzle.cols, seats: puzzle.card_ids.map((id, i) => ({ id, row: Math.floor(i / puzzle.cols), col: i % puzzle.cols })) };
}

step(1, 'the cards');
const src = await source();
const list = src.seats.map((s) => q(s.id)).join(',');
// `cards`, not `cards_en`: a Japanese print is in the former only.
const cards = await dataSql(`select id, name, series, set_name, number, illustrator, dex, types, stage, release_date, full_art, full_art_kind, image_url from public.cards where id in (${list});`);
const byId = new Map(cards.map((c) => [c.id, c]));
const manifest = await imageManifest();
console.log(`  ${src.title}: ${src.seats.length} cards on a ${src.rows}x${src.cols}`);

step(2, 'rendering');
const { rows: rowsN, cols } = src;
const tiles = [], windows = [];
for (const seat of src.seats) {
  const card = byId.get(seat.id); if (!card) fail(`${seat.id} is not in the catalog`);
  const url = cardImageUrl(manifest, seat.id) ?? card.image_url;
  const res = await fetch(url); if (!res.ok) fail(`${seat.id}: image ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const fullArt = card.full_art === true || /special_illustration_rare|illustration_rare|named_full_art|measured|double_rare/.test(card.full_art_kind ?? '');
  const tile = fullArt ? await plainCard(bytes) : await stockCard(bytes, card);
  tiles.push({ input: tile, left: PAD + seat.col * (PW + GAP), top: PAD + seat.row * (PH + GAP) });
  if (!fullArt) windows.push({ input: await artWindow(bytes, card), row: seat.row, col: seat.col });
  console.log(`  ${card.name}: ${fullArt ? 'full art, untouched' : 'windowed, stock card'}`);
}
const W = PAD * 2 + PW * cols + GAP * (cols - 1), H = PAD * 2 + PH * rowsN + GAP * (rowsN - 1);
const file = `${OUT}/windowed-${src.label}.jpg`;
writeFileSync(file, await sharp({ create: { width: W, height: H, channels: 3, background: '#1c1c20' } }).composite(tiles).jpeg({ quality: 90 }).toBuffer());
console.log(`
OK  ${file}`);

// The connected sheet: every window at the size it was cropped, no gaps. Windows differ by a
// pixel or two between scans, so each cell is the largest window and smaller ones sit top-left.
if (windows.length) {
  const metas = await Promise.all(windows.map((w) => sharp(w.input).metadata()));
  const cw = Math.max(...metas.map((m) => m.width)), ch = Math.max(...metas.map((m) => m.height));
  const sheet = await sharp({ create: { width: cw * cols, height: ch * rowsN, channels: 3, background: '#000' } })
    .composite(windows.map((w) => ({ input: w.input, left: w.col * cw, top: w.row * ch }))).jpeg({ quality: 92 }).toBuffer();
  const connected = `${OUT}/windowed-${src.label}-connected.jpg`;
  writeFileSync(connected, sheet);
  console.log(`OK  ${connected}`);
}

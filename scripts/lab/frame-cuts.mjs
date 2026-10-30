/**
 * BEFORE / AFTER for the frame classes (docs/ART-FRAMES-HANDOFF.md, 2026-10-30): for one card per
 * class, the old single window (ART_WINDOW) beside the card's own class rectangle from frames.json,
 * each cut laid on a black stock card at the same width. What the owner looks at before the cut
 * ships. Writes state/out/frame-cuts.jpg.
 *
 *   node scripts/lab/frame-cuts.mjs
 */
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dataSql, q, step, fail, ROOT, imageManifest, cardImageUrl } from '../lib/michi.mjs';
const sharp = (await import('sharp')).default;

const OLD = { x0: 0.086, y0: 0.103, x1: 0.917, y1: 0.462 };
const CLASSES = ['pk-wotc-pokemon', 'pk-ex-pokemon', 'pk-xy-pokemon', 'pk-sv-pokemon', 'pk-sv-trainer', 'pk-sv-energy', 'pk-sv-ex', 'pk-v', 'pk-vmax', 'pk-gx', 'pk-full', 'pk-break'];
const W = 220; // stock card width
const H = Math.round((W * 88) / 63);
const PAD = 14;

step(1, 'frames.json');
const frames = await (await fetch('https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/browse/frames.json')).json();

step(2, 'one card per class');
const rows = await dataSql(`select frame, id, name, image_url from (select frame, id, name, image_url, row_number() over (partition by frame order by release_date desc nulls last, id) rn from cards_en where frame in (${CLASSES.map(q).join(',')})) t where rn <= 8 order by frame, rn;`);
const manifest = await imageManifest();

/** The rectangle cut out of the scan and laid at width W on a black card; returns the tile buffer. */
async function stock(bytes, rect, label, sub) {
  const img = sharp(bytes);
  const m = await img.metadata();
  const left = Math.round(rect.x0 * m.width), top = Math.round(rect.y0 * m.height);
  const width = Math.max(1, Math.round((rect.x1 - rect.x0) * m.width)), height = Math.max(1, Math.round((rect.y1 - rect.y0) * m.height));
  const art = await sharp(bytes).extract({ left, top, width, height }).resize(W - 2 * PAD).toBuffer();
  const am = await sharp(art).metadata();
  const artH = Math.min(am.height, H - 2 * PAD - 34);
  const artClipped = await sharp(art).extract({ left: 0, top: 0, width: am.width, height: artH }).toBuffer();
  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" rx="10" fill="#111114"/>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="7" fill="none" stroke="#2a2a30"/>
    <text x="${PAD}" y="${PAD + artH + 20}" font-family="Georgia, serif" font-weight="bold" font-size="13" fill="#f2efe6">${label.replace(/&/g, '&amp;')}</text>
    <text x="${PAD}" y="${PAD + artH + 34}" font-family="Arial, sans-serif" font-size="9" fill="#a39e8e" letter-spacing="1">${sub.toUpperCase()}</text>
  </svg>`);
  return sharp(svg).composite([{ input: artClipped, left: PAD, top: PAD }]).png().toBuffer();
}

step(3, 'rendering');
const tiles = [];
const COLS = 4; // class rows of [whole card | old cut | new cut] -> lay 4 classes per row band
const CELL_W = W * 3 + PAD * 4;
const CELL_H = H + PAD * 3 + 16;
let i = 0;
for (const cls of CLASSES) {
  const f = frames[cls];
  if (!f) { console.log(`  (no frame for ${cls})`); continue; }
  // The first candidate whose picture the manifest knows and the server serves.
  let r = null, bytes = null;
  for (const c of rows.filter((x) => x.frame === cls)) {
    const url = cardImageUrl(manifest, c.id);
    if (!url) continue;
    const res = await fetch(url);
    if (!res.ok) continue;
    r = c; bytes = Buffer.from(await res.arrayBuffer()); break;
  }
  if (!r) { console.log(`  (no servable card for ${cls})`); continue; }
  const whole = await sharp(bytes).resize(W, H, { fit: 'cover' }).png().toBuffer();
  const before = await stock(bytes, OLD, r.name, 'old: one window');
  const after = await stock(bytes, f, r.name, `${cls} · ${f.kind}${f.orientation === 'landscape' ? ' · landscape' : ''}`);
  const x = (i % COLS) * CELL_W + PAD, y = Math.floor(i / COLS) * CELL_H + PAD + 24;
  const head = Buffer.from(`<svg width="${CELL_W}" height="20" xmlns="http://www.w3.org/2000/svg"><text x="0" y="14" font-family="Arial" font-size="12" fill="#ddd">${cls}  ·  ${r.name.replace(/&/g, '&amp;')}  ·  ${f.kind}</text></svg>`);
  tiles.push({ input: head, left: x, top: y - 22 });
  tiles.push({ input: whole, left: x, top: y });
  tiles.push({ input: before, left: x + W + PAD, top: y });
  tiles.push({ input: after, left: x + 2 * (W + PAD), top: y });
  i += 1;
}
const rowsN = Math.ceil(i / COLS);
const outW = COLS * CELL_W + PAD, outH = rowsN * CELL_H + PAD + 24;
mkdirSync(`${ROOT}/state/out`, { recursive: true });
const file = `${ROOT}/state/out/frame-cuts.jpg`;
writeFileSync(file, await sharp({ create: { width: outW, height: outH, channels: 3, background: '#1c1c20' } }).composite(tiles).jpeg({ quality: 88 }).toBuffer());
console.log(`wrote ${file} (${i} classes; each row: whole card, old window, new class cut)`);

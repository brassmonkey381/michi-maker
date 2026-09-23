/**
 * STAGE 8: pick a card that is at least the RIGHT POKEMON.
 *
 * WHAT WENT WRONG. The anchor index is English only, so a Japanese card has no anchor at all.
 * cosineTopK still returns its nearest neighbour and there is no "not in the index" signal, only a
 * lower number, so a Japanese Palkia came back as Metang and a Japanese Dialga as Lugia: both
 * blue-grey legendaries in the right general shape, both over the 0.60 gate, both the wrong
 * Pokemon. That is not a threshold problem and no threshold fixes it. The nearest thing in a
 * corpus that does not contain the answer is confidently wrong.
 *
 * THE FIX (owner, 2026-09-23): scope the search by the NAME the caption already gives us. For
 * "Palkia, Dialga" the candidates become only the anchor rows of cards named Palkia or Dialga, so
 * the worst case is an English Palkia instead of a Japanese one, which is the right Pokemon and
 * the right artwork family. Metang cannot win a search it is not in.
 *
 * SCOPED TO THE GROUP, NOT THE POCKET. The caption's order is not guaranteed to be the
 * photograph's, so every pocket in a group searches the union of that group's named species and
 * similarity decides which is which. It also handles a caption naming one card over a photograph
 * of three printings of it.
 *
 * NO ESCAPE HATCH. MatchScope supports falling back to the whole corpus when the scoped best is
 * weak; that is exactly the behaviour being removed here, so it is left off. A weak scoped answer
 * is recorded as weak rather than replaced by a confident wrong one.
 *
 * EMBEDDINGS ARE KEPT THIS TIME. Re-scoping used to mean re-running every model over every
 * photograph; with the 64 floats per pocket on disk, any future change of strategy is arithmetic.
 *
 *   node --import ./scripts/connected-art/lib/register.mjs scripts/connected-art/8-rescope.mjs [limit]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import sharp from 'sharp';
import * as tf from '@tensorflow/tfjs';

import { cropToClassifierInput, letterboxToDetectorInput } from '@/lib/image-preprocess';
import {
  CLASSIFIER_INPUT_SIZE,
  cosineTopK,
  decodeYolox,
  isCardShaped,
  nms,
  parseAnchorIndex,
  YOLOX_INPUT_SIZE,
} from '@/lib/recognition-core';
import { baseName, norm } from '@/lib/name-match';

import { toGrid } from './lib/pageFit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');
const IMAGES = join(DIR, 'images');
const APP = join(here, '..', '..', '..', 'tcgscan-app');
const BASE = 'https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public';

const MAX_DECODE_EDGE = 1536;
const DETECTION_THRESHOLD = 0.25;
const TOP_K = 5;
const ACCEPT = 0.6;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
const LIMIT = Number(process.argv[2]) || Infinity;

const { entries } = JSON.parse(readFileSync(join(DIR, 'entries.json'), 'utf8'));
const outPath = join(DIR, 'rescoped.json');
const done = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { results: {} };

step(1, 'loading models and the anchor index');
await tf.setBackend('cpu');
await tf.ready();
const od = await tf.loadGraphModel(`${BASE}/models/od-v4/model.json`);
const cls = await tf.loadGraphModel(`${BASE}/models/classifiers/capG-e15/model.json`);
const index = parseAnchorIndex(
  JSON.parse(readFileSync(join(APP, 'public', 'data', 'capG-e15', 'embeddings.json'), 'utf8')),
  JSON.parse(readFileSync(join(APP, 'public', 'data', 'capG-e15', 'cards_lookup.json'), 'utf8')),
);
console.log(`  ${index.count.toLocaleString()} anchors`);

step(2, 'building the name index over the anchors');
// The anchors know card ids; the catalog knows names. Cached, because it is 8.7 MB.
const catPath = join(DIR, 'scanner-catalog.json');
if (!existsSync(catPath)) {
  console.log('  fetching the scanner catalog (8.7 MB, once)');
  const res = await fetch(`${BASE}/models/data/capG-e15/catalog.json`);
  if (!res.ok) fail(`catalog fetch ${res.status}`);
  writeFileSync(catPath, await res.text());
}
const catalog = JSON.parse(readFileSync(catPath, 'utf8'));
// `cards` is an OBJECT keyed by card id, not an array, and `sets` is keyed by set id too. The id
// is therefore the key rather than a field on the value, which is exactly the shape a naive
// `for (const c of catalog.cards)` cannot read.
const nameById = new Map();
for (const [id, card] of Object.entries(catalog.cards ?? {})) {
  if (card?.name) nameById.set(String(id), card.name);
}
console.log(`  ${nameById.size.toLocaleString()} catalog names`);

/**
 * Anchor rows keyed by every word of the card's name. A caption says "Palkia"; the catalog says
 * "Palkia M LV.70" or "Palkia (Full Art)". Indexing by WORD rather than by the whole string is
 * what lets one match the other without a fuzzy matcher, and it keeps "White Kyurem" distinct
 * because a caption of two words has to hit both.
 */
const rowsByWord = new Map();
let named = 0;
for (const [row, cardId] of Object.entries(index.lookup)) {
  const name = nameById.get(String(cardId));
  if (!name) continue;
  named += 1;
  for (const w of norm(baseName(name)).split(' ')) {
    if (!w) continue;
    if (!rowsByWord.has(w)) rowsByWord.set(w, new Set());
    rowsByWord.get(w).add(Number(row));
  }
}
console.log(`  ${named.toLocaleString()} of ${index.count.toLocaleString()} anchors have a name  (${index.count - named} do not and can never be scoped)`);

/** The anchor rows a caption's species could be. Every word of a multi-word name must hit. */
function scopeFor(names) {
  const all = new Set();
  for (const n of names) {
    const words = norm(baseName(n)).split(' ').filter(Boolean);
    if (!words.length) continue;
    let acc = null;
    for (const w of words) {
      const hit = rowsByWord.get(w);
      if (!hit) {
        acc = new Set();
        break;
      }
      acc = acc === null ? new Set(hit) : new Set([...acc].filter((r) => hit.has(r)));
    }
    for (const r of acc ?? []) all.add(r);
  }
  return all;
}

async function decode(file) {
  const img = sharp(file).rotate();
  const meta = await img.metadata();
  const long = Math.max(meta.width, meta.height);
  const scale = long > MAX_DECODE_EDGE ? MAX_DECODE_EDGE / long : 1;
  const width = Math.round(meta.width * scale);
  const height = Math.round(meta.height * scale);
  const { data } = await img.resize(width, height).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data), width, height };
}
function run(model, input, shape) {
  const t = tf.tensor4d(input, shape);
  let out;
  try {
    out = model.execute(t);
  } finally {
    t.dispose();
  }
  const first = Array.isArray(out) ? out[0] : out;
  const copy = new Float32Array(first.dataSync());
  (Array.isArray(out) ? out : [out]).forEach((o) => o.dispose());
  return copy;
}

step(3, 'identifying, scoped by name');
let n = 0;
let changed = 0;
for (const entry of entries) {
  if (n >= LIMIT) break;
  if (done.results[entry.hash]) continue;
  const file = join(IMAGES, `${entry.hash}.jpg`);
  if (!existsSync(file)) continue;
  n += 1;

  try {
    const { rgba, width, height } = await decode(file);
    const lb = letterboxToDetectorInput(rgba, width, height, YOLOX_INPUT_SIZE);
    const head = run(od, lb.input, [1, YOLOX_INPUT_SIZE, YOLOX_INPUT_SIZE, 3]);
    const boxes = nms(decodeYolox(head, head.length / 6, lb.ratio, width, height, DETECTION_THRESHOLD)).filter((d) =>
      isCardShaped(d.box, width, height),
    );

    const names = (entry.names ?? []).map((x) => x.name);
    const rows = names.length ? scopeFor(names) : new Set();
    const scoped = rows.size > 0;

    const pockets = boxes.map((d) => {
      const crop = cropToClassifierInput(rgba, width, height, d.box, CLASSIFIER_INPUT_SIZE);
      const emb = run(cls, crop, [1, CLASSIFIER_INPUT_SIZE, CLASSIFIER_INPUT_SIZE, 3]);
      // No escapeThreshold: falling back to the whole corpus is the behaviour being removed.
      const inScope = scoped ? cosineTopK(emb, index, TOP_K, { rows }) : [];
      const open = cosineTopK(emb, index, TOP_K);
      const chosen = scoped && inScope.length ? inScope : open;
      const top = chosen[0];
      return {
        box: d.box,
        cardId: top?.cardId ?? null,
        name: top ? (nameById.get(String(top.cardId)) ?? null) : null,
        similarity: top ? Number(top.similarity.toFixed(4)) : 0,
        scoped: scoped && inScope.length > 0,
        // What it WOULD have said unscoped, so the change is auditable rather than asserted.
        unscopedCardId: open[0]?.cardId ?? null,
        unscopedName: open[0] ? (nameById.get(String(open[0].cardId)) ?? null) : null,
        unscopedSimilarity: open[0] ? Number(open[0].similarity.toFixed(4)) : 0,
        accepted: !!top && top.similarity >= ACCEPT,
        embedding: Array.from(emb, (v) => Number(v.toFixed(5))),
      };
    });

    const near = toGrid(pockets.map((p) => p.box));
    const flips = pockets.filter((p) => p.cardId && p.cardId !== p.unscopedCardId).length;
    changed += flips;
    done.results[entry.hash] = {
      hash: entry.hash,
      section: entry.section,
      caption: entry.rawCaption,
      names,
      scopeSize: rows.size,
      grid: { rows: near.rows, cols: near.cols },
      order: near.grid,
      pockets,
    };
    writeFileSync(outPath, JSON.stringify(done, null, 2));

    const tag = !names.length ? 'no caption' : scoped ? `scope ${rows.size}` : 'SCOPE EMPTY';
    console.log(
      `  [${String(n).padStart(3)}] ${near.rows}x${near.cols}  ${String(tag).padEnd(12)}${flips ? `  ${flips} changed` : ''}  ${entry.rawCaption ?? '(none)'}`,
    );
    if (flips) {
      for (const p of pockets.filter((x) => x.cardId !== x.unscopedCardId)) {
        console.log(`        ${p.unscopedName ?? '?'} (${p.unscopedSimilarity}) -> ${p.name ?? '?'} (${p.similarity})`);
      }
    }
  } catch (e) {
    console.log(`  [${String(n).padStart(3)}] FAILED ${entry.hash}: ${e.message ?? e}`);
  }
}

const all = Object.values(done.results);
const ps = all.flatMap((r) => r.pockets);
step(4, 'summary');
console.log(`  groups        : ${all.length}`);
console.log(`  pockets       : ${ps.length}`);
console.log(`  name-scoped   : ${ps.filter((p) => p.scoped).length}`);
console.log(`  changed card  : ${ps.filter((p) => p.cardId && p.cardId !== p.unscopedCardId).length}`);
console.log(`  over ${ACCEPT}     : ${ps.filter((p) => p.accepted).length}`);
console.log(`\n  wrote ${outPath}`);
console.log('\nOK: nothing has been written to the database.');

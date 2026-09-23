/**
 * STAGE 5: which card is in each pocket.
 *
 * Stage 3 answered "how is this group laid out". This answers "what is it", by cropping every
 * detected box and matching it against the 23,785 anchor embeddings capG-e15 ships. Same models,
 * same preprocessing and same cosine search the phone and the website run; the only substitutions
 * are Node's (sharp to decode, tfjs CPU to execute, files off disk).
 *
 * THE GATE IS 0.60 AND THE ANSWER IS TOP-1 (owner, 2026-09-23). Held-out printing-level top-1 for
 * this model is 0.721, and its signature failure is "right artwork, wrong set symbol". For a
 * gallery of CONNECTING ART that is the cheap failure: a cross-set reprint carries the identical
 * illustration, so a wrong printing still draws the right picture and the binder still reads.
 * Every similarity is recorded so a bad run is visible afterwards rather than having to be caught
 * beforehand.
 *
 * THE FAILURE THAT IS NOT CHEAP: about 4,800 catalog cards have no anchor at all, and there is no
 * "not in the index" signal, only a lower similarity. A miss returns a confident wrong card. The
 * per-pocket similarity and the runner-up gap are both written out so those stand out.
 *
 * RESUMABLE BY DESIGN. It writes after every photograph and skips anything already resolved, so a
 * run stopped for memory continues where it left off instead of starting over.
 *
 *   node --import ./scripts/connected-art/lib/register.mjs scripts/connected-art/5-identify.mjs [limit]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { pageFromStill } from '@/lib/page-from-still';

import { toGrid } from './lib/pageFit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');
const IMAGES = join(DIR, 'images');
const APP = join(here, '..', '..', '..', 'tcgscan-app');

const MAX_DECODE_EDGE = 1536;
const DETECTION_THRESHOLD = 0.25;
const TOP_K = 5;
/** The owner's gate. Below this the pocket is recorded but marked for a look. */
const ACCEPT = 0.6;

const OD_MODEL = 'https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/models/od-v4/model.json';
// Over HTTP, not file://: tfjs's loader in Node has no file scheme (only tfjs-node adds
// tf.io.fileSystem, and that is a native package this does not need). Both graphs are
// published anonymously and are the same bytes the website loads.
const CLS_MODEL =
  'https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/models/classifiers/capG-e15/model.json';

const MICHI_PAGES = [
  { label: '2x2', rows: 2, cols: 2 },
  { label: '3x3', rows: 3, cols: 3 },
  { label: '3x4', rows: 3, cols: 4 },
  { label: '4x4', rows: 4, cols: 4 },
];
const michiPage = (rows, cols) => MICHI_PAGES.find((p) => p.rows >= rows && p.cols >= cols) ?? null;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
const LIMIT = Number(process.argv[2]) || Infinity;

const entriesPath = join(DIR, 'entries.json');
if (!existsSync(entriesPath)) fail('entries.json not found. Run 1-scrape.mjs first.');
const { entries } = JSON.parse(readFileSync(entriesPath, 'utf8'));

const outPath = join(DIR, 'resolved.json');
/** Anything already answered stays answered: this is the resume. */
const done = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { results: {} };
const already = Object.keys(done.results).length;

step(1, 'loading the models');
await tf.setBackend('cpu');
await tf.ready();
const od = await tf.loadGraphModel(OD_MODEL);
const cls = await tf.loadGraphModel(CLS_MODEL);
console.log(`  detector od-v4 (${YOLOX_INPUT_SIZE}px), classifier capG-e15 (${CLASSIFIER_INPUT_SIZE}px), backend ${tf.getBackend()}`);

step(2, 'loading the anchor index (32 MB, once)');
const embRaw = JSON.parse(readFileSync(join(APP, 'public', 'data', 'capG-e15', 'embeddings.json'), 'utf8'));
const lookupRaw = JSON.parse(readFileSync(join(APP, 'public', 'data', 'capG-e15', 'cards_lookup.json'), 'utf8'));
const index = parseAnchorIndex(embRaw, lookupRaw);
console.log(`  ${index.count.toLocaleString()} anchors, dim ${index.dim}`);

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

/** One tensor in, one Float32Array out, nothing retained. */
function run(model, input, shape) {
  const t = tf.tensor4d(input, shape);
  let out;
  try {
    out = model.execute(t);
  } finally {
    t.dispose();
  }
  const first = Array.isArray(out) ? out[0] : out;
  const data = first.dataSync();
  const copy = new Float32Array(data);
  (Array.isArray(out) ? out : [out]).forEach((o) => o.dispose());
  return copy;
}

step(3, `identifying (${already} already done, ${entries.length - already} to go)`);
let n = 0;
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

    // One crop, one embedding, one search per pocket.
    const dets = boxes.map((d) => {
      const crop = cropToClassifierInput(rgba, width, height, d.box, CLASSIFIER_INPUT_SIZE);
      const emb = run(cls, crop, [1, CLASSIFIER_INPUT_SIZE, CLASSIFIER_INPUT_SIZE, 3]);
      const candidates = cosineTopK(emb, index, TOP_K).map((m) => ({ cardId: m.cardId, similarity: m.similarity }));
      return { box: d.box, candidates, score: d.score };
    });

    const near = toGrid(dets.map((d) => d.box));
    const grid = { rows: near.rows, cols: near.cols };
    const fits = michiPage(grid.rows, grid.cols);
    // Gate reported, never enforced: the owner asked for top-1 at 0.60, and a pocket below it is
    // still written so the run can be judged as a whole rather than silently thinned.
    const page = pageFromStill(dets, { uri: file, w: width, h: height }, (sims) => (sims[0] >= ACCEPT ? 'certain' : 'unsure'), {
      index: 1,
    });

    const pockets = dets.map((d, i) => {
      const top = d.candidates[0];
      const second = d.candidates[1];
      return {
        order: near.grid.flat().indexOf(i) + 1,
        cardId: top?.cardId ?? null,
        similarity: top ? Number(top.similarity.toFixed(4)) : 0,
        gap: top && second ? Number((top.similarity - second.similarity).toFixed(4)) : null,
        accepted: !!top && top.similarity >= ACCEPT,
        alternatives: d.candidates.slice(1, 3).map((c) => ({ cardId: c.cardId, similarity: Number(c.similarity.toFixed(4)) })),
        box: {
          xmin: Number(d.box.xmin.toFixed(4)),
          ymin: Number(d.box.ymin.toFixed(4)),
          xmax: Number(d.box.xmax.toFixed(4)),
          ymax: Number(d.box.ymax.toFixed(4)),
        },
      };
    });

    const accepted = pockets.filter((p) => p.accepted).length;
    done.results[entry.hash] = {
      hash: entry.hash,
      section: entry.section,
      caption: entry.rawCaption,
      namedCards: entry.names?.length ?? 0,
      grid,
      order: near.grid,
      michiPage: fits?.label ?? null,
      latticeGrid: page?.grid ?? null,
      pockets,
      accepted,
      total: pockets.length,
    };
    // Written every time: a run stopped for memory keeps everything it had already answered.
    writeFileSync(outPath, JSON.stringify(done, null, 2));

    const bar = `${accepted}/${pockets.length}`;
    const low = pockets.filter((p) => !p.accepted).length;
    console.log(
      `  [${String(n).padStart(3)}] ${grid.rows}x${grid.cols} -> ${String(fits?.label ?? '--').padEnd(4)} ${bar.padStart(5)} over ${ACCEPT}${low ? `  (${low} under)` : ''}  ${entry.rawCaption ?? '(no caption)'}`,
    );
  } catch (e) {
    console.log(`  [${String(n).padStart(3)}] FAILED ${entry.hash}: ${e.message ?? e}`);
  }
}

const all = Object.values(done.results);
const pockets = all.flatMap((r) => r.pockets);
step(4, 'summary');
console.log(`  groups resolved : ${all.length} of ${entries.length}`);
console.log(`  pockets         : ${pockets.length}`);
console.log(`  at or over ${ACCEPT} : ${pockets.filter((p) => p.accepted).length} (${Math.round((100 * pockets.filter((p) => p.accepted).length) / (pockets.length || 1))}%)`);
const sims = pockets.map((p) => p.similarity).sort((a, b) => a - b);
if (sims.length) {
  const q = (f) => sims[Math.floor(f * (sims.length - 1))].toFixed(3);
  console.log(`  similarity      : min ${q(0)}  p25 ${q(0.25)}  median ${q(0.5)}  p75 ${q(0.75)}  max ${q(1)}`);
}
console.log(`\n  wrote ${outPath}`);
console.log('\nOK: nothing has been written to the database.');

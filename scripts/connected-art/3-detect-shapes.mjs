/**
 * STAGE 3: what SHAPE is each group? Rows by columns, read off the photograph.
 *
 * The caption says "Taillow, Buizel, Mankey, Lotad, Paras, Ponyta, Yanma" and can never say
 * whether that runs 1x7 along a shelf or folds into 2x4. Page size is a binder-wide setting in
 * michi, so the shape is what decides which binder a group belongs in, and it exists only in the
 * picture.
 *
 * NOTHING HERE IS NEW LOGIC. The detector, the letterbox, the YOLOX decode, the NMS, the aspect
 * gate and the lattice-based shape inference are all tcgscan-app's, imported in place through
 * lib/tcgscan-hook rather than copied, because they were tuned against labelled scan sessions and
 * a copy would be the version nobody maintains. What this file adds is three substitutions the
 * phone does natively and Node does not: decoding a JPEG (sharp), running the model (tfjs CPU),
 * and reading files off disk.
 *
 * IDENTITY COMES LATER. This pass answers "how is this group laid out", not "which printing is
 * each card", so it runs the detector and skips the classifier and the 32 MB embedding index
 * entirely. That makes it cheap enough to run over all 201 photographs and look at the answer
 * before committing to anything.
 *
 *   node --import ./scripts/connected-art/lib/register.mjs scripts/connected-art/3-detect-shapes.mjs [limit]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import sharp from 'sharp';
import * as tf from '@tensorflow/tfjs';

import { letterboxToDetectorInput } from '@/lib/image-preprocess';
import { decodeYolox, isCardShaped, nms, YOLOX_INPUT_SIZE } from '@/lib/recognition-core';
import { pageFromStill } from '@/lib/page-from-still';
import { REAL_PAGE_SIZES } from '@/lib/page-shapes';

import { toGrid } from './lib/pageFit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');
const IMAGES = join(DIR, 'images');

/** Same as the phone: boxes and crops are computed against a 1536px long edge. */
const MAX_DECODE_EDGE = 1536;
/** The app's own setting, not the module default of 0.9. */
const DETECTION_THRESHOLD = 0.25;
const OD_MODEL = 'https://bmhjizcmwtmcrstadqto.supabase.co/storage/v1/object/public/models/od-v4/model.json';

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);

const LIMIT = Number(process.argv[2]) || Infinity;

const entriesPath = join(DIR, 'entries.json');
if (!existsSync(entriesPath)) fail('entries.json not found. Run 1-scrape.mjs first.');
const { entries } = JSON.parse(readFileSync(entriesPath, 'utf8'));

step(1, 'loading the detector (od-v4, the same graph the website runs)');
await tf.setBackend('cpu');
await tf.ready();
const od = await tf.loadGraphModel(OD_MODEL);
console.log(`  backend ${tf.getBackend()}, input ${YOLOX_INPUT_SIZE}x${YOLOX_INPUT_SIZE}`);

/** The shapes michi's binders actually come in. */
const MICHI_PAGES = [
  { label: '2x2', rows: 2, cols: 2 },
  { label: '3x3', rows: 3, cols: 3 },
  { label: '3x4', rows: 3, cols: 4 },
  { label: '4x4', rows: 4, cols: 4 },
];

/**
 * The owner's rule, applied to whatever shape the picture produced: the smallest michi page that
 * fits both dimensions. snapPageShape inside pageFromStill has already grown the shape to a real
 * one, but its target list includes the transpose 4x3, which michi has no page for, and it leaves
 * a shape nothing contains (a 1x5 line) unchanged. Both land here.
 */
function michiPage(rows, cols) {
  return MICHI_PAGES.find((p) => p.rows >= rows && p.cols >= cols) ?? null;
}

/** Decode to raw RGBA at the phone's working size. */
async function decode(file) {
  const img = sharp(file).rotate(); // honour EXIF orientation; a sideways photo is a sideways grid
  const meta = await img.metadata();
  const long = Math.max(meta.width, meta.height);
  const scale = long > MAX_DECODE_EDGE ? MAX_DECODE_EDGE / long : 1;
  const width = Math.round(meta.width * scale);
  const height = Math.round(meta.height * scale);
  const { data } = await img.resize(width, height).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data), width, height };
}

async function detect(file) {
  const { rgba, width, height } = await decode(file);
  // Returns { input, ratio }: the letterboxed pixels and the scale needed to unmap the boxes.
  const lb = letterboxToDetectorInput(rgba, width, height, YOLOX_INPUT_SIZE);
  // NHWC float32 of RAW 0-255, gray(114) padded. No /255 normalisation, matching the website.
  const t = tf.tensor4d(lb.input, [1, YOLOX_INPUT_SIZE, YOLOX_INPUT_SIZE, 3]);
  let out;
  try {
    out = od.execute(t);
  } finally {
    t.dispose();
  }
  const head = new Float32Array(await (Array.isArray(out) ? out[0] : out).data());
  (Array.isArray(out) ? out : [out]).forEach((o) => o.dispose());
  const n = head.length / 6;
  const boxes = nms(decodeYolox(head, n, lb.ratio, width, height, DETECTION_THRESHOLD));
  // StillDetection is {box, candidates}. This pass runs no classifier, so `candidates` is empty
  // and every pocket resolves to a null cardId with tier 'unsure'. That is honest: the shape is
  // measured, the identity is not yet asked.
  const shaped = boxes
    .filter((d) => isCardShaped(d.box, width, height))
    .map((d) => ({ box: d.box, candidates: [], score: d.score }));
  return { dets: shaped, width, height };
}

// Shape only: no classifier, so every pocket is "unsure" and the tier is not a claim about identity.
const tierOf = () => 'unsure';

step(2, 'reading each photograph');
const results = [];
let done = 0;
for (const entry of entries) {
  if (done >= LIMIT) break;
  const file = join(IMAGES, `${entry.hash}.jpg`);
  if (!existsSync(file)) continue;
  done += 1;
  try {
    const { dets, width, height } = await detect(file);
    // StillFrame is {uri, w, h} - not width/height.
    const page = pageFromStill(dets, { uri: file, w: width, h: height }, tierOf, { index: 1 });
    const lattice = page?.grid ?? { rows: 0, cols: 0 };

    // TWO READINGS, BECAUSE THEY DISAGREE ON THIS INPUT.
    //
    // pageFromStill's latticeIndices looks for two populations of gaps: "same line" (near zero,
    // because a full binder page has several cards sharing every row and column) and "next line"
    // (about a pocket). A LOOSE GROUP OF CARDS IN ONE ROW has only the second population, so the
    // widest-jump split finds nothing and every centre collapses onto one line: three cards in a
    // row come back 1x1 and snap to 2x2, a page that cannot hold three cards.
    //
    // That is not a defect in their module, it is its design target. It photographs a BINDER
    // PAGE. We photograph two to seven cards on a table, and most of these groups are a single
    // line, which is the one distribution its heuristic cannot see.
    //
    // So proximity clustering decides, and the lattice reading is kept beside it to be compared.
    const near = toGrid(dets.map((d) => d.box));
    const grid = { rows: near.rows, cols: near.cols };
    const named = entry.names?.length ?? 0;
    const fits = michiPage(grid.rows, grid.cols);
    results.push({
      hash: entry.hash,
      section: entry.section,
      caption: entry.rawCaption,
      namedCards: named,
      detected: dets.length,
      grid,
      latticeGrid: lattice,
      agree: lattice.rows === grid.rows && lattice.cols === grid.cols,
      michiPage: fits?.label ?? null,
      // The caption and the picture disagreeing is the interesting signal, not an error: a group
      // can name one card and photograph two printings of it (Eseries alternative arts).
      countMatch: named > 0 ? named === dets.length : null,
    });
    const flag = fits ? '' : '  <-- NO michi page fits';
    const dis = lattice.rows === grid.rows && lattice.cols === grid.cols ? '' : ` [lattice said ${lattice.rows}x${lattice.cols}]`;
    const mismatch = named > 0 && named !== dets.length ? `  (caption says ${named})` : '';
    console.log(
      `  [${String(done).padStart(3)}] ${String(dets.length).padStart(2)} cards  ${String(grid.rows)}x${String(grid.cols)} -> ${String(fits?.label ?? '--').padEnd(4)}${mismatch}${flag}${dis}  ${entry.rawCaption ?? '(no caption)'}`,
    );
  } catch (e) {
    console.log(`  [${String(done).padStart(3)}] FAILED ${entry.hash}: ${e.message ?? e}`);
    results.push({ hash: entry.hash, section: entry.section, caption: entry.rawCaption, error: String(e.message ?? e) });
  }
}

step(3, 'summary');
const ok = results.filter((r) => !r.error);
const byPage = {};
for (const r of ok) byPage[r.michiPage ?? 'NONE'] = (byPage[r.michiPage ?? 'NONE'] ?? 0) + 1;
console.log('  michi page needed:');
for (const k of Object.keys(byPage).sort()) console.log(`    ${k.padEnd(6)} x${byPage[k]}`);
const matched = ok.filter((r) => r.countMatch === true).length;
const compared = ok.filter((r) => r.countMatch !== null).length;
console.log(`  caption count agrees with detection on ${matched} of ${compared} captioned groups`);
console.log(`  the two shape readings agree on ${ok.filter((r) => r.agree).length} of ${ok.length}`);
console.log(`  errors: ${results.filter((r) => r.error).length}`);

mkdirSync(DIR, { recursive: true });
const outPath = join(DIR, 'shapes.json');
writeFileSync(outPath, JSON.stringify({ pages: MICHI_PAGES, results }, null, 2));
console.log(`\n  wrote ${outPath}`);
console.log('\nOK: stage 3 complete. Nothing was written to the database.');
void REAL_PAGE_SIZES;

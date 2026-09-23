/**
 * STAGE 11: keep only the groups whose ARTWORK the English catalog actually contains.
 *
 * WHAT WENT WRONG, AGAIN. Name scoping (stage 8) fixed the species but not the printing: a
 * Japanese card whose art has no English twin still resolved to some English card of the right
 * Pokemon and the wrong picture, which in a binder of CONNECTING artwork is the whole point missed.
 * "Right name, entirely wrong art" was the owner's verdict, and they are right.
 *
 * THE SIGNAL. The scanner publishes a second anchor index for Japanese printings at
 * `capG-e15-jp/`, and the two indexes disagree in a way that is worth more than any threshold on
 * one of them. Embedding the pocket once and asking BOTH corpora "how close is your nearest
 * anchor?" separates them cleanly: on the gallery's Japanese Movie-promo Palkia the Japanese index
 * answers 0.89 and the English one 0.65, and on the Celebrations Palkia it is the other way round.
 *
 * WHAT THIS GATE IS NOT. It is not a language detector, and it was checked by eye rather than
 * assumed. Sheets of real crops by margin band show French, German and Chinese printings sitting
 * among the English ones, because NEITHER index contains them and so neither can flag them. Those
 * prints carry the same picture as the English card, resolve to it correctly, and are kept
 * deliberately: the test that matters for this binder is whether the ARTWORK is right, not which
 * language the cardboard is in. A Japanese card whose art does exist in English passes too, and is
 * also fine, for the same reason.
 *
 * ALL OR NOTHING, PER GROUP. A page of connecting artwork is one picture split across cards, so one
 * pocket resolved to the wrong painting ruins the page and the other pockets being right does not
 * redeem it. A group is kept only if EVERY pocket passes.
 *
 * NO MODEL RUNS. Stage 8 stored the 64 floats per pocket. Both lookups are dot products.
 *
 * WHAT IS DEFERRED IS NOT THROWN AWAY. deferred-groups.json records every rejected group with the
 * numbers that rejected it, so the later pass has a work list and a reason per row.
 *
 *   node --import ./scripts/connected-art/lib/register.mjs scripts/connected-art/11-language-gate.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { cosineTopK, parseAnchorIndex } from '@/lib/recognition-core';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');
const APP = join(here, '..', '..', '..', 'tcgscan-app');
const JP = join(DIR, 'jp');

/**
 * Set by eye, not by a dip in a histogram. Contact sheets of real crops either side of these
 * numbers are what chose them: below a 0.05 margin the sheets are visibly half Japanese, and below
 * 0.80 the English match is a different painting of the right Pokemon.
 */
const MARGIN = 0.05;
const EN_FLOOR = 0.8;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);

const inPath = join(DIR, 'rescoped.json');
if (!existsSync(inPath)) fail('rescoped.json not found. Run 8-rescope.mjs first.');
if (!existsSync(join(JP, 'embeddings.json'))) {
  fail(`the Japanese index is not downloaded. Fetch capG-e15-jp/{embeddings,cards_lookup}.json into ${JP}`);
}
const { results } = JSON.parse(readFileSync(inPath, 'utf8'));

step(1, 'loading both anchor indexes');
const en = parseAnchorIndex(
  JSON.parse(readFileSync(join(APP, 'public', 'data', 'capG-e15', 'embeddings.json'), 'utf8')),
  JSON.parse(readFileSync(join(APP, 'public', 'data', 'capG-e15', 'cards_lookup.json'), 'utf8')),
);
const jp = parseAnchorIndex(
  JSON.parse(readFileSync(join(JP, 'embeddings.json'), 'utf8')),
  JSON.parse(readFileSync(join(JP, 'cards_lookup.json'), 'utf8')),
);
console.log(`  English ${en.count.toLocaleString()} anchors, Japanese ${jp.count.toLocaleString()} anchors`);
if (en.dim !== jp.dim) fail(`the indexes disagree on dimension: ${en.dim} vs ${jp.dim}`);

step(2, `gating on margin >= ${MARGIN} and English similarity >= ${EN_FLOOR}`);
const kept = [];
const deferred = [];
let noEmbedding = 0;

for (const g of Object.values(results)) {
  if (!g.pockets?.length) continue;
  if (g.pockets.some((p) => !p.embedding?.length)) {
    noEmbedding += 1;
    deferred.push({ hash: g.hash, caption: g.caption ?? null, section: g.section ?? null, reason: 'no stored embedding', pockets: [] });
    continue;
  }

  const reads = g.pockets.map((p) => {
    const e = Float32Array.from(p.embedding);
    const a = cosineTopK(e, en, 1)[0];
    const b = cosineTopK(e, jp, 1)[0];
    const enSim = a?.similarity ?? 0;
    const jpSim = b?.similarity ?? 0;
    return {
      cardId: p.cardId,
      name: p.name ?? null,
      en: Number(enSim.toFixed(4)),
      jp: Number(jpSim.toFixed(4)),
      margin: Number((enSim - jpSim).toFixed(4)),
      pass: enSim - jpSim >= MARGIN && enSim >= EN_FLOOR,
    };
  });

  g.language = { margin: MARGIN, enFloor: EN_FLOOR, reads };
  if (reads.every((r) => r.pass)) {
    kept.push(g);
    continue;
  }
  const bad = reads.filter((r) => !r.pass);
  const japanese = bad.filter((r) => r.margin < MARGIN).length;
  const weak = bad.filter((r) => r.en < EN_FLOOR).length;
  deferred.push({
    hash: g.hash,
    caption: g.caption ?? null,
    section: g.section ?? null,
    // Both can be true of one pocket; the reason names what the work list needs to know.
    reason: japanese && weak ? 'japanese-exclusive art and weak english match'
      : japanese ? 'japanese index wins'
      : 'weak english match',
    failing: bad.length,
    of: reads.length,
    pockets: reads,
  });
}

writeFileSync(join(DIR, 'language.json'), JSON.stringify({ margin: MARGIN, enFloor: EN_FLOOR, results }, null, 2));
writeFileSync(
  join(DIR, 'deferred-groups.json'),
  JSON.stringify(
    {
      note: 'Groups held back from the English pass. Each row says which pocket failed and by how much. '
        + 'A later pass with a different method (the Japanese anchor index, or OCR) can work this list.',
      margin: MARGIN,
      enFloor: EN_FLOOR,
      count: deferred.length,
      groups: deferred,
    },
    null,
    2,
  ),
);

step(3, 'summary');
const keptCards = kept.reduce((n, g) => n + g.pockets.length, 0);
const defCards = deferred.reduce((n, g) => n + (g.pockets?.length ?? 0), 0);
const byReason = {};
for (const d of deferred) byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
console.log(`  kept     : ${kept.length} groups, ${keptCards} cards`);
console.log(`  deferred : ${deferred.length} groups, ${defCards} cards`);
for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(3)}  ${r}`);
if (noEmbedding) console.log(`  ${noEmbedding} group(s) predate the stored embeddings and cannot be judged here`);
console.log(`\n  wrote ${join(DIR, 'language.json')}`);
console.log(`  wrote ${join(DIR, 'deferred-groups.json')}`);
console.log('\nOK: nothing has been written to the database.');

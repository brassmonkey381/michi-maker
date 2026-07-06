#!/usr/bin/env node
// build-catalog.mjs
//
// Transforms the TCGScan pipeline catalog into michi-maker's local browse catalog.
//
// Reads the pipeline catalog (a single JSON object of shape
// { productLine, counts, cards, sets, series }) and writes an identically shaped
// catalog to public/browse/catalog.json, with the ONLY change being that each
// card.image is rewritten from its absolute TCGPlayer CDN URL to a local path
// '/card-imgs/<id>.jpg' (the pipeline image-pool filename equals the product id).
//
// counts / sets / series are preserved unchanged. Idempotent: re-running produces
// the same output. No external deps — node built-ins only.
//
// It also derives the two card footprints that ARE recoverable from names/sets and
// writes them onto each card as `kind`:
//   - 'jumbo'  : an oversized 2×2 card — set_name === 'Jumbo Cards' or a jumbo/oversized name.
//   - 'vunion' : one of four 1×1 pieces that tile a 2×2 V-UNION (real SWSH-numbered pieces
//                only; the '[Set of 4]' bundle listing is excluded).
// The V-UNION pieces are additionally grouped into top-level `vunionGroups`, each a
// [topLeft, topRight, bottomLeft, bottomRight] run of exactly four imaged pieces.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';

const INPUT =
  'C:/Users/Brian/Desktop/data-science-projects/TCGScan-data-science/pipeline/dist/dev/catalog/catalog.json';
const OUTPUT =
  'C:/Users/Brian/source/repos/poke-michi/public/browse/catalog.json';
// The local image pool the app serves from (public/card-imgs/<id>.jpg). A card is
// "imaged" iff its <id>.jpg exists here; V-UNION chunks require all four pieces imaged.
const IMG_POOL_DIR = 'C:/Users/Brian/source/repos/poke-michi/public/card-imgs';

/** Numeric sort key for a collector number: "SWSH163" -> 163, "" -> +Infinity. */
function numberKey(n) {
  const m = (n ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}

function main() {
  const raw = readFileSync(INPUT, 'utf8');
  const catalog = JSON.parse(raw);

  if (!catalog || typeof catalog !== 'object' || !catalog.cards) {
    throw new Error('Unexpected catalog shape: missing "cards"');
  }

  // The set of imaged product ids (filename without the .jpg extension).
  const imaged = new Set(
    readdirSync(IMG_POOL_DIR)
      .filter((f) => f.endsWith('.jpg'))
      .map((f) => f.slice(0, -4)),
  );

  const cards = catalog.cards;
  let rewritten = 0;
  let jumboCount = 0;
  const vunionPieces = [];
  for (const key of Object.keys(cards)) {
    const card = cards[key];
    if (card && typeof card === 'object' && card.id != null) {
      card.image = `/card-imgs/${card.id}.jpg`;
      rewritten += 1;

      // JUMBO (2×2): the dedicated 'Jumbo Cards' set is the reliable signal. (A name regex
      // like /jumbo|oversized/ only mis-flags standard cards such as the Item "Jumbo Ice
      // Cream" — every real oversized card lives in the 'Jumbo Cards' set.)
      const isJumbo = card.set_name === 'Jumbo Cards';
      // V-UNION piece: a V-UNION-named card with a real SWSH collector number, EXCLUDING the
      // "[Set of 4]" bundle listings (some of which carry an SWSH number, e.g. Morpeko).
      const isVUnionPiece =
        /V-?UNION/i.test(card.name ?? '') &&
        /SWSH\d+/.test(card.number ?? '') &&
        !/\[set of 4\]/i.test(card.name ?? '');

      if (isJumbo) {
        card.kind = 'jumbo';
        jumboCount += 1;
      } else if (isVUnionPiece) {
        card.kind = 'vunion';
        vunionPieces.push(card);
      } else {
        card.kind = 'standard';
      }
    }
  }

  // Build V-UNION groups: bucket pieces by base name (name with the "V-UNION…" suffix
  // stripped), sort each bucket by numeric collector number, dedupe exact-number
  // collisions, then chunk into consecutive runs of exactly four — a base can have
  // multiple 4-piece printings. Each 4-run in ascending number order is
  // [topLeft, topRight, bottomLeft, bottomRight]. Drop any chunk that isn't a full
  // four with every piece imaged.
  const byBase = new Map();
  for (const card of vunionPieces) {
    const base = (card.name ?? '').replace(/\s*V-?UNION.*/i, '').trim();
    let bucket = byBase.get(base);
    if (!bucket) byBase.set(base, (bucket = []));
    bucket.push(card);
  }
  const vunionGroups = [];
  for (const [base, bucket] of byBase) {
    const sorted = [...bucket].sort((a, b) => numberKey(a.number) - numberKey(b.number));
    // Dedupe exact number collisions (keep the first occurrence of each number).
    const seenNums = new Set();
    const deduped = [];
    for (const card of sorted) {
      if (seenNums.has(card.number)) continue;
      seenNums.add(card.number);
      deduped.push(card);
    }
    for (let i = 0; i + 4 <= deduped.length; i += 4) {
      const chunk = deduped.slice(i, i + 4);
      if (!chunk.every((c) => imaged.has(String(c.id)))) continue; // drop non-imaged chunks
      vunionGroups.push({
        base,
        label: `${base} V-UNION`,
        pieces: chunk.map((c) => String(c.id)),
      });
    }
  }
  catalog.vunionGroups = vunionGroups;

  // Preserve counts / sets / series exactly as-is (no mutation above touches them).
  const outDir = dirname(OUTPUT);
  mkdirSync(outDir, { recursive: true });

  const out = JSON.stringify(catalog);
  writeFileSync(OUTPUT, out);

  const cardCount = Object.keys(cards).length;
  const setCount = catalog.sets ? Object.keys(catalog.sets).length : 0;
  const seriesCount = catalog.series ? Object.keys(catalog.series).length : 0;
  const bytes = Buffer.byteLength(out);

  console.log('build-catalog: done');
  console.log(`  input:        ${INPUT}`);
  console.log(`  output:       ${OUTPUT}`);
  console.log(`  productLine:  ${catalog.productLine}`);
  console.log(`  cards:        ${cardCount} (images rewritten: ${rewritten})`);
  console.log(`  jumbo:        ${jumboCount} marked kind='jumbo'`);
  console.log(`  vunion:       ${vunionPieces.length} pieces → ${vunionGroups.length} groups`);
  console.log(`  sets:         ${setCount}`);
  console.log(`  series:       ${seriesCount}`);
  console.log(`  counts field: ${JSON.stringify(catalog.counts)}`);
  console.log(`  bytes:        ${bytes.toLocaleString('en-US')}`);
}

main();

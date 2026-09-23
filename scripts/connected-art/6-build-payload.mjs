/**
 * STAGE 6: turn the resolved groups into binders, pages and pockets.
 *
 * THREE BINDERS, SPLIT BY PAGE SHAPE, because page size is a binder-wide setting in this product:
 * a binder cannot hold a clean two-wide row and a clean three-wide row at once. The gallery's
 * sections (Eeveelutions, Parallel city pairs, Artworks inside same gym) therefore cannot be the
 * split, and they move onto the PAGE instead, which is where they read better anyway.
 *
 * ONE GROUP PER PAGE. A 1x2 pair on a 2x2 page leaves two pockets empty, and that is the point:
 * the empty pockets are what say "these two belong together". Packing two unrelated pairs onto one
 * page makes them read as four unrelated cards, which is the opposite of what a gallery of
 * connecting artwork is for. Pages cost nothing on this account.
 *
 * PLACEMENT IS THE DETECTOR'S, NOT A GUESS. Each pocket goes at the (row, col) the photograph put
 * it in, so the illustration joins up across the page the way it joins up on the table. Nothing is
 * back-filled to square off a row, and nothing wraps.
 *
 * WRITES NOTHING. It produces state/connected-art/payload.json, which stage 7 prints and stage 8
 * sends. Every binder is private and carries the credit.
 *
 *   node scripts/connected-art/6-build-payload.mjs
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', '..', 'state', 'connected-art');

const SOURCE = 'https://www.elitefourum.com/t/gallery-of-cards-with-connected-artwork/49921';

/**
 * The credit, on every binder. The groupings are one collector's multi-year work and we are taking
 * the whole compilation; the cards are ours, the pairings are theirs, and saying so is the least
 * this can do. No em-dashes, per the project's copy rules.
 */
const CREDIT =
  'The groupings in this binder come from the gallery of cards with connected artwork on Elite Fourum, '
  + 'collected there by its community. The pairings are theirs, the cards are from our own catalog, '
  + 'and this binder is not affiliated with or endorsed by Elite Fourum.';

const BINDERS = {
  '2x2': {
    title: 'Connected Art: Pairs',
    blurb: 'Two cards whose illustrations join up, one pair to a page.',
  },
  '3x3': {
    title: 'Connected Art: Threes and Small Scenes',
    blurb: 'Groups of three across, and the small grids, one group to a page.',
  },
  '3x4': {
    title: 'Connected Art: The Wide Ones',
    blurb: 'The groups that need four across, one to a page.',
  },
  '4x4': {
    title: 'Connected Art: The Big Ones',
    blurb: 'The largest scenes, one to a page.',
  },
};

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);

const resolvedPath = join(DIR, 'resolved.json');
if (!existsSync(resolvedPath)) fail('resolved.json not found. Run 5-identify.mjs first.');
const { results } = JSON.parse(readFileSync(resolvedPath, 'utf8'));

/**
 * PREFER THE NAME-SCOPED ANSWER (stage 8). Scoping the search to the species the caption names is
 * what stopped a Japanese Palkia resolving to Metang: the impostor was never removed by a
 * threshold, because it SCORED HIGHER than the right card. It is removed from the race instead.
 *
 * ONLY THE CARD CHANGES. Stage 8 runs the same detector on the same images, so the boxes, the grid
 * and the pocket order come out identical (resolved.json merely rounds the boxes to 4dp). The page
 * shapes reviewed at stage 4 therefore stand, and the count guard below makes that an assertion
 * rather than an assumption: a group whose pockets do not line up keeps its unscoped answer and is
 * named in the report.
 */
const rescopedPath = join(DIR, 'rescoped.json');
const scoped = existsSync(rescopedPath) ? JSON.parse(readFileSync(rescopedPath, 'utf8')).results : {};
let rescopedGroups = 0;
let mismatched = 0;
for (const [hash, g] of Object.entries(results)) {
  const sc = scoped[hash];
  if (!sc?.pockets?.length) continue;
  if (sc.pockets.length !== g.pockets.length) {
    console.log(`  POCKET COUNT MOVED for ${hash}: ${g.pockets.length} -> ${sc.pockets.length}, keeping the unscoped answer`);
    mismatched += 1;
    continue;
  }
  rescopedGroups += 1;
  g.scopeSize = sc.scopeSize;
  g.pockets = g.pockets.map((p, i) => {
    const s = sc.pockets[i];
    return {
      ...p,
      cardId: s.cardId,
      name: s.name ?? null,
      similarity: s.similarity,
      accepted: s.accepted,
      scoped: s.scoped,
      // What the unscoped run said, so the change is auditable in the dry run and the review page
      // rather than asserted here.
      wasCardId: p.cardId ?? null,
      wasName: s.unscopedName ?? null,
      wasSimilarity: s.unscopedSimilarity ?? null,
    };
  });
}
console.log(
  `  ${rescopedGroups} of ${Object.keys(results).length} groups use the name-scoped card`
  + (mismatched ? `, ${mismatched} refused` : '')
  + `, ${Object.keys(results).length - rescopedGroups - mismatched} not rescoped`,
);

/**
 * THE ENGLISH PASS. Stage 11 marks every group with how its pockets scored against the English and
 * Japanese anchor indexes. Only groups where every pocket's ARTWORK is confidently in the English
 * catalog are built, because one pocket resolved to the wrong painting ruins a page of connecting
 * artwork and the other pockets being right does not redeem it. The rest are in
 * deferred-groups.json for a later pass; they are held back, not discarded.
 */
const languagePath = join(DIR, 'language.json');
let gated = null;
if (existsSync(languagePath)) {
  const lang = JSON.parse(readFileSync(languagePath, 'utf8'));
  gated = new Set(
    Object.values(lang.results)
      .filter((g) => g.language?.reads?.length && g.language.reads.every((r) => r.pass))
      .map((g) => g.hash),
  );
  console.log(`  language gate: ${gated.size} of ${Object.keys(lang.results).length} groups have English artwork throughout`);
} else {
  console.log('  language.json not found, building every group (run 11-language-gate.mjs to gate)');
}

const groups = Object.values(results)
  .filter((g) => g.michiPage && g.pockets?.some((p) => p.cardId))
  .filter((g) => !gated || gated.has(g.hash));

step(1, `laying out ${groups.length} groups`);

/** Keep the gallery's own order, so a reader walks the page in the order it was published. */
const ordered = [...groups].sort((a, b) => (a.order?.[0]?.[0] ?? 0) - (b.order?.[0]?.[0] ?? 0));

const byShape = new Map();
for (const g of ordered) {
  if (!byShape.has(g.michiPage)) byShape.set(g.michiPage, []);
  byShape.get(g.michiPage).push(g);
}

const binders = [];
for (const [shape, list] of [...byShape.entries()].sort()) {
  const meta = BINDERS[shape];
  if (!meta) fail(`no binder defined for page shape ${shape}`);
  const [rows, cols] = shape.split('x').map(Number);

  const pages = list.map((g) => {
    // The caption is the page's title. An image-only group has none, so the page is named for what
    // it is rather than left blank, and the section carries the rest.
    const names = g.caption ?? null;
    const slots = g.pockets
      .filter((p) => p.cardId)
      .map((p) => {
        // The detector's own grid position. order is 1-based across the whole group in reading
        // order; recover (row, col) from the group's grid rather than trusting the index.
        let row = 0;
        let col = 0;
        (g.order ?? []).forEach((r, ri) => {
          const ci = r.indexOf(g.pockets.indexOf(p));
          if (ci >= 0) {
            row = ri;
            col = ci;
          }
        });
        return {
          id: randomUUID(),
          row,
          col,
          rowSpan: 1,
          colSpan: 1,
          type: 'card',
          cardId: p.cardId,
          similarity: p.similarity,
          accepted: p.accepted,
          name: p.name ?? null,
          wasCardId: p.wasCardId ?? null,
          wasName: p.wasName ?? null,
          changed: !!p.wasCardId && p.wasCardId !== p.cardId,
          // true = the search was narrowed to the caption's species. false = it was rescoped but
          // the caption named nothing the catalog knows. undefined = stage 8 has not reached it.
          scoped: p.scoped,
        };
      })
      // A pocket outside the page cannot be written: the unique (page_id,row,col) would take it,
      // but the grid would not show it. Dropping it is visible in the dry run.
      .filter((s) => s.row < rows && s.col < cols);

    return {
      id: randomUUID(),
      rows,
      cols,
      title: names ?? 'Connected artwork',
      description: g.section ?? null,
      isPublic: false,
      slots,
      _sourceHash: g.hash,
      _dropped: g.pockets.filter((p) => p.cardId).length - slots.length,
    };
  });

  binders.push({
    id: randomUUID(),
    title: meta.title,
    description: `${meta.blurb} ${CREDIT}`,
    layoutStyle: 'themed_story',
    isPublic: false,
    isDemo: false,
    coverCardId: pages[0]?.slots?.[0]?.cardId ?? null,
    pageShape: shape,
    pages,
  });
}

step(2, 'checking the layout before anyone sees it');
let problems = 0;
for (const b of binders) {
  for (const p of b.pages) {
    const seen = new Set();
    for (const s of p.slots) {
      const key = `${s.row},${s.col}`;
      // The database's unique (page_id,row_index,col_index) would refuse this, but it would refuse
      // it halfway through a batch. Catch it here where the report can name the page.
      if (seen.has(key)) {
        console.log(`  DUPLICATE CELL ${key} on "${p.title}" (${b.title})`);
        problems += 1;
      }
      seen.add(key);
      if (s.row >= p.rows || s.col >= p.cols) {
        console.log(`  OUT OF RANGE ${key} on a ${p.rows}x${p.cols} page: "${p.title}"`);
        problems += 1;
      }
    }
    if (p._dropped > 0) console.log(`  dropped ${p._dropped} pocket(s) that fell outside the page: "${p.title}"`);
    if (!p.slots.length) {
      console.log(`  EMPTY PAGE: "${p.title}"`);
      problems += 1;
    }
  }
  if (b.isPublic) {
    console.log(`  PUBLIC BINDER: ${b.title}`);
    problems += 1;
  }
}
console.log(problems ? `  ${problems} problem(s) found` : '  no duplicate cells, nothing out of range, every binder private');

step(3, 'summary');
let totalPages = 0;
let totalSlots = 0;
let low = 0;
for (const b of binders) {
  const slots = b.pages.reduce((n, p) => n + p.slots.length, 0);
  totalPages += b.pages.length;
  totalSlots += slots;
  low += b.pages.reduce((n, p) => n + p.slots.filter((s) => !s.accepted).length, 0);
  console.log(`  ${b.title}`);
  console.log(`    ${b.pageShape} pages  x${String(b.pages.length).padStart(3)}   ${slots} cards`);
}
const changedCards = binders.reduce(
  (n, b) => n + b.pages.reduce((m, p) => m + p.slots.filter((s) => s.changed).length, 0),
  0,
);
// THREE STATES, NOT TWO. A page whose caption named nothing the catalog knows keeps exactly the
// failure this stage exists to remove, and is worth saying out loud. A page stage 8 has not reached
// yet is a different thing entirely, and counting the two together would report a finished run as
// riddled with holes.
const unscopable = binders.reduce(
  (n, b) => n + b.pages.filter((p) => p.slots.some((s) => s.scoped === false)).length,
  0,
);
const pending = binders.reduce(
  (n, b) => n + b.pages.filter((p) => p.slots.some((s) => s.scoped === undefined)).length,
  0,
);
console.log(`  TOTAL: ${binders.length} binders, ${totalPages} pages, ${totalSlots} cards (${low} below the accept gate)`);
console.log(`  name scoping moved ${changedCards} card(s); ${unscopable} page(s) had no caption to scope by`);
if (pending) console.log(`  ${pending} page(s) NOT RESCOPED YET, still on the unscoped answer`);

const outPath = join(DIR, 'payload.json');
writeFileSync(outPath, JSON.stringify({ source: SOURCE, credit: CREDIT, binders }, null, 2));
console.log(`\n  wrote ${outPath}`);
console.log('\nOK: nothing has been written to the database.');
if (problems) process.exit(1);

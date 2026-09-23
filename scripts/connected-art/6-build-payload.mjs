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
const groups = Object.values(results).filter((g) => g.michiPage && g.pockets?.some((p) => p.cardId));

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
console.log(`  TOTAL: ${binders.length} binders, ${totalPages} pages, ${totalSlots} cards (${low} below the accept gate)`);

const outPath = join(DIR, 'payload.json');
writeFileSync(outPath, JSON.stringify({ source: SOURCE, credit: CREDIT, binders }, null, 2));
console.log(`\n  wrote ${outPath}`);
console.log('\nOK: nothing has been written to the database.');
if (problems) process.exit(1);

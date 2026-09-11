// @ts-nocheck
/**
 * Build the two 30th-anniversary example binders → src/data/anniversaryBinders.json.
 *
 * Run: `node scripts/build-anniversary-binders.mjs`, then commit the JSON.
 *
 * These are EXAMPLE binders, so they ship in the app bundle and are attributed to @michimaker by
 * src/data/sampleData.ts like every other content module. Nothing here writes to any account.
 *
 *   "Thirty Years, Thirty Cards"  — ME: 30th Celebration Classic Collection (set 24837), all 30.
 *   "Pikachu, By Many Hands"      — ME: 30th Celebration (set 24722), thirty of sixty-one.
 *
 * THE PAIRING PAGES are the point of both, and they work differently in each binder.
 *
 * The Classic Collection reprints every card at its ORIGINAL collector number, which is what makes
 * the pairing findable: `4/102` is Base Set numbering, `11/113` is EX Delta Species. So "Then and
 * Now" seats the original print beside the anniversary reprint, one pair per row, and you read the
 * thirty years across two pockets. The other binder pairs within its own set instead: a Double Rare
 * beside the Special Illustration Rare of the same card, which is the same idea at one set's scale.
 *
 * WHY NOT PAIR EVERYTHING. Only 22 of the 30 reprints resolve to an unambiguous original, and a
 * wrong pairing is worse than no pairing: a naive name-and-number match hands back the 2021
 * Celebrations reprint for Charizard and a Jumbo promo for Pikachu, both of which look plausible and
 * are not the original. So the pairs are listed explicitly below, each one checked, and
 * `resolveOriginal` REFUSES anything it cannot pin down rather than guessing (see BAD_SETS). The
 * rest of the cards sit in ordinary chapters. The owner's instinct was right: not everywhere.
 *
 * Cards are named by collector number and resolved against the live catalog at build time. A number
 * that no longer exists fails the build loudly instead of producing a binder with a hole in it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'src', 'data', 'anniversaryBinders.json');
const API = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';

const CLASSIC = 24837; // ME: 30th Celebration Classic Collection (30 cards)
const CELEBRATION = 24722; // ME: 30th Celebration (61 cards)

/** Sets that are themselves reprints, promos or oddities: never the "original" print of anything. */
const BAD_SETS = /world championship|jumbo|classic collection|promo|celebrations|trading card game classic|deck|tin|box/i;
/** Era order, so the earliest qualifying print wins when several remain. */
const ERAS = [
  'Base', 'Jungle', 'Fossil', 'Gym', 'Neo', 'E-Card', 'EX', 'Diamond & Pearl', 'Platinum',
  'HeartGold & SoulSilver', 'Black & White', 'XY', 'Sun & Moon', 'Sword & Shield',
  'Scarlet & Violet', 'Mega Evolution',
];

// ── the two binders ──────────────────────────────────────────────────────────

/** Each pair is [collector number in the Classic Collection] and reads: original | reprint. */
const THEN_AND_NOW = ['11/113', '108/115', '94/102', '43/146', '85/124', '41/122'];

const CLASSIC_BINDER = {
  id: 'anniv-classic-collection',
  title: 'Thirty Years, Thirty Cards',
  description:
    'The Classic Collection in full, read as thirty years of the game. The second page is the one '
    + 'to linger on: each anniversary reprint sits beside the print it came from, so you can see '
    + 'what two decades did to the same card.',
  layoutStyle: 'themed_story',
  cover: { title: 'Thirty Years', numbers: ['4/102', '149/147', '123/172'] },
  pages: [
    {
      title: 'Then and Now',
      rows: 3,
      cols: 4,
      pairs: THEN_AND_NOW, // resolved below into original|reprint per row
    },
    {
      title: 'The First Twenty Years',
      rows: 3,
      cols: 3,
      numbers: ['58/102', '18/132', '69/132', '25/111', '106/105', '19/109', '5/109', '106/106', '47/127'],
    },
    {
      title: 'Legends and the Modern Game',
      rows: 3,
      cols: 4,
      // The Darkrai & Cresselia LEGEND is ONE picture across two cards, so Top sits directly
      // above Bottom in the first column. Everything else follows in era order.
      numbers: [
        '99/102', '101/101', '11/101', '106/160',
        '100/102', '57/111', '89/149', '33/181',
        '138/202', '114/264', '050/185', '203/193',
      ],
    },
  ],
};

/** Within one set: the ordinary print beside the Special Illustration Rare of the same card. */
const SAME_CARD_TWICE = [
  ['021/128', '148/128'], // Greninja ex
  ['071/128', '153/128'], // Sylveon ex
  ['054/128', '150/128'], // Pikachu ex
];

const CELEBRATION_BINDER = {
  id: 'anniv-30th-celebration',
  title: 'Pikachu, By Many Hands',
  description:
    'Thirty of the sixty-one in the 30th Celebration. A page where the same card appears twice, '
    + 'ordinary print beside its Special Illustration Rare; a gallery where every Pikachu is a '
    + 'different illustrator; and the Illustration Rares worth slowing down for.',
  layoutStyle: 'themed_story',
  cover: { title: 'The 30th Celebration', numbers: ['158/128', '149/128', '157/128'] },
  pages: [
    { title: 'The Same Card, Twice', rows: 3, cols: 2, rowPairs: SAME_CARD_TWICE },
    {
      title: 'Pikachu, by many hands',
      rows: 3,
      cols: 3,
      // Ken Sugimori and Atsuko Nishida lead: the man who drew the originals, and the artist who
      // designed Pikachu in the first place.
      numbers: ['023/128', '047/128', '032/128', '042/128', '028/128', '033/128', '026/128', '025/128', '030/128'],
    },
    {
      title: 'Worth Slowing Down For',
      rows: 3,
      cols: 4,
      // The legendary bird trio opens the page, in their original order.
      numbers: [
        '132/128', '133/128', '130/128', '131/128',
        '136/128', '138/128', '144/128', '139/128',
        '145/128', '155/128', '156/128', '147/128',
      ],
    },
  ],
};

// ── catalog ──────────────────────────────────────────────────────────────────

function apiKey() {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    if (line.startsWith('EXPO_PUBLIC_CATALOG_API_KEY=')) return line.slice(line.indexOf('=') + 1).trim();
  }
  throw new Error('EXPO_PUBLIC_CATALOG_API_KEY missing from .env');
}
const KEY = apiKey();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function die(message, code = 1) {
  console.error(`\nFAILED: ${message} (exit ${code})`);
  process.exit(code);
}

async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { apikey: KEY } });
  if (!res.ok) die(`catalog ${res.status} on ${path.slice(0, 90)}`, 2);
  return res.json();
}

async function setCards(setId) {
  const rows = await get(`/cards?select=id,name,number,rarity,illustrator&set_id=eq.${setId}&limit=200`);
  const byNumber = new Map(rows.map((c) => [String(c.number).trim(), c]));
  return { rows, byNumber };
}

/**
 * The original print of a reprint, or null when it cannot be pinned down. Same name AND same
 * collector number, minus every set that is itself a reprint or a promo, earliest era first.
 */
async function resolveOriginal(card) {
  const hits = await get(
    `/cards?select=id,name,number,set_name,series,illustrator&number=eq.${encodeURIComponent(card.number)}`
    + `&name=eq.${encodeURIComponent(card.name)}&set_id=neq.${CLASSIC}&language=eq.en&limit=8`,
  );
  const usable = (hits || []).filter((h) => !BAD_SETS.test(h.set_name || ''));
  if (!usable.length) return null;
  const rank = (s) => {
    const i = ERAS.findIndex((e) => String(s || '').startsWith(e));
    return i < 0 ? 99 : i;
  };
  usable.sort((a, b) => rank(a.series) - rank(b.series));
  return usable[0];
}

// ── building ─────────────────────────────────────────────────────────────────

const slot = (binderId, pageIndex, row, col, cardId) => ({
  id: `${binderId}_p${pageIndex}_r${row}c${col}`,
  row,
  col,
  rowSpan: 1,
  colSpan: 1,
  type: 'card',
  cardId,
});

function pick(byNumber, number, where) {
  const c = byNumber.get(number);
  if (!c) die(`${where}: card ${number} is not in the set any more`, 3);
  return c;
}

async function buildClassic() {
  const { rows, byNumber } = await setCards(CLASSIC);
  console.log(`  Classic Collection: ${rows.length} cards in the set`);
  const b = CLASSIC_BINDER;
  const pages = [];

  // Page 0: the cover leaf, three heroes across the middle row.
  pages.push({
    id: `${b.id}_p0`,
    title: b.cover.title,
    rows: 3,
    cols: 3,
    slots: b.cover.numbers.map((n, i) => slot(b.id, 0, 1, i, pick(byNumber, n, 'cover').id)),
  });

  let pageIndex = 1;
  for (const page of b.pages) {
    const slots = [];
    if (page.pairs) {
      // One pair per row: original on the left of the pair, reprint on its right.
      for (let i = 0; i < page.pairs.length; i += 1) {
        const reprint = pick(byNumber, page.pairs[i], 'Then and Now');
        const original = await resolveOriginal(reprint);
        await pause(700);
        if (!original) die(`Then and Now: no unambiguous original print for ${reprint.name} ${reprint.number}`, 4);
        const row = Math.floor(i / 2);
        const col = (i % 2) * 2;
        slots.push(slot(b.id, pageIndex, row, col, original.id));
        slots.push(slot(b.id, pageIndex, row, col + 1, reprint.id));
        console.log(`    pair: ${original.set_name} → anniversary  (${reprint.name})`);
      }
    } else {
      page.numbers.forEach((n, i) => {
        slots.push(slot(b.id, pageIndex, Math.floor(i / page.cols), i % page.cols, pick(byNumber, n, page.title).id));
      });
    }
    pages.push({ id: `${b.id}_p${pageIndex}`, title: page.title, rows: page.rows, cols: page.cols, slots });
    pageIndex += 1;
  }

  return {
    id: b.id,
    title: b.title,
    description: b.description,
    layoutStyle: b.layoutStyle,
    isExample: true,
    coverCardId: pick(byNumber, b.cover.numbers[0], 'cover').id,
    pages,
  };
}

async function buildCelebration() {
  const { rows, byNumber } = await setCards(CELEBRATION);
  console.log(`  30th Celebration: ${rows.length} cards in the set`);
  const b = CELEBRATION_BINDER;
  const pages = [];

  pages.push({
    id: `${b.id}_p0`,
    title: b.cover.title,
    rows: 3,
    cols: 3,
    slots: b.cover.numbers.map((n, i) => slot(b.id, 0, 1, i, pick(byNumber, n, 'cover').id)),
  });

  let pageIndex = 1;
  for (const page of b.pages) {
    const slots = [];
    if (page.rowPairs) {
      page.rowPairs.forEach(([plain, sir], row) => {
        slots.push(slot(b.id, pageIndex, row, 0, pick(byNumber, plain, page.title).id));
        slots.push(slot(b.id, pageIndex, row, 1, pick(byNumber, sir, page.title).id));
      });
    } else {
      page.numbers.forEach((n, i) => {
        slots.push(slot(b.id, pageIndex, Math.floor(i / page.cols), i % page.cols, pick(byNumber, n, page.title).id));
      });
    }
    pages.push({ id: `${b.id}_p${pageIndex}`, title: page.title, rows: page.rows, cols: page.cols, slots });
    pageIndex += 1;
  }

  return {
    id: b.id,
    title: b.title,
    description: b.description,
    layoutStyle: b.layoutStyle,
    isExample: true,
    coverCardId: pick(byNumber, b.cover.numbers[0], 'cover').id,
    pages,
  };
}

console.log('Building the two 30th-anniversary example binders');
const built = [await buildClassic(), await buildCelebration()];

for (const b of built) {
  const cards = b.pages.reduce((n, p) => n + p.slots.length, 0);
  console.log(`  "${b.title}": ${b.pages.length} pages, ${cards} cards`);
}

writeFileSync(OUT, `${JSON.stringify(built, null, 1)}\n`);
console.log(`\nWrote ${OUT}`);

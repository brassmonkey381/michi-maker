// @ts-nocheck
/**
 * Build the 30th-anniversary story binder → src/data/anniversaryBinders.json.
 *
 * Run: `node scripts/build-anniversary-binders.mjs`, then commit the JSON.
 *
 * ONE binder across BOTH anniversary sets, thirty pages, because the two sets are one story told
 * from both ends: `ME: 30th Celebration` (set 24722, 61 cards) is thirty years of artists drawing
 * the same mouse, and `ME: 30th Celebration Classic Collection` (24837, 30 cards) is thirty years
 * of the cards themselves. Splitting them into two binders, which is what the first attempt did,
 * made each half look thinner than it is and put the rhymes between them on different shelves.
 *
 * IT IS AN EXAMPLE BINDER, so it ships in the app bundle and `sampleData.ts` attributes it to
 * @michimaker. Nothing here writes to an account.
 *
 * HOW THE PAGES ARE BUILT. Cards are named by collector number with a one-letter set prefix
 * (`e:` Celebration, `c:` Classic Collection) and resolved against the live catalog at build time,
 * so a number that stops existing fails the build rather than leaving a hole in a page. Slots use
 * the michi-method vocabulary from `src/data/content/_helpers`:
 *
 *   card(r,c)                a framed card in a pocket
 *   art(r,c,{rowSpan,...})   the card's ARTWORK, full bleed, usually spanning several pockets
 *   gap(r,c)                 a tonal insert: negative space, on purpose
 *
 * The art slots are what make it michi rather than a checklist, and they are spent on the cards
 * that earn them: the Special Illustration Rares, the Illustration Rares and the Futuristic Rares,
 * whose whole point is a picture with no card furniture on it. Ordinary prints are used wherever a
 * theme actually wants them, which is most of the trainer, mechanic and history pages: a page about
 * how the game changed is better told by a LV.X and a BREAK than by another beautiful full art.
 *
 * EVERY PAGE CARRIES A DESCRIPTION, because a themed page that does not say what its theme is asks
 * the reader to guess, and half of them will guess wrong.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'src', 'data', 'anniversaryBinders.json');
const API = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';

const SETS = { e: 24722, c: 24837 };
const BINDER_ID = 'anniv-thirty-years';

// ── slot helpers (mirror src/data/content/_helpers) ──────────────────────────
const card = (row, col, ref, opts = {}) => ({ row, col, rowSpan: opts.rowSpan ?? 1, colSpan: opts.colSpan ?? 1, type: 'card', ref });
const art = (row, col, ref, opts = {}) => ({ ...card(row, col, ref, opts), type: 'artwork' });
const gap = (row, col, color, opts = {}) => ({ row, col, rowSpan: opts.rowSpan ?? 1, colSpan: opts.colSpan ?? 1, type: 'insert', insertColor: color });

/** Tonal inserts, picked to sit under the art rather than compete with it. */
const INK = '#161A22';
const BONE = '#EDE7DA';
const EMBER = '#7A2B2B';
const MOSS = '#26402F';

/**
 * THE THIRTY PAGES.
 *
 * Read as a book: it opens on the two cards that opened everything, walks the mouse through the
 * hands that drew him, spends its middle on the weather and the places the artwork actually shows,
 * then turns to the Classic Collection and reads thirty years of the game itself before closing on
 * the cards that are simply beautiful.
 */
const PAGES = [
  {
    title: 'Thirty Years',
    description:
      'Two anniversary sets in one binder. One is thirty years of artists drawing the same mouse, '
      + 'the other is thirty years of the cards themselves. They belong together.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:158/128', { rowSpan: 2, colSpan: 2 }),
      card(0, 2, 'e:157/128'), card(1, 2, 'c:4/102'),
      card(2, 0, 'c:149/147'), card(2, 1, 'c:123/172'), card(2, 2, 'e:149/128'),
    ],
  },
  {
    title: 'Where It Began',
    description:
      'Mew and Mewtwo, drawn as Futuristic Rares. The set closes the anniversary on the pair the '
      + 'first generation was built around, so the binder opens on them instead.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:157/128', { rowSpan: 3, colSpan: 2 }),
      card(0, 2, 'e:158/128'), card(1, 2, 'c:114/264'), gap(2, 2, INK),
    ],
  },
  {
    title: 'The First Card',
    description:
      'Base Set Charizard, reprinted at its original number. For a lot of people this is not a card, '
      + 'it is the reason they have the others.',
    rows: 3, cols: 3,
    slots: [
      gap(0, 0, EMBER), card(0, 1, 'c:4/102', { rowSpan: 2, colSpan: 2 }),
      gap(1, 0, EMBER),
      card(2, 0, 'c:58/102'), card(2, 1, 'c:69/132'), card(2, 2, 'c:18/132'),
    ],
  },

  // ── the mouse, and the hands ───────────────────────────────────────────────
  {
    title: 'Pikachu, By Many Hands',
    description:
      'The Celebration prints the same Pokemon twenty-three times, once per illustrator. Nothing '
      + 'else in thirty years of this game has said so plainly that the artwork is the point.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'e:023/128'), card(0, 1, 'e:047/128'), card(0, 2, 'e:032/128'),
      card(1, 0, 'e:042/128'), art(1, 1, 'e:149/128'), card(1, 2, 'e:028/128'),
      card(2, 0, 'e:033/128'), card(2, 1, 'e:026/128'), card(2, 2, 'e:025/128'),
    ],
  },
  {
    title: 'The Ones Who Drew Him First',
    description:
      'Ken Sugimori drew the originals. Atsuko Nishida designed Pikachu in the first place. They '
      + 'sit either side of the artists who grew up on what they made.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'e:023/128', { rowSpan: 2, colSpan: 1 }),
      card(0, 1, 'e:030/128'), card(0, 2, 'e:036/128'),
      card(1, 1, 'e:038/128'), card(1, 2, 'e:039/128'),
      card(2, 0, 'e:047/128', { colSpan: 1 }), card(2, 1, 'e:040/128'), card(2, 2, 'e:041/128'),
    ],
  },
  {
    title: 'And The Rest Of Them',
    description: 'Nine more, nine more hands. Same ears, same cheeks, no two alike.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'e:034/128'), card(0, 1, 'e:037/128'), card(0, 2, 'e:043/128'),
      card(1, 0, 'e:044/128'), card(1, 1, 'e:049/128'), card(1, 2, 'e:050/128'),
      card(2, 0, 'e:053/128'), card(2, 1, 'e:054/128'), card(2, 2, 'c:58/102'),
    ],
  },
  {
    title: 'The Same Card, Twice',
    description:
      'Pikachu ex as an ordinary print and as a Special Illustration Rare. The rules text is '
      + 'identical. Everything that makes the second one cost more is the picture.',
    rows: 3, cols: 4,
    slots: [
      card(0, 0, 'e:053/128'), art(0, 1, 'e:149/128', { rowSpan: 2, colSpan: 2 }), card(0, 3, 'e:054/128'),
      card(1, 0, 'e:021/128'), card(1, 3, 'e:071/128'),
      art(2, 0, 'e:150/128', { colSpan: 2 }), art(2, 2, 'e:148/128', { colSpan: 2 }),
    ],
  },

  // ── the eevee line ─────────────────────────────────────────────────────────
  {
    title: 'Eevee, Three Ways',
    description:
      'Three illustrators, one Pokemon whose whole character is that it could become something '
      + 'else. The set leans on that and so does this page.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'e:116/128'), card(0, 1, 'e:117/128'), card(0, 2, 'e:118/128'),
      art(1, 0, 'e:153/128', { rowSpan: 2, colSpan: 2 }),
      card(1, 2, 'e:069/128'), card(2, 2, 'e:091/128'),
    ],
  },
  {
    title: 'What It Became',
    description:
      'Espeon, Umbreon and Sylveon, each as a plain print and as an ex. The evolution is the theme '
      + 'twice over.',
    rows: 3, cols: 4,
    slots: [
      card(0, 0, 'e:069/128'), card(0, 1, 'e:070/128'), card(0, 2, 'e:091/128'), card(0, 3, 'e:092/128'),
      art(1, 0, 'e:153/128', { rowSpan: 2, colSpan: 2 }),
      card(1, 2, 'e:071/128'), card(1, 3, 'e:116/128'),
      card(2, 2, 'e:117/128'), card(2, 3, 'e:118/128'),
    ],
  },

  // ── weather, sky, water: the themes both sets actually share ───────────────
  {
    title: 'The Birds',
    description:
      'Articuno, Zapdos and Moltres as Illustration Rares, in the order the first generation put '
      + 'them in. Thirty years and they still travel together.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:132/128'), art(0, 1, 'e:133/128'), art(0, 2, 'e:130/128'),
      gap(1, 0, INK, { colSpan: 3 }),
      card(2, 0, 'c:149/147'), card(2, 1, 'c:050/185'), card(2, 2, 'c:85/124'),
    ],
  },
  {
    title: 'Storm',
    description:
      'Electricity, which this game has always drawn as weather rather than as an attack. Zapdos '
      + 'and Raikou on one side, the mouse who started it on the other.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:133/128', { rowSpan: 2, colSpan: 2 }),
      card(0, 2, 'c:050/185'), card(1, 2, 'c:33/181'),
      card(2, 0, 'e:057/128'), card(2, 1, 'e:134/128'), card(2, 2, 'c:138/202'),
    ],
  },
  {
    title: 'Water',
    description:
      'Lapras crossing open water, Greninja mid-strike, and the two Water legendaries the Classic '
      + 'Collection brought back. Also a Magikarp, because a water page owes you one.',
    rows: 3, cols: 4,
    slots: [
      art(0, 0, 'e:131/128', { rowSpan: 2, colSpan: 2 }),
      card(0, 2, 'e:021/128'), card(0, 3, 'c:106/106'),
      card(1, 2, 'c:41/122'), card(1, 3, 'c:203/193'),
      art(2, 0, 'e:148/128', { colSpan: 2 }), card(2, 2, 'c:108/115'), card(2, 3, 'c:5/109'),
    ],
  },
  {
    title: 'After Dark',
    description:
      'Drifloon and Chandelure are lit from inside. Umbreon, Gengar and Darkrai are lit from '
      + 'outside, barely. The whole page is one lighting decision.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:136/128'), art(0, 1, 'e:137/128'), card(0, 2, 'c:94/102'),
      card(1, 0, 'e:092/128'), gap(1, 1, INK), card(1, 2, 'c:99/102'),
      card(2, 0, 'e:091/128'), card(2, 1, 'c:19/109'), card(2, 2, 'c:100/102'),
    ],
  },
  {
    title: 'One Picture, Two Cards',
    description:
      'Darkrai and Cresselia is a single illustration split across a LEGEND pair. It only works '
      + 'with both halves in the binder, which is the most binder-shaped card ever printed.',
    rows: 3, cols: 3,
    slots: [
      gap(0, 0, INK), card(0, 1, 'c:99/102'), gap(0, 2, INK),
      gap(1, 0, INK), card(1, 1, 'c:100/102'), gap(1, 2, INK),
      card(2, 0, 'c:43/146'), card(2, 1, 'c:47/127'), card(2, 2, 'c:106/106'),
    ],
  },
  {
    title: 'Cats',
    description:
      'Meowth three ways in one set, a Delcatty and a Sneasel from the other. A theme nobody '
      + 'planned that both sets happen to have.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:144/128'), art(0, 1, 'e:139/128'), art(0, 2, 'e:141/128'),
      card(1, 0, 'e:113/128'), card(1, 1, 'e:089/128'), card(1, 2, 'c:5/109'),
      card(2, 0, 'c:25/111'), gap(2, 1, BONE, { colSpan: 2 }),
    ],
  },
  {
    title: 'Small Things',
    description:
      'Scraggy, Morpeko, Maushold, Hisuian Zorua. The Illustration Rares are at their best when the '
      + 'Pokemon is tiny and the world around it is not.',
    rows: 3, cols: 4,
    slots: [
      art(0, 0, 'e:140/128'), art(0, 1, 'e:135/128'), art(0, 2, 'e:146/128'), art(0, 3, 'e:145/128'),
      gap(1, 0, BONE, { colSpan: 4 }),
      card(2, 0, 'e:013/128'), card(2, 1, 'e:116/128'), card(2, 2, 'c:106/105'), card(2, 3, 'c:69/132'),
    ],
  },
  {
    title: 'Big Things',
    description:
      'Alolan Exeggutor, Lycanroc, Gholdengo, Salamence. The same trick in reverse, and the reason '
      + 'the art on these is worth a full pocket rather than a frame.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:129/128', { rowSpan: 2, colSpan: 1 }),
      art(0, 1, 'e:138/128', { colSpan: 2 }),
      art(1, 1, 'e:142/128'), card(1, 2, 'c:106/160'),
      art(2, 0, 'e:156/128', { colSpan: 2 }), card(2, 2, 'c:85/124'),
    ],
  },

  // ── the history half ───────────────────────────────────────────────────────
  {
    title: 'Thirty Years Of Cards',
    description:
      'The Classic Collection reprints thirty cards at their ORIGINAL numbers, so 4/102 is still '
      + 'Base Set and 94/102 is still Triumphant. The rest of this binder is that list, read as a '
      + 'history.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'c:4/102'), card(0, 1, 'c:149/147'), card(0, 2, 'c:94/102'),
      card(1, 0, 'c:11/113'), card(1, 1, 'c:106/106'), card(1, 2, 'c:101/101'),
      card(2, 0, 'c:41/122'), card(2, 1, 'c:33/181'), card(2, 2, 'c:123/172'),
    ],
  },
  {
    title: 'The First Generation',
    description:
      'Base Set, Gym and Neo. A Charizard, a Pikachu, two trainers people still argue about, and a '
      + 'Shining Celebi that was the hardest pull of its year.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'c:4/102'), card(0, 1, 'c:58/102'), card(0, 2, 'c:18/132'),
      card(1, 0, 'c:69/132'), card(1, 1, 'c:106/105'), card(1, 2, 'c:25/111'),
      card(2, 0, 'c:19/109'), card(2, 1, 'c:149/147'), card(2, 2, 'c:5/109'),
    ],
  },
  {
    title: 'The Trainers',
    description:
      'Misty, Erika and N. Supporter art is where this game has always been least careful and most '
      + 'interesting, and all three of these were a whole deck in their day.',
    rows: 3, cols: 3,
    slots: [
      gap(0, 0, BONE), card(0, 1, 'c:18/132'), gap(0, 2, BONE),
      card(1, 0, 'c:69/132'), gap(1, 1, BONE), card(1, 2, 'c:101/101'),
      card(2, 0, 'c:11/101'), card(2, 1, 'c:47/127'), card(2, 2, 'c:43/146'),
    ],
  },
  {
    title: 'Every Mechanic We Tried',
    description:
      'ex, LV.X, Prime, LEGEND, EX, BREAK, GX, V, VMAX, VSTAR. Ten ways of saying "this one is '
      + 'stronger", one per era, and the Classic Collection has nearly all of them.',
    rows: 3, cols: 4,
    slots: [
      card(0, 0, 'c:108/115'), card(0, 1, 'c:106/106'), card(0, 2, 'c:94/102'), card(0, 3, 'c:99/102'),
      card(1, 0, 'c:85/124'), card(1, 1, 'c:41/122'), card(1, 2, 'c:57/111'), card(1, 3, 'c:89/149'),
      card(2, 0, 'c:138/202'), card(2, 1, 'c:114/264'), card(2, 2, 'c:123/172'), card(2, 3, 'c:106/160'),
    ],
  },
  {
    title: 'The Delta Years',
    description:
      'Metagross as a Delta Species, a Scizor ex, a Genesect in Team Plasma livery. The eras when '
      + 'the game kept reskinning its own Pokemon, and the art got stranger for it.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'c:11/113', { rowSpan: 2, colSpan: 2 }),
      card(0, 2, 'c:108/115'), card(1, 2, 'c:11/101'),
      card(2, 0, 'c:19/109'), card(2, 1, 'c:47/127'), card(2, 2, 'c:5/109'),
    ],
  },
  {
    title: 'Legends, Literally',
    description:
      'Lugia from Aquapolis, Uxie, Palkia at LV.X, Arceus. The cards the game reaches for when it '
      + 'wants a page to feel like scripture.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'c:149/147'), card(0, 1, 'c:106/106'), card(0, 2, 'c:43/146'),
      card(1, 0, 'c:123/172'), card(1, 1, 'c:114/264'), card(1, 2, 'c:050/185'),
      gap(2, 0, MOSS, { colSpan: 3 }),
    ],
  },
  {
    title: 'Mitsuhiro Arita',
    description:
      'Base Set Charizard and Pikachu & Zekrom GX, twenty-two years apart, same hand. The Classic '
      + 'Collection is quietly a retrospective of a handful of illustrators.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'c:4/102', { rowSpan: 2, colSpan: 2 }),
      card(0, 2, 'c:33/181'), card(1, 2, 'c:108/115'),
      card(2, 0, 'c:11/113'), card(2, 1, 'c:99/102'), card(2, 2, 'c:100/102'),
    ],
  },

  // ── back to beauty ─────────────────────────────────────────────────────────
  {
    title: 'The Special Illustration Rares',
    description:
      'Six of the seven, given the space they were drawn for. A Special Illustration Rare in a '
      + 'frame is a card; in a full pocket it is a picture.',
    rows: 3, cols: 4,
    slots: [
      art(0, 0, 'e:147/128', { rowSpan: 2, colSpan: 2 }),
      art(0, 2, 'e:155/128'), art(0, 3, 'e:156/128'),
      art(1, 2, 'e:153/128'), art(1, 3, 'e:148/128'),
      art(2, 0, 'e:149/128', { colSpan: 2 }), art(2, 2, 'e:150/128', { colSpan: 2 }),
    ],
  },
  {
    title: 'Jirachi',
    description:
      'One card, one page. A wish Pokemon drawn against a sky, which is the sort of thing this set '
      + 'does when it stops trying to be a set.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:155/128', { rowSpan: 3, colSpan: 3 }),
    ],
  },
  {
    title: 'Colour',
    description:
      'Toxtricity, Morpeko, Gholdengo and Alolan Exeggutor. Grouped for nothing but their palette, '
      + 'which is a perfectly good reason to group cards.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:134/128'), art(0, 1, 'e:135/128'), art(0, 2, 'e:142/128'),
      art(1, 0, 'e:129/128', { colSpan: 2 }), card(1, 2, 'e:013/128'),
      card(2, 0, 'e:057/128'), card(2, 1, 'c:106/160'), card(2, 2, 'c:89/149'),
    ],
  },
  {
    title: 'Faces',
    description:
      'Scraggy, Hisuian Zorua, Alolan Meowth, Galarian Meowth. The Illustration Rares that are '
      + 'mostly an expression.',
    rows: 3, cols: 4,
    slots: [
      art(0, 0, 'e:140/128'), art(0, 1, 'e:145/128'), art(0, 2, 'e:139/128'), art(0, 3, 'e:141/128'),
      art(1, 0, 'e:144/128'), art(1, 1, 'e:146/128'), art(1, 2, 'e:136/128'), art(1, 3, 'e:137/128'),
      gap(2, 0, INK, { colSpan: 4 }),
    ],
  },
  {
    title: 'The Whole Point',
    description:
      'Lycanroc at dusk, Lapras on open water, Alolan Exeggutor against the sky. If you only ever '
      + 'see three cards from this set, these are a good three.',
    rows: 3, cols: 3,
    slots: [
      art(0, 0, 'e:138/128', { rowSpan: 2, colSpan: 2 }),
      art(0, 2, 'e:131/128'), art(1, 2, 'e:129/128'),
      art(2, 0, 'e:130/128'), art(2, 1, 'e:132/128'), art(2, 2, 'e:133/128'),
    ],
  },
  {
    title: 'Thirty Years, And Then Some',
    description:
      'Where it started and where it is now, on one page. Mew opened the first generation, Arceus '
      + 'closed a later one, and the mouse is still here.',
    rows: 3, cols: 3,
    slots: [
      card(0, 0, 'c:4/102'), art(0, 1, 'e:158/128', { rowSpan: 2, colSpan: 2 }),
      card(1, 0, 'c:123/172'),
      card(2, 0, 'e:149/128'), card(2, 1, 'e:157/128'), card(2, 2, 'c:114/264'),
    ],
  },
];

// ── build ────────────────────────────────────────────────────────────────────

function apiKey() {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    if (line.startsWith('EXPO_PUBLIC_CATALOG_API_KEY=')) return line.slice(line.indexOf('=') + 1).trim();
  }
  throw new Error('EXPO_PUBLIC_CATALOG_API_KEY missing from .env');
}

function die(message, code = 1) {
  console.error(`\nFAILED: ${message} (exit ${code})`);
  process.exit(code);
}

const KEY = apiKey();

async function loadSet(setId) {
  const res = await fetch(`${API}/cards?select=id,name,number,rarity&set_id=eq.${setId}&limit=200`, { headers: { apikey: KEY } });
  if (!res.ok) die(`catalog ${res.status} for set ${setId}`, 2);
  const rows = await res.json();
  return new Map(rows.map((c) => [String(c.number).trim(), c]));
}

console.log('Building the 30th-anniversary story binder');
const catalog = {};
for (const [prefix, setId] of Object.entries(SETS)) {
  catalog[prefix] = await loadSet(setId);
  console.log(`  ${prefix}: set ${setId}, ${catalog[prefix].size} cards`);
  await new Promise((r) => setTimeout(r, 900));
}

function resolve1(ref, where) {
  const [prefix, number] = [ref.slice(0, 1), ref.slice(2)];
  const found = catalog[prefix]?.get(number);
  if (!found) die(`${where}: no card ${number} in set ${SETS[prefix]} (ref ${ref})`, 3);
  return found;
}

const pages = PAGES.map((p, i) => {
  const seen = new Set();
  const slots = p.slots.map((s, j) => {
    const base = {
      id: `${BINDER_ID}_p${i}_s${j}`,
      row: s.row, col: s.col, rowSpan: s.rowSpan, colSpan: s.colSpan, type: s.type,
    };
    if (s.type === 'insert') return { ...base, insertColor: s.insertColor };
    const c = resolve1(s.ref, `page ${i + 1} "${p.title}"`);
    if (seen.has(s.ref)) die(`page ${i + 1} "${p.title}" uses ${s.ref} twice`, 4);
    seen.add(s.ref);
    return { ...base, cardId: c.id };
  });
  // A slot that runs off its page is invisible in the JSON and obvious on screen.
  for (const s of slots) {
    if (s.row + s.rowSpan > p.rows || s.col + s.colSpan > p.cols) {
      die(`page ${i + 1} "${p.title}": a slot at (${s.row},${s.col}) spills past ${p.rows}x${p.cols}`, 5);
    }
  }
  return { id: `${BINDER_ID}_p${i}`, title: p.title, description: p.description, rows: p.rows, cols: p.cols, slots };
});

const binder = {
  id: BINDER_ID,
  title: 'Thirty Years, Thirty Pages',
  description:
    'Both 30th anniversary sets read as one story: the artists who kept drawing the same Pokemon, '
    + 'the weather and the places the pictures actually show, and thirty years of the cards '
    + 'themselves, ending on the ones that are simply beautiful.',
  layoutStyle: 'themed_story',
  isExample: true,
  coverCardId: resolve1('e:158/128', 'cover').id,
  pages,
};

const cards = pages.reduce((n, p) => n + p.slots.filter((s) => s.cardId).length, 0);
const artSlots = pages.reduce((n, p) => n + p.slots.filter((s) => s.type === 'artwork').length, 0);
console.log(`  "${binder.title}": ${pages.length} pages, ${cards} cards, ${artSlots} artwork panels`);

writeFileSync(OUT, `${JSON.stringify([binder], null, 1)}\n`);
console.log(`\nWrote ${OUT}`);

/**
 * BUILD THE TWO 30TH-ANNIVERSARY STORY BINDERS in your own michi account.
 *
 * Run it with the wrapper, which is the only supported entry point:
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\story-binders\run-story-binders.ps1"
 *
 * WHAT IT MAKES. Two binders, each a cover leaf plus three nine-pocket chapters, thirty cards:
 *
 *   "Thirty Years, Thirty Cards"  - ME: 30th Celebration Classic Collection (set 24837), all 30,
 *                                   ordered as a chronology from Base Set to Scarlet & Violet.
 *   "Pikachu, By Many Hands"      - ME: 30th Celebration (set 24722), the 30 best of 61.
 *
 * WHY THE SELECTION IS HAND-MADE rather than planned by planStoryBinder. That planner scores cards
 * by their artwork tags, and these two sets are almost untagged: 10 of 61 cards in one and 0 of 30
 * in the other carry any scene tags today. Price is no help either (0 of 30 Classic Collection
 * cards are priced, and the other set's few prices are pre-release placeholders). So the ordering
 * below is editorial: era for the Classic Collection, and rarity plus illustrator for the other.
 * Re-run the planner instead once the captioning pass covers these sets.
 *
 * CARDS ARE NAMED BY COLLECTOR NUMBER, not by catalog id, and resolved against the live catalog at
 * run time. Ids are opaque and would rot; a number plus a set is checkable by eye against the card
 * in your hand, and the script fails loudly rather than silently skipping one it cannot find.
 *
 * SECRETS. Your michi email and password come from `story.secrets` beside this file (gitignored,
 * same shape as the persona kit's bots.secrets). They are read into variables and never printed.
 * Nothing else here needs a secret: the catalog is read with the public publishable key.
 *
 * Flags: --rebuild deletes any binder of the same title first. --public publishes them
 * (default: private). --dry-run resolves and prints the plan without writing anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const REBUILD = process.argv.includes('--rebuild');
const PUBLIC = process.argv.includes('--public');
const DRY = process.argv.includes('--dry-run');

const CATALOG = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';

// ── the two binders ──────────────────────────────────────────────────────────
// Each chapter is exactly nine collector numbers, read left to right, top to bottom on a 3x3 page.
// Two placements are deliberate and must not be re-sorted:
//   - Darkrai & Cresselia LEGEND is ONE picture split across two cards, so Top sits directly above
//     Bottom (centre column, rows 1 and 2).
//   - Articuno, Zapdos and Moltres share the top row of their page, as the trio.

const BINDERS = [
  {
    title: 'Thirty Years, Thirty Cards',
    description:
      'The Classic Collection read as a chronology: the cards that defined each era of the game, '
      + 'from the first generation to now.',
    setId: 24837,
    setName: 'ME: 30th Celebration Classic Collection',
    cover: { title: 'Thirty Years', numbers: ['4/102', '149/147', '123/172'] },
    chapters: [
      {
        title: '1999 to 2003 — The First Generation',
        numbers: ['58/102', '18/132', '69/132', '25/111', '106/105', '19/109', '5/109', '11/113', '108/115'],
      },
      {
        title: '2004 to 2012 — Mechanics and Myth',
        // centre column is the LEGEND: Top at (1,1), Bottom at (2,1).
        numbers: ['050/185', '106/106', '47/127', '43/146', '99/102', '94/102', '101/101', '100/102', '11/101'],
      },
      {
        title: '2013 to Now — The Modern Game',
        numbers: ['85/124', '106/160', '41/122', '57/111', '89/149', '33/181', '138/202', '114/264', '203/193'],
      },
    ],
  },
  {
    title: 'Pikachu, By Many Hands',
    description:
      'Thirty from the 30th Celebration: the chase cards, the Pikachu gallery where every card is a '
      + 'different illustrator, and the Illustration Rares worth slowing down for.',
    setId: 24722,
    setName: 'ME: 30th Celebration',
    cover: { title: 'The 30th Celebration', numbers: ['158/128', '149/128', '157/128'] },
    chapters: [
      {
        title: 'The Chase',
        numbers: ['150/128', '148/128', '153/128', '155/128', '156/128', '147/128', '070/128', '092/128', '054/128'],
      },
      {
        title: 'Pikachu, by many hands',
        // Ken Sugimori and Atsuko Nishida lead: the man who drew the originals, and the artist who
        // designed Pikachu in the first place.
        numbers: ['023/128', '047/128', '032/128', '042/128', '028/128', '033/128', '026/128', '025/128', '030/128'],
      },
      {
        title: 'Worth Slowing Down For',
        // top row is the legendary bird trio, in their original order.
        numbers: ['132/128', '133/128', '130/128', '131/128', '136/128', '138/128', '144/128', '139/128', '145/128'],
      },
    ],
  },
];

const ROWS = 3;
const COLS = 3;

// ── env + secrets ────────────────────────────────────────────────────────────

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    out[line.slice(0, line.indexOf('=')).trim()] = line.slice(line.indexOf('=') + 1).trim();
  }
  return out;
}

function fail(step, message, code = 1) {
  console.error(`\nFAILED: ${step} — ${message} (exit ${code})`);
  process.exit(code);
}

const env = readEnvFile(path.join(ROOT, '.env'));
const APP_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const APP_KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const CATALOG_KEY = env.EXPO_PUBLIC_CATALOG_API_KEY;
if (!APP_URL || !APP_KEY) fail('read .env', 'EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY missing');
if (!CATALOG_KEY) fail('read .env', 'EXPO_PUBLIC_CATALOG_API_KEY missing');

const secrets = readEnvFile(path.join(HERE, 'story.secrets'));
const EMAIL = secrets.MICHI_EMAIL;
const PASSWORD = secrets.MICHI_PASSWORD;
if (!DRY && (!EMAIL || !PASSWORD)) {
  fail(
    'read story.secrets',
    'put MICHI_EMAIL and MICHI_PASSWORD in state/story-binders/story.secrets (see story.secrets.example)',
  );
}

// ── tiny HTTP helper ─────────────────────────────────────────────────────────

async function api(base, pathname, { method = 'GET', token, body, headers = {}, key } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      apikey: key ?? APP_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { ok: res.ok, status: res.status, text, json };
}

// ── step 1: resolve every collector number to a catalog card ─────────────────

async function resolveSet(binder) {
  const r = await api(CATALOG, `/cards?select=id,name,number,rarity,illustrator&set_id=eq.${binder.setId}&limit=200`, {
    key: CATALOG_KEY,
  });
  if (!r.ok) fail(`resolve ${binder.setName}`, `catalog returned ${r.status} ${r.text.slice(0, 120)}`, 2);
  const byNumber = new Map(r.json.map((c) => [String(c.number).trim(), c]));
  const wanted = [binder.cover.numbers, ...binder.chapters.map((c) => c.numbers)].flat();
  const missing = wanted.filter((n) => !byNumber.has(n));
  if (missing.length) {
    fail(`resolve ${binder.setName}`, `${missing.length} card number(s) not in the set: ${missing.join(', ')}`, 3);
  }
  const seen = new Set();
  for (const n of wanted) {
    if (seen.has(n)) fail(`resolve ${binder.setName}`, `card ${n} is listed twice`, 4);
    seen.add(n);
  }
  console.log(`  resolved ${wanted.length}/30 cards from ${binder.setName} (${r.json.length} in the set)`);
  return byNumber;
}

// ── step 2: build the rows ───────────────────────────────────────────────────

function pagesFor(binder, byNumber) {
  const pages = [];
  const slotsFor = (numbers, pageId) =>
    numbers.map((n, i) => ({
      id: randomUUID(),
      page_id: pageId,
      row_index: Math.floor(i / COLS),
      col_index: i % COLS,
      row_span: 1,
      col_span: 1,
      slot_type: 'card',
      card_id: byNumber.get(n).id,
      insert_image_url: null,
      notes: null,
      image_url: null,
      image_crop: null,
      image_fit: null,
      image_transform: null,
      image_attribution: null,
      from_collection: null,
      source_entry_id: null,
      finish: null,
    }));

  // Page 0 is the cover leaf: three heroes across the middle row, so the binder opens on one page.
  const coverId = randomUUID();
  pages.push({
    page: { id: coverId, title: binder.cover.title, notes: null, rows: ROWS, cols: COLS },
    slots: binder.cover.numbers.map((n, i) => ({
      ...slotsFor([n], coverId)[0],
      row_index: 1,
      col_index: i,
    })),
  });

  for (const ch of binder.chapters) {
    const id = randomUUID();
    pages.push({ page: { id, title: ch.title, notes: null, rows: ROWS, cols: COLS }, slots: slotsFor(ch.numbers, id) });
  }
  return pages;
}

// ── step 3: write ────────────────────────────────────────────────────────────

const rep = { Prefer: 'return=representation' };

async function signIn() {
  const r = await api(APP_URL, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!r.ok || !r.json?.access_token) {
    fail('sign in', `the app project refused the credentials in story.secrets (${r.status})`, 5);
  }
  return { token: r.json.access_token, uid: r.json.user.id };
}

async function removeExisting(token, uid, title) {
  const list = await api(APP_URL, `/rest/v1/binders?owner_id=eq.${uid}&title=eq.${encodeURIComponent(title)}&select=id`, { token });
  if (!list.ok) fail('list binders', `${list.status} ${list.text.slice(0, 120)}`, 6);
  for (const b of list.json ?? []) {
    const del = await api(APP_URL, `/rest/v1/binders?id=eq.${b.id}`, { method: 'DELETE', token });
    if (!del.ok) fail('delete binder', `${del.status} ${del.text.slice(0, 120)}`, 7);
    console.log(`  removed the previous "${title}"`);
  }
}

async function write(binder, byNumber, token, uid) {
  if (REBUILD) await removeExisting(token, uid, binder.title);
  const pages = pagesFor(binder, byNumber);
  const binderId = randomUUID();
  const hero = byNumber.get(binder.cover.numbers[0]).id;

  const ins = await api(APP_URL, '/rest/v1/binders', {
    method: 'POST', token, headers: rep,
    body: {
      id: binderId,
      title: binder.title,
      description: binder.description,
      layout_style: 'themed_story',
      cover_card_id: hero,
      is_public: PUBLIC,
      is_demo: false,
    },
  });
  if (!ins.ok) fail('insert binder', `${ins.status} ${ins.text.slice(0, 200)}`, 8);

  const pg = await api(APP_URL, '/rest/v1/binder_pages', {
    method: 'POST', token, headers: rep,
    body: pages.map((p, i) => ({
      id: p.page.id, binder_id: binderId, position: i, title: p.page.title, notes: p.page.notes,
      rows: p.page.rows, cols: p.page.cols, background_color: null, is_public: true,
    })),
  });
  if (!pg.ok) fail('insert pages', `${pg.status} ${pg.text.slice(0, 200)}`, 9);

  const slots = pages.flatMap((p) => p.slots);
  const sl = await api(APP_URL, '/rest/v1/binder_slots', { method: 'POST', token, headers: rep, body: slots });
  if (!sl.ok) fail('insert slots', `${sl.status} ${sl.text.slice(0, 200)}`, 10);

  console.log(`  built "${binder.title}": ${pages.length} pages, ${slots.length} cards${PUBLIC ? ', public' : ', private'}`);
}

// ── run ──────────────────────────────────────────────────────────────────────

console.log('Story binders: 30th Celebration + Classic Collection');
console.log(`Mode: ${DRY ? 'DRY RUN (nothing will be written)' : PUBLIC ? 'public' : 'private'}${REBUILD ? ', rebuild' : ''}`);

console.log('\nStep 1/3  resolving cards against the live catalog');
const resolved = [];
for (const b of BINDERS) resolved.push([b, await resolveSet(b)]);

if (DRY) {
  console.log('\nStep 2/3  the plan');
  for (const [b, byNumber] of resolved) {
    console.log(`\n  ${b.title}  (${b.setName})`);
    console.log(`    cover: ${b.cover.numbers.map((n) => byNumber.get(n).name).join(' / ')}`);
    for (const ch of b.chapters) {
      console.log(`    ${ch.title}`);
      for (let i = 0; i < ch.numbers.length; i += COLS) {
        const row = ch.numbers.slice(i, i + COLS).map((n) => {
          const c = byNumber.get(n);
          return `${c.name}${c.illustrator ? ` (${c.illustrator})` : ''}`;
        });
        console.log(`      ${row.join('  |  ')}`);
      }
    }
  }
  console.log('\nStep 3/3  skipped, this was a dry run. Re-run without --dry-run to build.');
  process.exit(0);
}

console.log('\nStep 2/3  signing in');
const { token, uid } = await signIn();
console.log(`  signed in as ${uid.slice(0, 8)}…`);

console.log('\nStep 3/3  writing the binders');
for (const [b, byNumber] of resolved) await write(b, byNumber, token, uid);

console.log('\nDone. Both binders are in My Binders.');

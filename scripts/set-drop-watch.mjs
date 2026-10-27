// @ts-nocheck
/**
 * SET DROP WATCH (owner, 2026-10-27): tell me the morning a set's cards land, for every game.
 *
 * The data server's daily lane finds new TCGPlayer cards and publishes them by 05:30, so the
 * first day a set's images exist on TCGPlayer is the first day its rows exist in the catalogue.
 * That is the hook docs/SET-DROP.md is built on: binder content for a set the same morning,
 * before anyone has opened a pack. This script is the alarm. It compares every set's card count
 * with the last run (state/set-drop.json, gitignored) and prints what changed:
 *
 *   NEW SET        a set id not seen before, with how many cards and pictures it has
 *   IMAGES LANDED  a known set whose pictured cards crossed the posting threshold
 *   GREW           a known set with more cards than last time (a reveal in progress)
 *
 * and, for each, the next actions: how to build it, and (Pokémon) a SET_CONFIGS stub for the
 * release-binder builder. Nothing is written anywhere but the state file.
 *
 * POKÉMON is read from the public `sets` and `cards` tables with the publishable key (the same
 * read scripts/build-release-binders.mjs does). Image urls are not readable with that key and
 * `sets.release_date` is empty, so a card "has a picture" when the lite images.json manifest the
 * app renders from lists its id, and dates come from the cards.
 *
 * EVERY OTHER PUBLISHED GAME (One Piece, Lorcana, Riftbound, Digimon, Magic, ...) is read from
 * its public browse bundle, `browse/<prefix>/catalog.json` + `images.json`, the same files the
 * app's card picker reads. The list of games is parsed out of src/lib/otherGameKeys.ts so a game
 * published there is watched here with no further change. Their tables are not readable with
 * the publishable key, and do not need to be.
 *
 * On the first run every set is unknown; it remembers them all quietly and reports only the sets
 * whose cards were released in the last --days (default 45).
 *
 *   node scripts/set-drop-watch.mjs            report and remember
 *   node scripts/set-drop-watch.mjs --dry      report, remember nothing
 *   node scripts/set-drop-watch.mjs --json     machine-readable, for a scheduled task or a studio
 *
 * Schedule it after the data lane (06:00 is safe): scripts/set-drop-watch.ps1 registers the task.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STATE = join(ROOT, 'state', 'set-drop.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DRY = flag('--dry');
const JSON_OUT = flag('--json');
const DAYS_BACK = Number(opt('--days', 45));
/** A set is postable once this many of its cards have a picture, or this share of them. */
const POST_MIN_IMAGES = 20;
const POST_MIN_SHARE = 0.5;

// ---- env (names only; values stay in .env) ------------------------------------------------
function readEnv() {
  const env = { ...process.env };
  const p = join(ROOT, '.env');
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
  return env;
}
const env = readEnv();
const API_KEY = env.EXPO_PUBLIC_CATALOG_API_KEY;
const BROWSE = env.EXPO_PUBLIC_CATALOG_BROWSE_URL;
if (!API_KEY || !BROWSE) {
  console.error('FAILED: EXPO_PUBLIC_CATALOG_API_KEY and EXPO_PUBLIC_CATALOG_BROWSE_URL are needed (.env).');
  process.exit(2);
}
const API = `${new URL(BROWSE).origin}/rest/v1`;

async function rest(path) {
  const res = await fetch(`${API}/${path}`, { headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` } });
  if (!res.ok) throw new Error(`${path.split('?')[0]} ${res.status}: ${await res.text()}`);
  return res.json();
}
async function publicJson(path) {
  const res = await fetch(`${BROWSE}/${path}`);
  if (!res.ok) return null;
  return res.json();
}

const today = new Date();
const day = today.toISOString().slice(0, 10);
const since = new Date(today.getTime() - DAYS_BACK * 86400e3).toISOString().slice(0, 10);

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { seen: {}, ran: null };
const firstRun = !prev.ran;
const next = { seen: {}, ran: today.toISOString() };
const events = [];
const isPostable = (c) => c.pictured >= POST_MIN_IMAGES || (c.cards > 0 && c.pictured / c.cards >= POST_MIN_SHARE);

/**
 * One set through the memory: decides whether it is worth a census, takes it, records the event.
 * `key` is how the set is remembered (Pokémon by id, other games by prefix:id).
 */
async function consider({ key, game, id, name, code, series, card_count, recentRelease, census, actions }) {
  const before = prev.seen[key];
  const changed = !before || before.card_count !== card_count;
  const recent = !!recentRelease;
  const interesting = firstRun ? recent : changed || (recent && !isPostable(before));
  if (!interesting) {
    next.seen[key] = before ?? { game, name, card_count, cards: 0, pictured: 0, at: day };
    return;
  }
  const c = await census();
  const row = { game, id, name, code, series, release: c.release ?? recentRelease ?? null, ...c, postable: isPostable(c), actions };
  if (!before) {
    if (!firstRun || row.postable) events.push({ kind: firstRun ? 'RECENT SET' : 'NEW SET', ...row });
  } else if (row.postable && !isPostable(before)) events.push({ kind: 'IMAGES LANDED', ...row, before });
  else if (c.cards > before.cards) events.push({ kind: 'GREW', ...row, before });
  next.seen[key] = { game, name, card_count, cards: c.cards, pictured: c.pictured, at: day };
}

const plain = (name) => name.replace(/^[A-Z0-9]+:\s*/, '').replace(/^(SM|XY|SWSH|SV|ME)\s+-\s+/, '');
const slug = (name) => plain(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const BULK = new Set(['Common', 'Uncommon', 'Rare', 'None', '']);

// ---- Pokémon: the tables ---------------------------------------------------------------------
{
  const sets = await rest('sets?select=id,name,code,series,card_count&order=id.desc&limit=2000');
  const recentRows = await rest(`cards?select=set_id,release_date&release_date=gte.${since}&limit=5000`);
  const recentSets = new Map();
  for (const r of recentRows) if (r.release_date > (recentSets.get(r.set_id) ?? '')) recentSets.set(r.set_id, r.release_date);
  let manifestIds = null;
  try {
    const m = await publicJson('images.json');
    if (m && m.cards) manifestIds = new Set(Object.keys(m.cards));
  } catch {
    manifestIds = null; // fall back to browse_visible
  }
  for (const s of sets) {
    await consider({
      key: String(s.id),
      game: 'Pokémon',
      id: s.id,
      name: s.name,
      code: s.code,
      series: s.series,
      card_count: s.card_count,
      recentRelease: recentSets.get(s.id) ?? null,
      census: async () => {
        const rows = await rest(`cards?set_id=eq.${s.id}&select=id,rarity,language,release_date,browse_visible&limit=2000`);
        const en = rows.filter((r) => !r.language || r.language === 'en');
        return {
          cards: en.length,
          pictured: en.filter((r) => (manifestIds ? manifestIds.has(String(r.id)) : r.browse_visible)).length,
          hits: en.filter((r) => !BULK.has(r.rarity ?? '')).length,
          release: en.map((r) => r.release_date).filter(Boolean).sort().pop() ?? null,
        };
      },
      actions: (e) => [
        `Collect:  michi-maker.com/collect, Complete set, search "${plain(e.name)}", Curated, Art window black, Make it a binder`,
        `Builder:  add to SET_CONFIGS in scripts/build-release-binders.mjs, then node scripts/build-release-binders.mjs`,
        `          { setId: ${e.id}, authored: '${day}', keyPrefix: '${slug(e.name)}', chase: { title: '${plain(e.name)}: Chase Board', description: '', layoutStyle: 'anchor' }, bulk: { title: '${plain(e.name)}: Beautiful Bulk', description: '', layoutStyle: 'color_theme' }, storyNames: [], partnerName: '', extraStoryName: '', starTypes: [] }`,
        `Post:     docs/SET-DROP.md, "The day-one run" (${e.hits} hits, ${e.pictured} of ${e.cards} cards pictured)`,
      ],
    });
  }
}

// ---- every other published game: its browse bundle ------------------------------------------
function publishedGames() {
  // src/lib/otherGameKeys.ts is the source of truth: `key: { label: '...', prefix: '...', published: true }`.
  const src = readFileSync(join(ROOT, 'src', 'lib', 'otherGameKeys.ts'), 'utf8');
  const games = [];
  for (const m of src.matchAll(/(\w+):\s*\{\s*label:\s*'([^']+)',\s*prefix:\s*'([^']+)',\s*published:\s*(true|false)/g)) {
    if (m[4] === 'true') games.push({ key: m[1], label: m[2], prefix: m[3] });
  }
  return games;
}
const skipped = [];
for (const g of publishedGames()) {
  let catalog, images;
  try {
    [catalog, images] = await Promise.all([publicJson(`${g.prefix}/catalog.json`), publicJson(`${g.prefix}/images.json`)]);
  } catch {
    catalog = null;
  }
  if (!catalog || !catalog.sets || !catalog.cards) {
    skipped.push(g.label);
    continue;
  }
  const pictured = new Set(Object.keys(images?.cards ?? {}));
  const bySet = new Map();
  for (const c of Object.values(catalog.cards)) {
    if (c.language && c.language !== 'en') continue;
    const list = bySet.get(String(c.set_id)) ?? [];
    list.push(c);
    bySet.set(String(c.set_id), list);
  }
  for (const s of Object.values(catalog.sets)) {
    const cards = bySet.get(String(s.id)) ?? [];
    const latest = cards.map((c) => c.release_date).filter(Boolean).sort().pop() ?? null;
    await consider({
      key: `${g.prefix}:${s.id}`,
      game: g.label,
      id: s.id,
      name: s.name,
      code: s.code,
      series: s.series,
      card_count: cards.length,
      recentRelease: latest && latest >= since ? latest : null,
      census: async () => ({
        cards: cards.length,
        pictured: cards.filter((c) => pictured.has(String(c.id))).length,
        hits: 0,
        release: latest,
      }),
      actions: (e) => [
        `Picker:   a new binder, add cards, game ${e.game}, set "${e.name}"; lay it out, make it public`,
        `Post:     docs/SET-DROP.md, "The day-one run" (${e.pictured} of ${e.cards} cards pictured; no Collect for this game yet)`,
      ],
    });
  }
}

// ---- report ---------------------------------------------------------------------------------
const seenCount = Object.keys(next.seen).length;
if (JSON_OUT) {
  console.log(JSON.stringify({ ran: next.ran, firstRun, events: events.map(({ actions, ...e }) => e), sets: seenCount, skipped }, null, 2));
} else {
  console.log(`set-drop-watch ${day}: ${seenCount} sets across the games, ${events.length} to report${firstRun ? ' (first run: remembering every set, reporting the recent ones)' : `, last run ${prev.ran.slice(0, 10)}`}${skipped.length ? `; no bundle yet for ${skipped.join(', ')}` : ''}`);
  for (const e of events) {
    const delta = e.before ? ` (was ${e.before.cards} cards, ${e.before.pictured} pictured)` : '';
    const hits = e.hits ? `, ${e.hits} hits` : '';
    console.log(`\n${e.kind} (${e.game}): ${e.name} [${e.id}]${e.release ? `, released ${e.release}` : ''}. ${e.cards} cards, ${e.pictured} pictured${hits}${delta}. ${e.postable ? 'POSTABLE.' : 'Not postable yet.'}`);
    if (e.postable && e.kind !== 'GREW') for (const a of e.actions(e)) console.log(`  ${a}`);
  }
  if (!events.length) console.log('Nothing new. Every set is as it was.');
}

if (!DRY) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(next, null, 2));
}

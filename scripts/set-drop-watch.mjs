// @ts-nocheck
/**
 * SET DROP WATCH (owner, 2026-10-27): tell me the morning a set's cards land.
 *
 * The data server's daily lane finds new TCGPlayer cards and publishes them by 05:30, so the
 * first day a set's images exist on TCGPlayer is the first day its rows exist in `cards`. That is
 * the hook docs/SET-DROP.md is built on: binder content for a set the same morning, before anyone
 * has opened a pack. This script is the alarm. It reads the public `sets` and `cards` tables with
 * the publishable key (the same read scripts/build-release-binders.mjs does), compares every set's
 * card count with the last run (state/set-drop.json, gitignored) and prints what changed:
 *
 *   NEW SET        a set id not seen before, with how many cards and pictures it has
 *   IMAGES LANDED  a known set whose pictured cards crossed the posting threshold
 *   GREW           a known set with more cards than last time (a reveal in progress)
 *
 * and, for each, the next actions: how to build it on Collect, and a SET_CONFIGS stub for the
 * release-binder builder. Nothing is written anywhere but the state file.
 *
 * `sets.release_date` is empty on the server (2026-10-27), so dates come from the cards. On the
 * first run every set is unknown; it remembers them all quietly and reports only the sets whose
 * cards were released in the last --days (default 45).
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

const today = new Date();
const day = today.toISOString().slice(0, 10);
const since = new Date(today.getTime() - DAYS_BACK * 86400e3).toISOString().slice(0, 10);

// ---- every set's card count, and the sets with recent cards --------------------------------
const sets = await rest('sets?select=id,name,code,series,card_count&order=id.desc&limit=2000');
const recentRows = await rest(`cards?select=set_id,release_date&release_date=gte.${since}&limit=5000`);
const recentSets = new Map();
for (const r of recentRows) recentSets.set(r.set_id, r.release_date > (recentSets.get(r.set_id) ?? '') ? r.release_date : recentSets.get(r.set_id));

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { seen: {}, ran: null };
const firstRun = !prev.ran;
const next = { seen: {}, ran: today.toISOString() };

// Image urls are not readable with the publishable key (the view grants no such column), so a
// card "has a picture" when the lite images.json manifest the app renders from lists its id.
let manifestIds = null;
try {
  const m = await (await fetch(`${BROWSE}/images.json`)).json();
  if (m && m.cards) manifestIds = new Set(Object.keys(m.cards));
} catch {
  manifestIds = null; // fall back to browse_visible below
}

/** Cards and pictures of one set, in one thin request. */
async function census(setId) {
  const rows = await rest(`cards?set_id=eq.${setId}&select=id,rarity,language,release_date,browse_visible&limit=2000`);
  const en = rows.filter((r) => !r.language || r.language === 'en');
  const pictured = en.filter((r) => (manifestIds ? manifestIds.has(String(r.id)) : r.browse_visible));
  const hits = en.filter((r) => !['Common', 'Uncommon', 'Rare', 'None', ''].includes(r.rarity ?? ''));
  const release = en.map((r) => r.release_date).filter(Boolean).sort().pop() ?? null;
  return { cards: en.length, pictured: pictured.length, hits: hits.length, release };
}
const isPostable = (c) => c.pictured >= POST_MIN_IMAGES || (c.cards > 0 && c.pictured / c.cards >= POST_MIN_SHARE);

const events = [];
for (const s of sets) {
  const before = prev.seen[s.id];
  const changed = !before || before.card_count !== s.card_count;
  const interesting = firstRun ? recentSets.has(s.id) : changed || (recentSets.has(s.id) && !isPostable(before));
  if (!interesting) {
    next.seen[s.id] = before ?? { name: s.name, card_count: s.card_count, cards: 0, pictured: 0, at: day };
    continue;
  }
  const c = await census(s.id);
  const row = { id: s.id, name: s.name, code: s.code, series: s.series, release: c.release ?? recentSets.get(s.id) ?? null, ...c, postable: isPostable(c) };
  if (!before) {
    if (!firstRun || row.postable) events.push({ kind: firstRun ? 'RECENT SET' : 'NEW SET', ...row });
  } else if (row.postable && !isPostable(before)) events.push({ kind: 'IMAGES LANDED', ...row, before });
  else if (c.cards > before.cards) events.push({ kind: 'GREW', ...row, before });
  next.seen[s.id] = { name: s.name, card_count: s.card_count, cards: c.cards, pictured: c.pictured, at: day };
}

// ---- report ---------------------------------------------------------------------------------
const plain = (name) => name.replace(/^[A-Z0-9]+:\s*/, '').replace(/^(SM|XY|SWSH|SV|ME)\s+-\s+/, '');
const slug = (name) => plain(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const actions = (e) => [
  `Collect:  michi-maker.com/collect, Complete set, search "${plain(e.name)}", Curated, Art window black, Make it a binder`,
  `Builder:  add to SET_CONFIGS in scripts/build-release-binders.mjs, then node scripts/build-release-binders.mjs`,
  `          { setId: ${e.id}, authored: '${day}', keyPrefix: '${slug(e.name)}', chase: { title: '${plain(e.name)}: Chase Board', description: '', layoutStyle: 'anchor' }, bulk: { title: '${plain(e.name)}: Beautiful Bulk', description: '', layoutStyle: 'color_theme' }, storyNames: [], partnerName: '', extraStoryName: '', starTypes: [] }`,
  `Post:     docs/SET-DROP.md, "The day-one run" (${e.hits} hits, ${e.pictured} of ${e.cards} cards pictured)`,
];

if (JSON_OUT) {
  console.log(JSON.stringify({ ran: next.ran, firstRun, events, sets: sets.length }, null, 2));
} else {
  console.log(`set-drop-watch ${day}: ${sets.length} sets, ${events.length} to report${firstRun ? ' (first run: remembering every set, reporting the recent ones)' : `, last run ${prev.ran.slice(0, 10)}`}`);
  for (const e of events) {
    const delta = e.before ? ` (was ${e.before.cards} cards, ${e.before.pictured} pictured)` : '';
    console.log(`\n${e.kind}: ${e.name} [${e.id}]${e.release ? `, released ${e.release}` : ''}. ${e.cards} cards, ${e.pictured} pictured, ${e.hits} hits${delta}. ${e.postable ? 'POSTABLE.' : 'Not postable yet.'}`);
    if (e.postable && e.kind !== 'GREW') for (const a of actions(e)) console.log(`  ${a}`);
  }
  if (!events.length) console.log('Nothing new. Every set is as it was.');
}

if (!DRY) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(next, null, 2));
}

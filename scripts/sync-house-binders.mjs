// @ts-nocheck
/**
 * Sync the @michimaker house account with the bundled example binders, and prune what no longer
 * earns its place in Discover's "From Michi-Maker" shelf.
 *
 *   node scripts/sync-house-binders.mjs                 # dry run, writes nothing
 *   node scripts/sync-house-binders.mjs --apply         # publish new + refresh stale
 *   node scripts/sync-house-binders.mjs --apply --prune # also delete the binders listed in PRUNE
 *
 * WHY THIS EXISTS. Those twenty binders were placed by hand on 2026-08-27 and nothing has kept them
 * in step since, so the shelf drifted: "Every Last Card" is one page there and eighteen in the app,
 * "Chase Board" is two and eight. Half of what looks like a thin-binder problem is actually a stale
 * copy of a binder that has since grown. So this SYNCS first and prunes second, and the prune list
 * is short because two of the obvious candidates fix themselves.
 *
 * IT IS DELIBERATELY NOT CLEVER. It matches on title, because that is the only stable key between a
 * bundled binder (`anniv-thirty-years`) and a published row (a uuid), and it refuses to act on an
 * ambiguous title rather than guessing. A refresh REPLACES a binder's pages and slots; it does not
 * try to diff them.
 *
 * CREDENTIALS. The house account's own login, from `house.secrets` beside this file (gitignored):
 *   MICHI_EMAIL=...
 *   MICHI_PASSWORD=...
 * Read into variables and never printed. The catalog is not touched; card ids travel as they are.
 */
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const APPLY = process.argv.includes('--apply');
const PRUNE = process.argv.includes('--prune');

/**
 * TO DELETE, and why each one. Every entry is two pages or fewer AFTER the sync, so nothing here is
 * a binder that merely looks thin because its published copy is out of date.
 */
const PRUNE_TITLES = [
  'Prismatic Evolutions: Common to Hyper', // 1 page, 8 cards; already retired from the app bundle
  '30th Celebration: Anniversary Showcase', // 2 pages; retired, and the story binder does its job
  'The Grail Wall', // 2 pages, a list rather than a binder
  '1999 vs Now: Grail Face-Off', // 2 pages, the same idea as Same Art, Different Set, done thinner
  'The Support Cast', // 2 pages, a rarity dump with no argument
];

/** Bundled modules whose binders belong on the house account. */
const SOURCES = ['anniversaryBinders', 'showcaseBinders', 'releaseBinders', 'generatedBinders'];

function die(step, message, code = 1) {
  console.error(`\nFAILED: ${step} — ${message} (exit ${code})`);
  process.exit(code);
}

function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    out[line.slice(0, line.indexOf('=')).trim()] = line.slice(line.indexOf('=') + 1).trim();
  }
  return out;
}

const env = readEnvFile(join(ROOT, '.env'));
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) die('read .env', 'EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY missing');

const secrets = readEnvFile(join(HERE, 'house.secrets'));
const EMAIL = secrets.MICHI_EMAIL;
const PASSWORD = secrets.MICHI_PASSWORD;

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: KEY,
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

// ── what the app ships ───────────────────────────────────────────────────────
const bundled = [];
for (const name of SOURCES) {
  const file = join(ROOT, 'src', 'data', `${name}.json`);
  if (!existsSync(file)) continue;
  for (const b of JSON.parse(readFileSync(file, 'utf8'))) bundled.push(b);
}
const byTitle = new Map();
for (const b of bundled) {
  if (byTitle.has(b.title)) die('read bundle', `two bundled binders share the title "${b.title}"`, 2);
  byTitle.set(b.title, b);
}
console.log(`Bundled example binders: ${bundled.length}`);

// ── what the house account holds ─────────────────────────────────────────────
const prof = await api('/rest/v1/profiles?username=eq.michimaker&select=id');
if (!prof.ok || !prof.json?.length) die('find @michimaker', `profile not visible (${prof.status})`, 3);
const HOUSE_ID = prof.json[0].id;

const liveRes = await api(`/rest/v1/binders?owner_id=eq.${HOUSE_ID}&select=id,title,is_public,binder_pages(id)`);
if (!liveRes.ok) die('list house binders', `${liveRes.status} ${liveRes.text.slice(0, 120)}`, 4);
const live = liveRes.json.map((b) => ({ id: b.id, title: b.title, pages: (b.binder_pages || []).length }));
console.log(`Published on @michimaker: ${live.length}\n`);

const liveByTitle = new Map();
for (const b of live) {
  if (liveByTitle.has(b.title)) die('read house', `two published binders share the title "${b.title}"`, 5);
  liveByTitle.set(b.title, b);
}

// ── the plan ─────────────────────────────────────────────────────────────────
const toPublish = [];
const toRefresh = [];
for (const [title, b] of byTitle) {
  const there = liveByTitle.get(title);
  if (!there) toPublish.push(b);
  else if (there.pages !== (b.pages || []).length) toRefresh.push({ bundled: b, live: there });
}
const toPrune = PRUNE_TITLES.map((t) => liveByTitle.get(t)).filter(Boolean);
const pruneMissing = PRUNE_TITLES.filter((t) => !liveByTitle.has(t));

console.log('PUBLISH (bundled, not on the account):');
for (const b of toPublish) console.log(`   + ${b.title}  (${(b.pages || []).length}p)`);
console.log('\nREFRESH (published copy has drifted):');
for (const r of toRefresh) console.log(`   ~ ${r.bundled.title}  ${r.live.pages}p -> ${(r.bundled.pages || []).length}p`);
console.log(`\nPRUNE (${PRUNE ? 'will delete' : 'listed only, pass --prune'}):`);
for (const b of toPrune) console.log(`   - ${b.title}  (${b.pages}p)  ${b.id.slice(0, 8)}`);
for (const t of pruneMissing) console.log(`   ? ${t}  already gone`);

if (!APPLY) {
  console.log('\nDry run. Nothing was written. Re-run with --apply (and --prune to delete).');
  process.exit(0);
}
if (!EMAIL || !PASSWORD) {
  die('read house.secrets', 'put MICHI_EMAIL and MICHI_PASSWORD for @michimaker in scripts/house.secrets', 6);
}

// ── write ────────────────────────────────────────────────────────────────────
const signIn = await api('/auth/v1/token?grant_type=password', {
  method: 'POST',
  body: { email: EMAIL, password: PASSWORD },
});
if (!signIn.ok || !signIn.json?.access_token) die('sign in', `credentials refused (${signIn.status})`, 7);
const token = signIn.json.access_token;
if (signIn.json.user.id !== HOUSE_ID) {
  die('sign in', 'those credentials are not @michimaker; refusing to write to the wrong account', 8);
}
const rep = { Prefer: 'return=representation' };

/** Pages and slots for a bundled binder, under a fresh binder id. */
function rowsFor(binder, binderId) {
  const pages = (binder.pages || []).map((p, i) => ({
    id: randomUUID(),
    binder_id: binderId,
    position: i,
    title: p.title ?? null,
    notes: p.description ?? null,
    rows: p.rows,
    cols: p.cols,
    background_color: p.backgroundColor ?? null,
    is_public: true,
    _slots: p.slots || [],
  }));
  const slots = pages.flatMap((p) =>
    p._slots.map((s) => ({
      id: randomUUID(),
      page_id: p.id,
      row_index: s.row,
      col_index: s.col,
      row_span: s.rowSpan ?? 1,
      col_span: s.colSpan ?? 1,
      slot_type: s.type,
      card_id: s.cardId ?? null,
      insert_image_url: s.insertColor ?? null,
      image_url: s.imageUrl ?? null,
      image_crop: s.imageCrop ?? null,
      notes: null,
      image_fit: null,
      image_transform: null,
      image_attribution: null,
      from_collection: null,
      source_entry_id: null,
      finish: null,
    })),
  );
  return { pages: pages.map(({ _slots, ...p }) => p), slots };
}

async function publish(binder, existingId) {
  const binderId = existingId ?? randomUUID();
  if (existingId) {
    const del = await api(`/rest/v1/binder_pages?binder_id=eq.${binderId}`, { method: 'DELETE', token });
    if (!del.ok) die('clear pages', `${del.status} ${del.text.slice(0, 120)}`, 9);
  } else {
    const ins = await api('/rest/v1/binders', {
      method: 'POST', token, headers: rep,
      body: {
        id: binderId, title: binder.title, description: binder.description ?? null,
        layout_style: binder.layoutStyle ?? 'freeform', cover_card_id: binder.coverCardId ?? null,
        is_public: true, is_demo: false,
      },
    });
    if (!ins.ok) die('insert binder', `${ins.status} ${ins.text.slice(0, 160)}`, 10);
  }
  const { pages, slots } = rowsFor(binder, binderId);
  if (pages.length) {
    const pg = await api('/rest/v1/binder_pages', { method: 'POST', token, headers: rep, body: pages });
    if (!pg.ok) die('insert pages', `${pg.status} ${pg.text.slice(0, 160)}`, 11);
  }
  for (let i = 0; i < slots.length; i += 500) {
    const sl = await api('/rest/v1/binder_slots', { method: 'POST', token, headers: rep, body: slots.slice(i, i + 500) });
    if (!sl.ok) die('insert slots', `${sl.status} ${sl.text.slice(0, 160)}`, 12);
  }
  console.log(`   ${existingId ? 'refreshed' : 'published'} ${binder.title}: ${pages.length}p ${slots.length} slots`);
  return binderId;
}

console.log('\nWriting.');
for (const b of toPublish) await publish(b);
for (const r of toRefresh) await publish(r.bundled, r.live.id);

if (PRUNE) {
  for (const b of toPrune) {
    const del = await api(`/rest/v1/binders?id=eq.${b.id}`, { method: 'DELETE', token });
    if (!del.ok) die('delete binder', `${del.status} ${del.text.slice(0, 120)}`, 13);
    console.log(`   deleted ${b.title}`);
  }
} else if (toPrune.length) {
  console.log(`\n${toPrune.length} binder(s) left in place. Re-run with --prune to delete them.`);
}

console.log('\nDone.');

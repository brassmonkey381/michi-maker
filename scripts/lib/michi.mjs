/**
 * Shared plumbing for the authoring scripts (daily puzzles, social pages, Reddit posts).
 *
 * WHY THE MANAGEMENT API AND NOT THE APP'S OWN CLIENT. These scripts curate content; they are not
 * the product. scripts/theme-candidates.mjs signs in as a member and calls `theme-search`, which
 * was right while the QA account held PRO. It no longer does (it is `free` as of 2026-09-25), so
 * that path now answers 403 and every generator built on it would quietly produce nothing. Reading
 * `cards_en` directly is also unclamped, one round trip instead of hundreds, and does not depend on
 * an entitlement that can lapse again.
 *
 * IMPERSONATION RATHER THAN RE-IMPLEMENTATION. The admin RPCs (admin_publish_puzzle,
 * admin_set_binder_showcase) carry real logic: which columns a publish touches, that showcase moves
 * the pages with the binder. Copying that logic into a script means two definitions that drift, and
 * the pages-not-public bug came from exactly that kind of split. Instead `adminSql` sets
 * `request.jwt.claims` for the transaction so `auth.uid()` is the admin, and the scripts call the
 * same functions Studio calls. The setting is transaction-local (`set_config(..., true)`), verified
 * not to survive into the next request, so nothing leaks to another connection from the pool.
 *
 * The management API returns ONLY THE LAST statement's result set, which is what makes the
 * two-statement impersonation form usable: the `set_config` row is discarded for us.
 *
 * NO SECRET IS EVER PRINTED. Tokens are read from files into memory and used as headers.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');

/** The app project (binders, puzzles, profiles) and the shared card catalog. */
export const APP_REF = 'piikwvntldytjejxmcla';
export const DATA_REF = 'bmhjizcmwtmcrstadqto';

const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
const ANALYTICS_ENV = 'C:/Users/Brian/source/repos/analytics-studio/.env';

export const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
export const step = (n, what) => console.log(`Step ${n}: ${what}`);

/** Read KEY=value files without ever echoing a value. */
export function readVars(file, names) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (names.includes(k)) out[k] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** One name out of the project's .env. */
export function envVar(name) {
  return readVars(join(ROOT, '.env'), [name])[name] ?? '';
}

// Env first (the .ps1 wrappers set it), then the two files that hold it, so a bare
// `node scripts/...` works without a wrapper. Nothing here is logged.
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
  || readVars(SECRETS, ['SUPABASE_ACCESS_TOKEN']).SUPABASE_ACCESS_TOKEN
  || readVars(ANALYTICS_ENV, ['SUPABASE_ACCESS_TOKEN']).SUPABASE_ACCESS_TOKEN
  || '';

if (!TOKEN) {
  fail('SUPABASE_ACCESS_TOKEN not found in the environment, the secrets file, or analytics-studio/.env');
}

/** Run SQL against a project. Throws (exits) on refusal, so callers do not have to check. */
export async function sql(ref, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

export const appSql = (query) => sql(APP_REF, query);
export const dataSql = (query) => sql(DATA_REF, query);

let adminId = null;
/** The single admin profile, which also owns the puzzle binders. */
export async function adminUser() {
  if (adminId) return adminId;
  const rows = await appSql('select id, username from public.profiles where is_admin order by username limit 2;');
  if (rows.length !== 1) fail(`expected exactly one admin profile, found ${rows.length}`);
  adminId = rows[0];
  return adminId;
}

/**
 * Run SQL as the admin, so `auth.uid()` and `is_admin()` behave as they do for Studio and the
 * admin RPCs can be called directly. Transaction-local; it does not outlive this request.
 */
export async function adminSql(query) {
  const me = await adminUser();
  return appSql(
    `select set_config('request.jwt.claims', ${q(JSON.stringify({ sub: me.id, role: 'authenticated' }))}, true);\n${query}`,
  );
}

/** A SQL literal. null/undefined become NULL. */
export const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
/** A text[] literal. */
export const textArray = (xs) => (xs.length ? `array[${xs.map(q).join(',')}]::text[]` : `array[]::text[]`);

// ---------------------------------------------------------------------------
// Card pictures
// ---------------------------------------------------------------------------

/** The 640 tier, which is what a binder page and the puzzle grid draw. */
const IMAGE_FIELD = 'image_medium';
let manifest = null;

/** The content-hashed image manifest (5.2 MB), fetched once per process. */
export async function imageManifest() {
  if (manifest) return manifest;
  const browseUrl = envVar('EXPO_PUBLIC_CATALOG_BROWSE_URL');
  if (!browseUrl) fail('EXPO_PUBLIC_CATALOG_BROWSE_URL is missing from .env');
  const res = await fetch(`${browseUrl}/images.json`);
  if (!res.ok) fail(`the image manifest answers ${res.status}`);
  manifest = JSON.parse(await res.text());
  return manifest;
}

/**
 * The address of one card's picture, resolved the way the app resolves it
 * (tcgscan-browse/src/images.ts, urlIn) including the schema-2 per-language base. Getting this
 * wrong writes plausible addresses that 404, which is worse than the null it would replace.
 */
export function cardImageUrl(m, id) {
  const i = (m.fields ?? []).indexOf(IMAGE_FIELD);
  if (i < 0) return undefined;
  const entry = m.cards?.[String(id)];
  if (!entry) return undefined;
  if (m.schema === 2) {
    const lang = entry[0];
    const key = entry[i + 1];
    const base = m.base?.[lang]?.[IMAGE_FIELD];
    return key && base ? `${base}/${key}` : undefined;
  }
  const key = entry[i];
  const base = m.base?.[IMAGE_FIELD];
  return key && base ? `${base}/${key}` : undefined;
}

// ---------------------------------------------------------------------------
// Backdrops
// ---------------------------------------------------------------------------

/**
 * A landscape photograph for a phrase. Pexels first, Pixabay as the fallback.
 *
 * `binder_pages.background_color` takes either a #rrggbb colour or an http(s) URL, and reads the
 * URL as a picture (src/data/pageStyle.ts, isImageRef). There is no attribution column on a page,
 * so the photographer is returned here for the caller to record in its report.
 *
 * `seen` lets a caller refuse a photograph it has already used on another page, so a run of ten
 * pages does not come back with the same stock sunset ten times.
 */
export async function backdropFor(phrase, { seen } = {}) {
  const keys = readVars(join(ROOT, '.env'), ['EXPO_PUBLIC_PEXELS_KEY', 'EXPO_PUBLIC_PIXABAY_KEY']);
  const fresh = (url) => url && !(seen && seen.has(url));

  if (keys.EXPO_PUBLIC_PEXELS_KEY) {
    const res = await fetch(
      `https://api.pexels.com/v1/search?per_page=8&orientation=landscape&query=${encodeURIComponent(phrase)}`,
      { headers: { Authorization: keys.EXPO_PUBLIC_PEXELS_KEY } },
    );
    if (res.ok) {
      const j = await res.json();
      for (const p of j.photos ?? []) {
        const url = p.src?.large2x ?? p.src?.large ?? p.src?.original;
        if (fresh(url)) return { url, credit: p.photographer, source: 'Pexels', page: p.url };
      }
    }
  }
  if (keys.EXPO_PUBLIC_PIXABAY_KEY) {
    const res = await fetch(
      `https://pixabay.com/api/?per_page=12&orientation=horizontal&image_type=photo`
      + `&key=${keys.EXPO_PUBLIC_PIXABAY_KEY}&q=${encodeURIComponent(phrase)}`,
    );
    if (res.ok) {
      const j = await res.json();
      for (const p of j.hits ?? []) {
        const url = p.largeImageURL ?? p.webformatURL;
        if (fresh(url)) return { url, credit: p.user, source: 'Pixabay', page: p.pageURL };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** The puzzle day, matching public.puzzle_today(): Pacific, rolling over at 3am. */
export function puzzleToday(now = new Date()) {
  const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pacific.setHours(pacific.getHours() - 3);
  return isoDate(pacific);
}

/** yyyy-mm-dd from a Date's local fields (never toISOString, which shifts the day in a zone). */
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** yyyy-mm-dd, n days on. */
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoDate(dt);
}

/** "Thursday 25 September 2026", the form the captions already use. */
export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

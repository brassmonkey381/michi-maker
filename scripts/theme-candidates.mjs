/**
 * EVERY card a set of themes matches, at full depth, for puzzle curation.
 *
 *   node scripts/theme-candidates.mjs clouds lake
 *   node scripts/theme-candidates.mjs night city rain          # 1, 2, 3 ... themes, all ANDed
 *
 * WHY NOT THE ANONYMOUS PATH. scripts/theme-counts.mjs calls the data project with the publishable
 * key, which is right for COUNTING: row 0 carries the true total even though the rows themselves
 * come back clamped to `search_config.free_theme_depth` (3). Curation needs the rows, so counting
 * the way that script counts and then reading its rows would show three candidates out of eight and
 * quietly look like the whole answer.
 *
 * SO IT SIGNS IN, like any PRO or VIP member. The app project's `theme-search` function checks the
 * entitlements ledger and forwards the query to the data project unclamped. That is the same path
 * the product takes for a paying member, so what this prints is what a paying member sees, and no
 * separate "admin" route had to exist for it.
 *
 * Credentials come from the secrets file and are never printed. p_limit is capped at 200 by the
 * function itself, which is far above any page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};

/** Read KEY=value files without ever echoing a value. */
function readVars(file, names) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (names.includes(k)) out[k] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = readVars(path.join(ROOT, '.env'), ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
const creds = readVars(SECRETS, ['MICHI_TEST_EMAIL', 'MICHI_TEST_PASSWORD']);
const APP_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const APP_KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!APP_URL || !APP_KEY) fail('EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY missing from .env');
if (!creds.MICHI_TEST_EMAIL || !creds.MICHI_TEST_PASSWORD) fail('MICHI_TEST_EMAIL / MICHI_TEST_PASSWORD missing from the secrets file');

const themes = process.argv.slice(2).filter(Boolean);
if (!themes.length) fail('usage: node scripts/theme-candidates.mjs <theme> [theme ...]');

async function signIn() {
  const res = await fetch(`${APP_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: APP_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.MICHI_TEST_EMAIL, password: creds.MICHI_TEST_PASSWORD }),
  });
  if (!res.ok) fail(`sign-in refused (${res.status})`);
  const j = await res.json();
  if (!j.access_token) fail('sign-in returned no access token');
  return j.access_token;
}

async function search(token, limit = 200) {
  const res = await fetch(`${APP_URL}/functions/v1/theme-search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_words: [],
      p_fields: themes.map((t) => ({ key: 'theme', value: t })),
      p_compares: [], p_facets: {}, p_min_price: null, p_max_price: null,
      p_sort: null, p_dir: null, p_limit: limit, p_offset: 0,
    }),
  });
  const text = await res.text();
  if (!res.ok) fail(`theme-search refused (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const token = await signIn();
console.log('Step 1: signed in (entitled path)');
const rows = await search(token);
const total = rows.length ? Number(rows[0].total_count) || rows.length : 0;
console.log(`Step 2: theme:${themes.join(' theme:')}`);
console.log(`  ${rows.length} row(s) returned, true total ${total}`);
if (rows.length < total) console.log(`  NOTE: still short of the total, raise p_limit (function caps at 200)`);

const out = rows.map((r) => ({
  id: String(r.id), name: r.name, number: r.number, rarity: r.rarity,
  set: r.set_name, illustrator: r.illustrator, language: r.language, price: r.cur,
}));
for (const c of out) console.log(`  ${c.id.padStart(8)}  ${String(c.name).padEnd(28)} ${String(c.number).padEnd(10)} ${c.set}`);

const dir = path.join(ROOT, 'state', 'puzzles');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${themes.join('-').replace(/[^a-z0-9-]/gi, '_')}.json`);
fs.writeFileSync(file, JSON.stringify({ themes, total, cards: out }, null, 2));
console.log(`\n  wrote ${file}`);

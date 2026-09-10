/**
 * HOW MANY CARDS DOES A THEME WORD ACTUALLY FIND? — the check behind src/data/demoThemes.ts.
 *
 *   node scripts/theme-counts.mjs word another "two words"
 *   node scripts/theme-counts.mjs --list          # re-measure the demo rotation itself
 *
 * WHY THIS EXISTS. The demo button's thirty themes were once picked by hand, from what sounded
 * like a word a card artist would paint. One of them (`fog`) matched a single card, so every
 * thirtieth press demonstrated the feature by finding nothing — the exact opposite of the button's
 * job. A word's density is a fact about the data, not a matter of taste, so measure it.
 *
 * HOW. It calls the data project's `search_cards` RPC anonymously, exactly as a signed-out visitor
 * does. Those rows come back clamped to the free depth, but row 0 still carries `total_count`,
 * which is the TRUE total — the same number the "+N more matches" row is drawn from. Read-only,
 * public key, no ledger, nothing written.
 *
 * The server rate-limits, so this deliberately runs two at a time with a pause between pairs.
 * A long list takes a minute; that is fine for something run when the rotation changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The data project's PostgREST base. Public value; the key below is the publishable one. */
const API = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';

function envKey() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return process.env.EXPO_PUBLIC_CATALOG_API_KEY ?? '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('EXPO_PUBLIC_CATALOG_API_KEY=')) return line.slice(line.indexOf('=') + 1).trim();
  }
  return process.env.EXPO_PUBLIC_CATALOG_API_KEY ?? '';
}

/** The demo rotation, read as text so this script needs no TypeScript loader. */
function demoThemes() {
  const src = fs.readFileSync(path.join(ROOT, 'src/data/demoThemes.ts'), 'utf8');
  const block = src.slice(src.indexOf('DEMO_THEMES'), src.indexOf('];', src.indexOf('DEMO_THEMES')));
  const words = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  // FREE_THEME leads the array as an identifier, not a literal, so name it here.
  return ['forest', ...words];
}

async function count(key, theme) {
  const res = await fetch(`${API}/rpc/search_cards`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_words: [], p_fields: [{ key: 'theme', value: theme }], p_compares: [], p_facets: {},
      p_min_price: null, p_max_price: null, p_sort: null, p_dir: null, p_limit: 1, p_offset: 0,
    }),
  });
  if (!res.ok) return { theme, total: -1, note: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
  const rows = await res.json();
  if (!Array.isArray(rows)) return { theme, total: -1, note: 'unexpected response shape' };
  return { theme, total: rows.length ? Number(rows[0].total_count) || 0 : 0 };
}

const args = process.argv.slice(2);
const words = args.includes('--list') ? demoThemes() : args;
if (!words.length) {
  console.error('Usage: node scripts/theme-counts.mjs <word...>   |   --list');
  process.exit(1);
}
const key = envKey();
if (!key) {
  console.error('FAILED: EXPO_PUBLIC_CATALOG_API_KEY not found in .env or the environment (exit 1)');
  process.exit(1);
}

const results = [];
for (let i = 0; i < words.length; i += 2) {
  if (i) await new Promise((r) => setTimeout(r, 1500));
  results.push(...(await Promise.all(words.slice(i, i + 2).map((w) => count(key, w)))));
  process.stderr.write(`  measured ${results.length}/${words.length}\n`);
}
results.sort((a, b) => b.total - a.total);
for (const r of results) console.log(String(r.total).padStart(5), ' ', r.theme, r.note ?? '');

const thin = results.filter((r) => r.total >= 0 && r.total < 25);
const failed = results.filter((r) => r.total < 0);
if (thin.length) console.log(`\nTHIN (under 25 matches, too few for a demo): ${thin.map((r) => r.theme).join(', ')}`);
if (failed.length) {
  console.error(`\nFAILED: ${failed.length} word(s) could not be measured (exit 1)`);
  process.exit(1);
}

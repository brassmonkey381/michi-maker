/**
 * HOW MANY CARDS DO N THEMES SHARE? — the measurement behind a "guess the themes" puzzle.
 *
 *   node scripts/theme-intersect.mjs clouds lake
 *   node scripts/theme-intersect.mjs --pairs clouds,lake,night,city,rain     # every pair of a list
 *
 * A puzzle page has to FILL a page, and real pages are 2x2, 3x3, 3x4 and 4x4, so the only useful
 * intersection sizes are 4, 9, 12 and 16. A pair matching 8 cards has no page to sit on and a pair
 * matching 300 is not a puzzle, it is a category. That is a fact about the data rather than a
 * matter of taste, so it is measured the same way the demo rotation is (scripts/theme-counts.mjs).
 *
 * It calls the data project's `search_cards` RPC anonymously, exactly as a signed-out visitor does,
 * with one p_fields entry per theme, which is how the query grammar ANDs them. Read-only, public
 * key, nothing written, nothing metered.
 *
 * The server rate-limits, so pairs run one at a time with a pause.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';
/** Real page grids, so a puzzle can fill one exactly (src/data/binderPhysics.ts). */
const PAGE_SIZES = [4, 9, 12, 16];

function envKey() {
  const file = path.join(ROOT, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.startsWith('EXPO_PUBLIC_CATALOG_API_KEY=')) return line.slice(line.indexOf('=') + 1).trim();
    }
  }
  return process.env.EXPO_PUBLIC_CATALOG_API_KEY ?? '';
}

async function intersect(key, themes) {
  const res = await fetch(`${API}/rpc/search_cards`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_words: [],
      p_fields: themes.map((t) => ({ key: 'theme', value: t })),
      p_compares: [], p_facets: {}, p_min_price: null, p_max_price: null,
      p_sort: null, p_dir: null, p_limit: 1, p_offset: 0,
    }),
  });
  if (!res.ok) return { themes, total: -1, note: `HTTP ${res.status} ${(await res.text()).slice(0, 140)}` };
  const rows = await res.json();
  if (!Array.isArray(rows)) return { themes, total: -1, note: 'unexpected response shape' };
  return { themes, total: rows.length ? Number(rows[0].total_count) || 0 : 0 };
}

const key = envKey();
if (!key) {
  console.log('FAILED: EXPO_PUBLIC_CATALOG_API_KEY not found in .env or the environment');
  process.exit(2);
}

const args = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
/** A page it fits exactly, or null. This is what decides whether a pair can be a puzzle at all. */
const fits = (n) => PAGE_SIZES.find((s) => s === n) ?? null;

if (args[0] === '--pairs') {
  const words = (args[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (words.length < 2) {
    console.log('FAILED: --pairs needs a comma-separated list of at least two themes');
    process.exit(2);
  }
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      const r = await intersect(key, [words[i], words[j]]);
      out.push(r);
      const page = fits(r.total);
      console.log(
        `  ${String(r.total).padStart(5)}  ${page ? `fills ${page}` : '         '}  theme:${words[i]} theme:${words[j]}`
        + (r.note ? `  ${r.note}` : ''),
      );
      await sleep(400);
    }
  }
  const usable = out.filter((r) => fits(r.total));
  console.log(`\n  ${usable.length} of ${out.length} pairs fill a real page exactly`);
} else if (args.length >= 2) {
  const r = await intersect(key, args);
  console.log(`  theme:${args.join(' theme:')}`);
  console.log(`  ${r.total} card(s)${r.note ? `  ${r.note}` : ''}`);
  const page = fits(r.total);
  console.log(page ? `  fills a ${page}-pocket page exactly` : '  does not fill a real page (4, 9, 12 or 16)');
} else {
  console.log('usage: node scripts/theme-intersect.mjs <theme> <theme> [...]');
  console.log('       node scripts/theme-intersect.mjs --pairs a,b,c,d');
  process.exit(2);
}

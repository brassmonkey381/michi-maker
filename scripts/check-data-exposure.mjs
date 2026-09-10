/**
 * IS THE DATA BEHIND OUR PAID FEATURES PUBLIC? — run: `npm run check:exposure`
 *
 * The catalog is meant to be readable by anyone: it is card names, sets, prices and images, and
 * the app hands out the data project's PUBLISHABLE key in its web bundle to read them. What is
 * NOT meant to be readable is the derived data the paid tiers are sold on — the artwork
 * embeddings, the scene captions and their tags, the palette vectors. Those are the product.
 *
 * PostgREST exposes whatever the `anon` role can select. A column added to `cards` for an RPC's
 * benefit is therefore published to the world by default, and nothing in the app would notice:
 * every michi and tcgscan-browse code path reads this data through RPCs that compute server-side
 * (find_similar_to_cards, search_cards, tagged_cards), so a revoke breaks no client while a
 * missing revoke costs the whole moat. That asymmetry is what this script watches.
 *
 * It signs in as nobody, asks for each column by name, and fails if one comes back. Read-only.
 * The remediation lives in the DATA project (a different repo — see docs/DATA-SERVER.md); this
 * only detects, so the day someone republishes a view we hear about it from a test, not a forum.
 *
 * DETECTING IS NOT THE SAME AS PRESCRIBING, and this script deliberately does not prescribe. A
 * plain revoke on `anon` would blank browse and search for EVERY user of both apps: neither app
 * holds a user session on the data project (they authenticate against piikwvntldytjejxmcla and
 * read the catalog anonymously), so `anon` is the role every catalog request arrives as, and
 * search_cards is SECURITY INVOKER selecting `c.*` from a security_invoker view that names these
 * columns. The view and the RPC have to be fixed in the same migration that carries the revoke.
 * See docs/DATA-SERVER.md before acting on the SQL this prints.
 *
 * Exit 0 = nothing sensitive readable. Exit 1 = at least one column is public.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://bmhjizcmwtmcrstadqto.supabase.co/rest/v1';

/** Column → what an outsider gets from it. Relations to try each against. */
const GUARDED = {
  embedding: 'the artwork similarity vectors — Find Similar, rebuilt offline',
  scene_caption: 'the artwork descriptions themselves',
  scene_tags: 'the theme vocabulary and every card it applies to — all of theme search',
  color_art: 'the palette vectors behind colour search',
  color_neighbors_art: 'the precomputed colour neighbours',
  full_art_score: 'the full-art scoring',
  // GENERATED FROM THE TWO ABOVE, AND NOT PROTECTED BY REVOKING THEM. art_text is
  // scene_caption || scene_tags, so `art_text=ilike.*storm*` reproduces a theme search on its own
  // (51 rows, measured). A generated column carries its own grant; revoking its sources does
  // nothing for it. Caught by the data session, 2026-09-10 - it was missing from the first list.
  art_text: 'the captions and tags concatenated - reproduces theme search by itself',
};
const RELATIONS = ['cards', 'cards_en', 'card_embeddings_candidate'];

function publishableKey() {
  const file = path.join(ROOT, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.startsWith('EXPO_PUBLIC_CATALOG_API_KEY=')) return line.slice(line.indexOf('=') + 1).trim();
    }
  }
  return process.env.EXPO_PUBLIC_CATALOG_API_KEY ?? '';
}

const key = publishableKey();
if (!key) {
  console.error('FAILED: EXPO_PUBLIC_CATALOG_API_KEY not in .env or the environment (exit 1)');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Can an anonymous caller select this column? null = the relation or column does not exist. */
async function readable(relation, column) {
  const res = await fetch(`${API}/${relation}?select=${column}&limit=1`, { headers });
  if (res.status === 404) return null; // no such relation
  if (!res.ok) return false; // 400 "column does not exist", 401/403 "not yours" - both fine
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows) || !rows.length) return false;
  return Object.prototype.hasOwnProperty.call(rows[0], column);
}

const leaks = [];
for (const relation of RELATIONS) {
  for (const column of Object.keys(GUARDED)) {
    const open = await readable(relation, column);
    if (open === null) break; // relation absent, skip its remaining columns
    if (open) leaks.push({ relation, column });
    await pause(900); // the data server rate-limits; this is not a race
  }
}

if (!leaks.length) {
  console.log('OK: no guarded column is readable by an anonymous caller.');
  process.exit(0);
}
console.error('PUBLIC DATA FOUND — an anonymous holder of the publishable key can read:\n');
for (const { relation, column } of leaks) {
  console.error(`  ${relation}.${column}`.padEnd(44), GUARDED[column]);
}
console.error(`\nFix in the DATA project — READ docs/DATA-SERVER.md FIRST. A bare revoke on anon`);
console.error(`blanks browse and search for every user of BOTH apps (neither holds a user session`);
console.error(`there, so anon is the role every catalog request arrives as), and search_cards is`);
console.error(`SECURITY INVOKER over a view that names these columns. The view and the RPC have to`);
console.error(`be fixed in the same migration as the revoke. Columns to end up protected:`);
console.error(`  ${Object.keys(GUARDED).join(', ')}`);
console.error(`\nFAILED: ${leaks.length} guarded column(s) publicly readable (exit 1)`);
process.exit(1);

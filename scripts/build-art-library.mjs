/**
 * Build the bundled art library from The Art of Pokémon (artofpkm.com) — the ungated, curated
 * gallery of official promotional Pokémon artwork. Replaces the Pexels/Pixabay photo search,
 * whose results were too realistic for the app's aesthetic.
 *
 * How: walk /artwork/all?page=1..N (most recent first), then each /artwork/<id> detail page for
 * its main image + tagged Pokémon (/pokemon/<dex> chips) and characters. The site is a Rails app
 * with Active Storage: a thumbnail representation URL carries the ORIGINAL's signed blob id, and
 * /rails/active_storage/blobs/redirect/<sig>/<file> serves the full-size original from
 * cdn.artofpkm.com with a non-expiring signature — that's what we store.
 *
 * Output: src/data/artofpkm.json — compact entries {i: artworkId, t: title, b: blobSig,
 * f: filename, p: [[species, dex], …], c: [characters…], a?: illustrator, s?: original source
 * URL}. Re-run any time to refresh (rate-limited; ~3 requests/second). This crawls ARTWORK
 * (/artwork), never cards — it's the hand-drawn art gallery the studio pulls from.
 *
 * The listing runs to ~287 pages; the loop stops early on the first empty page, so the default
 * covers the whole gallery. Pass a smaller number for a quick partial refresh.
 *
 *   node scripts/build-art-library.mjs          // full crawl (stops at the last real page)
 *   node scripts/build-art-library.mjs 12       // just the 12 most-recent listing pages
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.artofpkm.com';
const PAGES = Number(process.argv[2] ?? 300); // > the ~287 real pages; the empty-page break stops it
const DELAY_MS = 300;
const HEADERS = { 'User-Agent': 'michi-maker.com art library builder (brassmonkey381@gmail.com)' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch {}
    await sleep(1000 * (attempt + 1));
  }
  return null;
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

const stripTags = (s) => decode(s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));

/** All artwork ids on a listing page, in page order. */
function listingIds(html) {
  return [...html.matchAll(/href="\/artwork\/(\d+)"/g)].map((m) => m[1]);
}

/** dex → lowercase species name (PokeAPI list, slugs de-hyphenated: "mr-mime" → "mr mime"). */
async function fetchDexNames() {
  const res = await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=2000');
  const json = await res.json();
  const map = new Map();
  for (const r of json.results ?? []) {
    const dex = Number(r.url.match(/\/(\d+)\/?$/)?.[1]);
    if (dex) map.set(dex, r.name.replace(/-/g, ' '));
  }
  return map;
}
const DEX_NAMES = await fetchDexNames();
console.log(`dex names: ${DEX_NAMES.size}`);

/** Parse one artwork detail page into a library entry (null when unusable). */
function parseDetail(id, html) {
  // Main image: the first Active Storage representation that isn't a species-render chip.
  const reps = [...html.matchAll(/representations\/redirect\/([^/"]+)\/[^/"]+\/([^"?]+)"/g)];
  const main = reps.find(
    (m) => !/^offical_artwork-front_default/.test(m[2]) && !/^avatar/i.test(m[2]),
  );
  if (!main) return null;

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch ? decode(titleMatch[1].replace(/\s*\|\s*The Art of Pok..?mon.*$/i, '')) : '';

  // Tag chips are image-only anchors (no text) — the dex number in the href is the tag;
  // names resolve through the PokeAPI species list. Cap per entry: pages also link species
  // from related sections, and an entry "tagged" with dozens of species pollutes search.
  const species = [];
  const seenDex = new Set();
  for (const m of html.matchAll(/href="\/pokemon\/(\d+)"/g)) {
    const dex = Number(m[1]);
    const name = DEX_NAMES.get(dex);
    if (!name || seenDex.has(dex)) continue;
    seenDex.add(dex);
    species.push([name, dex]);
    if (species.length >= 12) break;
  }
  const characters = [];
  const seenChar = new Set();
  for (const m of html.matchAll(/<a[^>]*href="\/characters\/\d+"[^>]*>([\s\S]*?)<\/a>/g)) {
    const name = stripTags(m[1]);
    if (!name || seenChar.has(name)) continue;
    seenChar.add(name);
    characters.push(name);
  }

  // Illustrator credit — artofpkm shows "Illus. <name>" linked to /illustrators/<id> (or
  // /artists/<id>). Take the first such linked name as the primary artist credit.
  let artist = '';
  const artistMatch =
    html.match(/<a[^>]*href="\/(?:artists|illustrators)\/[^"]+"[^>]*>([\s\S]*?)<\/a>/) ?? null;
  if (artistMatch) artist = stripTags(artistMatch[1]).trim();

  // Original source — artofpkm prints "Source: <a href="https://…">www.instagram.com</a>",
  // linking the specific post the art came from. That deeper link is the truest citation.
  let source = '';
  const sourceMatch =
    html.match(/Source:\s*<a[^>]*href="(https?:\/\/[^"]+)"/i) ??
    html.match(/href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/i) ??
    null;
  if (sourceMatch) source = sourceMatch[1];

  if (species.length === 0 && characters.length === 0 && !title) return null;
  return {
    i: Number(id),
    t: title,
    b: main[1],
    f: decodeURIComponent(main[2]),
    p: species,
    c: characters,
    ...(artist ? { a: artist } : {}),
    ...(source ? { s: source } : {}),
  };
}

const ids = [];
for (let page = 1; page <= PAGES; page += 1) {
  const html = await get(`/artwork/all?page=${page}`);
  if (!html) break;
  const pageIds = listingIds(html);
  if (pageIds.length === 0) break;
  for (const id of pageIds) if (!ids.includes(id)) ids.push(id);
  console.log(`listing page ${page}: +${pageIds.length} (total ${ids.length})`);
  await sleep(DELAY_MS);
}

const entries = [];
const seenBlob = new Set();
let done = 0;
for (const id of ids) {
  const html = await get(`/artwork/${id}`);
  done += 1;
  if (html) {
    const entry = parseDetail(id, html);
    // The same visual can be posted twice; keep the first (most recent) per blob.
    if (entry && !seenBlob.has(entry.b)) {
      seenBlob.add(entry.b);
      entries.push(entry);
    }
  }
  if (done % 25 === 0) console.log(`details ${done}/${ids.length} → ${entries.length} entries`);
  await sleep(DELAY_MS);
}

const out = {
  v: 1,
  source: 'artofpkm.com',
  note: 'Official promotional Pokémon artwork curated by The Art of Pokémon. Rebuild: node scripts/build-art-library.mjs',
  entries,
};
writeFileSync(new URL('../src/data/artofpkm.json', import.meta.url), JSON.stringify(out));
const bytes = JSON.stringify(out).length;
console.log(`wrote src/data/artofpkm.json — ${entries.length} entries, ${(bytes / 1024).toFixed(0)} KB`);

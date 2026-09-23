/**
 * STAGE 1 of the connected-artwork import: read the forum post and turn it into rows.
 *
 * SOURCE: https://www.elitefourum.com/t/gallery-of-cards-with-connected-artwork/49921
 * One collector's multi-year gallery of Pokemon cards whose illustrations join up. We take the
 * CURATION (which cards belong together) and rebuild the binders from our own catalog; we copy
 * none of their photographs into the product.
 *
 * WHAT THIS FETCHES, AND WHAT IT DELIBERATELY DOES NOT. Two requests, both to endpoints the
 * site's robots.txt permits: /raw/<topic>/1 for the markdown grammar, and /t/<topic>.json for the
 * cooked HTML, which is the only place the upload:// hashes resolve to real URLs. It does NOT
 * download the photographs. elitefourum's robots.txt disallows /uploads/ for ClaudeBot,
 * Claude-Web and anthropic-ai, so fetching the images is a separate, owner-run step and a
 * separate decision. This script records the URLs and stops.
 *
 * WHY BOTH ENDPOINTS. The raw markdown carries the structure (headers, which caption belongs to
 * which image) but writes images as `upload://<base62>.jpeg`, which is not a URL. The cooked HTML
 * carries resolved CDN URLs but flattens the grouping. They join one-to-one on the base62 hash.
 *
 * Run through state/connected-art/1-scrape.ps1. Writes state/connected-art/entries.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TOPIC = 49921;
const SITE = 'https://www.elitefourum.com';
const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', '..', 'state', 'connected-art');

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);

/** One polite pass, identified honestly. */
const UA = 'michi-maker-import/1.0 (one-off curation import; contact via michi-maker.com)';

async function get(url, asJson) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: asJson ? 'application/json' : 'text/plain' } });
  if (!res.ok) fail(`GET ${url} -> ${res.status}`);
  return asJson ? res.json() : res.text();
}

/**
 * Captions are typed by a person, so some are wrong. Each correction is a judgement and is
 * recorded rather than applied silently: a name we changed is a name a reviewer should see.
 *  - distance-1 or -2 typos with exactly one plausible target are corrected.
 *  - 'Machomp' sits at distance 1 from BOTH Machop and Machamp, so it is flagged, not guessed.
 */
const CORRECTIONS = new Map([
  ['garchom', { to: 'Garchomp', why: 'typo, distance 1' }],
  ['jigglypugg', { to: 'Jigglypuff', why: 'typo, distance 2' }],
  ['machomp', { to: 'Machamp', why: 'typo, but ties Machop at the same distance', ambiguous: true }],
]);

/** Caption lines that are not card lists at all. */
const NOT_A_CAPTION = new Set(['peaceful park', 'touch generation turn']);

const IMAGE_RE = /^!\[([^\]|]*)\|(\d+)x(\d+)\]\(upload:\/\/(\S+?)\)$/;
const HEADER_RE = /^\*\s+\*\*(.+?)\*\*\s*$/;

step(1, 'fetching the post (raw markdown + cooked HTML)');
const raw = await get(`${SITE}/raw/${TOPIC}/1`, false);
const topic = await get(`${SITE}/t/${TOPIC}.json`, true);
const cooked = topic?.post_stream?.posts?.[0]?.cooked ?? '';
if (!raw || !cooked) fail('one of the two fetches came back empty');
console.log(`  raw ${raw.length.toLocaleString()} chars, cooked ${cooked.length.toLocaleString()} chars, topic says ${topic.posts_count} posts`);

// --- resolve upload hashes to CDN urls ---------------------------------------
step(2, 'resolving upload hashes to image URLs');
// The lightbox anchor carries the ORIGINAL; the inline img is a 690px render. Prefer the anchor.
const urlByOrder = [];
for (const m of cooked.matchAll(/<a[^>]+class="lightbox"[^>]+href="([^"]+)"/g)) urlByOrder.push(m[1]);
const imgByOrder = [];
for (const m of cooked.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/g)) {
  if (!/emoji|avatar/.test(m[1])) imgByOrder.push(m[1]);
}
console.log(`  ${urlByOrder.length} lightbox originals, ${imgByOrder.length} inline images`);

// --- parse the markdown into entries -----------------------------------------
step(3, 'parsing the gallery grammar');
const lines = raw.split(/\r?\n/);
const entries = [];
let section = null;
let pending = null;
let order = 0;

/** An image with no caption yet is still an entry; flush it before anything replaces it. */
const flush = () => {
  if (pending) entries.push(pending);
  pending = null;
};

for (const line of lines) {
  const text = line.trim();
  if (!text) continue;

  const head = text.match(HEADER_RE);
  if (head) {
    // A HEADER MUST FLUSH. Without this the last image of a section silently inherits the first
    // caption of the next one, which is three wrong groups and no error.
    flush();
    section = head[1].trim();
    continue;
  }

  const img = text.match(IMAGE_RE);
  if (img) {
    flush();
    pending = {
      hash: img[4],
      section,
      order: order++,
      alt: img[1],
      width: Number(img[2]),
      height: Number(img[3]),
      names: null,
      rawCaption: null,
      notes: [],
    };
    continue;
  }

  // Any other non-empty line directly after an image is that image's caption.
  if (pending && pending.names === null) {
    if (/^https?:\/\//i.test(text) || text.startsWith('[')) {
      pending.notes.push('caption line was a link, ignored');
      continue;
    }
    if (NOT_A_CAPTION.has(text.toLowerCase())) {
      pending.notes.push(`caption "${text}" is not a card list`);
      continue;
    }
    pending.rawCaption = text;
    // COMMAS ONLY. Splitting on spaces breaks "White Kyurem"; splitting on "&" breaks
    // "Plusle & Minun"; splitting on "." breaks "Mr. Mime".
    pending.names = text
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const fix = CORRECTIONS.get(n.toLowerCase());
        if (!fix) return { given: n, name: n };
        pending.notes.push(`"${n}" -> "${fix.to}" (${fix.why})`);
        return { given: n, name: fix.to, corrected: true, ambiguous: !!fix.ambiguous };
      });
  }
}
flush();

// --- attach urls, in document order ------------------------------------------
step(4, 'joining captions to image URLs');
let joined = 0;
entries.forEach((e, i) => {
  e.imageUrl = urlByOrder[i] ?? imgByOrder[i] ?? null;
  if (e.imageUrl) joined += 1;
});
console.log(`  ${joined} of ${entries.length} entries carry an image URL`);

// --- assert, loudly ----------------------------------------------------------
step(5, 'checking the parse');
const hashes = new Set(entries.map((e) => e.hash));
const sections = [...new Set(entries.map((e) => e.section).filter(Boolean))];
const captioned = entries.filter((e) => e.names && e.names.length);
const unnamed = entries.filter((e) => !e.names || !e.names.length);
const flagged = entries.filter((e) => e.notes.length);

console.log(`  entries      : ${entries.length}`);
console.log(`  unique hashes: ${hashes.size}`);
console.log(`  sections     : ${sections.length}`);
console.log(`  captioned    : ${captioned.length}`);
console.log(`  image-only   : ${unnamed.length}`);
console.log(`  with notes   : ${flagged.length}`);

if (hashes.size !== entries.length) fail(`${entries.length - hashes.size} duplicate upload hash(es); the join would be wrong`);
if (!entries.length) fail('parsed zero entries; the post grammar has changed');
if (joined !== entries.length) console.log(`  WARNING: ${entries.length - joined} entries have no image URL`);

console.log('\n  sections found:');
for (const s of sections) {
  const n = entries.filter((e) => e.section === s).length;
  console.log(`    ${String(n).padStart(3)}  ${s}`);
}

const sizes = {};
for (const e of captioned) sizes[e.names.length] = (sizes[e.names.length] ?? 0) + 1;
console.log('\n  group sizes (cards per group -> how many groups):');
for (const k of Object.keys(sizes).sort((a, b) => Number(a) - Number(b))) console.log(`    ${String(k).padStart(2)} cards  x${sizes[k]}`);

if (flagged.length) {
  console.log('\n  entries carrying a note (a reviewer should see these):');
  for (const e of flagged.slice(0, 20)) console.log(`    #${e.order} [${e.section}] ${e.rawCaption ?? '(no caption)'} :: ${e.notes.join('; ')}`);
}

// --- write -------------------------------------------------------------------
step(6, 'writing entries.json');
mkdirSync(OUT_DIR, { recursive: true });
const out = {
  source: `${SITE}/t/gallery-of-cards-with-connected-artwork/${TOPIC}`,
  fetchedFrom: [`${SITE}/raw/${TOPIC}/1`, `${SITE}/t/${TOPIC}.json`],
  postsInTopic: topic.posts_count,
  note: 'Curation only. No forum photograph is copied into the product; images are referenced for card identification and then discarded.',
  counts: { entries: entries.length, captioned: captioned.length, imageOnly: unnamed.length, sections: sections.length },
  sections,
  entries,
};
const path = join(OUT_DIR, 'entries.json');
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`  wrote ${path}`);
console.log('\nOK: stage 1 complete. No images were downloaded and nothing was written to the database.');

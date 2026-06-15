// poke-michi — catalogue ingestion from TCGdex (https://tcgdex.dev)
//
// Populates the reference tables (card_sets, illustrators, cards) from the TCGdex REST
// API. Runs server-side with the Supabase *secret* (service_role) key, which bypasses
// RLS — never ship that key in the app. See scripts/README.md and docs/DATA-MODEL.md.
//
// Image strategy is hybrid (see docs/DATA-MODEL.md):
//   - default: store TCGdex CDN URLs (image_url/image_small_url) + source_url
//   - --cache-images: also download and mirror images into a Supabase Storage bucket,
//     and point image_url/image_small_url at your own storage
//
// No extra dependencies: uses Node's built-in fetch (Node 18+) and @supabase/supabase-js.

import { createClient } from '@supabase/supabase-js';

// --- config ----------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const LANG = process.env.TCGDEX_LANG ?? 'en';
const API = `https://api.tcgdex.net/v2/${LANG}`;
const BUCKET = 'cards';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
const setIds = argv.filter((a) => !a.startsWith('--'));
const limitArg = argv.find((a) => a.startsWith('--limit='));

const ALL = flags.has('--all');
const CACHE_IMAGES = flags.has('--cache-images');
const DRY_RUN = flags.has('--dry-run');
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : Infinity;

// --- helpers ---------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Card image: base URL + `/{quality}.webp` (high = 600x825, low = 245x337). */
const cardImage = (base, quality) => (base ? `${base}/${quality}.webp` : null);

/** Set logo/symbol asset: base URL + `.{ext}`. */
const assetImage = (base, ext = 'webp') => (base ? `${base}.${ext}` : null);

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchJson(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'poke-michi-ingest/0.1' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt === attempts) throw new Error(`GET ${url} failed: ${error.message}`);
      await sleep(400 * attempt);
    }
  }
  return null;
}

// --- supabase --------------------------------------------------------------

const supabase =
  DRY_RUN || !SUPABASE_URL || !SUPABASE_SECRET_KEY
    ? null
    : createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

async function upsert(table, rows) {
  if (rows.length === 0) return;
  if (!supabase) {
    console.log(`  [dry-run] would upsert ${rows.length} row(s) → ${table}`);
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady || !supabase) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`createBucket(${BUCKET}): ${error.message}`);
  }
  bucketReady = true;
}

/** Download both qualities and mirror them into Supabase Storage; return public URLs. */
async function cacheImage(cardId, base) {
  if (!supabase) return null;
  await ensureBucket();
  const out = {};
  for (const quality of ['high', 'low']) {
    const res = await fetch(`${base}/${quality}.webp`);
    if (!res.ok) {
      console.warn(`  ! image ${cardId} ${quality} → HTTP ${res.status}`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `${cardId}/${quality}.webp`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/webp', upsert: true });
    if (error) {
      console.warn(`  ! upload ${path}: ${error.message}`);
      return null;
    }
    out[quality] = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  return out;
}

// --- ingestion -------------------------------------------------------------

async function ingestSet(setId, totals) {
  const set = await fetchJson(`${API}/sets/${setId}`);

  await upsert('card_sets', [
    {
      id: set.id,
      name: set.name,
      series: set.serie?.name ?? null,
      release_date: set.releaseDate ?? null,
      symbol_url: assetImage(set.symbol),
    },
  ]);

  const briefs = (set.cards ?? []).slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
  const fullCards = (
    await mapLimit(briefs, 6, async (brief) => {
      try {
        return await fetchJson(`${API}/cards/${brief.id}`);
      } catch (error) {
        console.warn(`  ! card ${brief.id}: ${error.message}`);
        return null;
      }
    })
  ).filter(Boolean);

  // Illustrators (deduped) must exist before cards reference them.
  const illustrators = new Map();
  for (const card of fullCards) {
    if (card.illustrator) {
      const id = slugify(card.illustrator);
      illustrators.set(id, { id, name: card.illustrator });
      totals.illustrators.add(id);
    }
  }
  await upsert('illustrators', [...illustrators.values()]);

  const rows = [];
  for (const card of fullCards) {
    let imageUrl = cardImage(card.image, 'high');
    let imageSmallUrl = cardImage(card.image, 'low');
    if (CACHE_IMAGES && card.image) {
      const cached = await cacheImage(card.id, card.image);
      if (cached) {
        imageUrl = cached.high;
        imageSmallUrl = cached.low;
      }
    }
    rows.push({
      id: card.id,
      name: card.name,
      set_id: set.id,
      illustrator_id: card.illustrator ? slugify(card.illustrator) : null,
      pokemon_id: null, // dexId → pokemon table mapping is a later enrichment step
      number: card.localId != null ? String(card.localId) : null,
      rarity: card.rarity ?? null,
      orientation: 'portrait',
      image_url: imageUrl,
      image_small_url: imageSmallUrl,
      dominant_color: null, // compute later (e.g. sharp/node-vibrant) to power colour themes
      source_url: card.image ?? null,
    });
  }

  for (const part of chunk(rows, 100)) await upsert('cards', part);

  totals.cards += rows.length;
  totals.sets += 1;
  console.log(`✓ ${set.id} (${set.name}) — ${rows.length} cards, ${illustrators.size} illustrators`);
}

function printUsage() {
  console.log(`
poke-michi — TCGdex catalogue ingestion

Usage:
  node --env-file-if-exists=.env scripts/ingest.mjs <setId...> [options]
  node --env-file-if-exists=.env scripts/ingest.mjs --all [options]

Examples:
  node --env-file-if-exists=.env scripts/ingest.mjs swsh3 base1
  node --env-file-if-exists=.env scripts/ingest.mjs swsh3 --cache-images
  node --env-file-if-exists=.env scripts/ingest.mjs swsh3 --dry-run --limit=5

Options:
  --all            Ingest every set (large — tens of thousands of cards)
  --cache-images   Mirror images into the Supabase Storage '${BUCKET}' bucket
  --limit=N        Cap cards per set (handy for testing)
  --dry-run        Fetch + log only; no Supabase writes (no credentials needed)

Environment (e.g. in a gitignored .env loaded via --env-file-if-exists):
  SUPABASE_URL          falls back to EXPO_PUBLIC_SUPABASE_URL
  SUPABASE_SECRET_KEY   service_role / secret key — NEVER ship this in the app
  TCGDEX_LANG           language code, default 'en'
`);
}

async function main() {
  if (!ALL && setIds.length === 0) {
    printUsage();
    return;
  }
  if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SECRET_KEY)) {
    throw new Error(
      'Missing SUPABASE_URL and/or SUPABASE_SECRET_KEY. Set them (e.g. in a gitignored .env ' +
        'loaded with --env-file-if-exists=.env), or use --dry-run to test without writing.',
    );
  }

  const targets = ALL ? (await fetchJson(`${API}/sets`)).map((s) => s.id) : setIds;
  console.log(
    `Ingesting ${targets.length} set(s) from ${API}` +
      `${DRY_RUN ? ' [dry-run]' : ''}${CACHE_IMAGES ? ' [cache-images]' : ''}\n`,
  );

  const totals = { sets: 0, cards: 0, illustrators: new Set() };
  for (const setId of targets) {
    try {
      await ingestSet(setId, totals);
    } catch (error) {
      console.warn(`✗ set ${setId}: ${error.message}`);
    }
  }

  console.log(
    `\nDone — ${totals.sets} set(s), ${totals.cards} card(s), ` +
      `${totals.illustrators.size} illustrator(s).${DRY_RUN ? ' (dry-run: nothing written)' : ''}`,
  );
}

main().catch((error) => {
  console.error(`\nIngestion failed: ${error.message}`);
  process.exitCode = 1;
});

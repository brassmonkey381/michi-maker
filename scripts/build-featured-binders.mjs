// @ts-nocheck
/**
 * Export the owner's hand-picked REAL binders → src/data/featuredBinders.json.
 *
 * These are personal binders (built in the live app) promoted to bundled example binders:
 * they ship with the app, appear alongside the generated/release examples, and power the
 * landing page's spread + gallery. The source of truth stays the live binder — rerun this
 * script after editing one and commit the JSON.
 *
 * Reads via the public PostgREST endpoint with the publishable key, so a source binder must
 * be anonymously readable at export time — binder PUBLIC *and* the owner's profile public
 * (both RLS conditions). An unreadable binder keeps its previous entry from the committed
 * JSON (stale but present) and is reported. Private pages inside a binder are always
 * excluded from the bundle.
 *
 * Ids are re-minted deterministically (`ex-<key>` / `_p<n>` / `_r<r>c<c>`) so the bundled
 * copy can never collide with the owner's live rows — the store merges example + user
 * binders by id, and a shared id is exactly the cross-account duplication bug.
 *
 * Run: `node scripts/build-featured-binders.mjs`, then commit the JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = join(ROOT, 'src', 'data', 'featuredBinders.json');

/** The binders to bundle, in display order. `key` becomes the stable bundled id (`ex-<key>`). */
const FEATURED = [
  // "Pikachu and Friends" — the original "My First Binder" remade under the @michimaker account.
  { sourceId: 'bb6a56b4-cce4-44dd-826d-5dab2e732370', key: 'pikachu-and-friends' },
  { sourceId: 'df338785-1041-4494-aeac-11be94e5186c', key: 'ideas-in-flight' },
  { sourceId: 'd1d44c9c-8da4-438a-9cdd-02343dcb36ff', key: 'pitch-black-chase' },
];

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const API_URL = `${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1`;
const API_KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function fetchBinder(id) {
  const res = await fetch(
    `${API_URL}/binders?id=eq.${id}&select=*,binder_pages(*,binder_slots(*))`,
    { headers: { apikey: API_KEY } },
  );
  if (!res.ok) throw new Error(`binder fetch ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

/** Row → bundled slot, dropping nullish fields so the JSON matches the hand-authored shape. */
function mapSlot(row, pageId) {
  const slot = {
    id: `${pageId}_r${row.row_index}c${row.col_index}`,
    row: row.row_index,
    col: row.col_index,
    rowSpan: row.row_span,
    colSpan: row.col_span,
    type: row.slot_type,
    cardId: row.card_id ?? undefined,
    insertColor: row.insert_image_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    imageCrop: row.image_crop ?? undefined,
    imageFit: row.image_fit ?? undefined,
    imageTransform: row.image_transform ?? undefined,
    // from_collection is the owner's inventory accounting — meaningless in a bundled example.
  };
  return Object.fromEntries(Object.entries(slot).filter(([, v]) => v !== undefined));
}

function mapBinder(row, key) {
  const binderId = `ex-${key}`;
  const pages = [...(row.binder_pages ?? [])].sort((a, b) => a.position - b.position);
  const publicPages = pages.filter((p) => p.is_public !== false);
  const skipped = pages.length - publicPages.length;
  if (skipped > 0) {
    console.log(`  · "${row.title}": excluded ${skipped} private page(s) from the bundle`);
  }
  return {
    id: binderId,
    title: row.title,
    description: row.description ?? undefined,
    layoutStyle: row.layout_style,
    isExample: true,
    coverCardId: row.cover_card_id ?? undefined,
    pages: publicPages.map((p, i) => {
      const pageId = `${binderId}_p${i}`;
      const page = {
        id: pageId,
        title: p.title ?? undefined,
        description: p.notes ?? undefined,
        rows: p.rows,
        cols: p.cols,
        backgroundColor: p.background_color ?? undefined,
        slots: (p.binder_slots ?? [])
          .filter((s) => s.slot_type !== 'empty')
          .sort((a, b) => a.row_index - b.row_index || a.col_index - b.col_index)
          .map((s) => mapSlot(s, pageId)),
      };
      return Object.fromEntries(Object.entries(page).filter(([, v]) => v !== undefined));
    }),
  };
}

let previous = [];
try {
  previous = JSON.parse(readFileSync(OUT, 'utf8'));
} catch {
  // first run — nothing to fall back to
}
const previousById = new Map(previous.map((b) => [b.id, b]));

const out = [];
for (const { sourceId, key } of FEATURED) {
  const row = await fetchBinder(sourceId);
  if (!row) {
    const kept = previousById.get(`ex-${key}`);
    if (kept) {
      console.warn(
        `! ${sourceId} (${key}): not anonymously readable (binder public + owner profile public required) — kept the previous export.`,
      );
      out.push(kept);
    } else {
      console.error(
        `✗ ${sourceId} (${key}): not anonymously readable and no previous export to keep. Skipped.`,
      );
      process.exitCode = 1;
    }
    continue;
  }
  const binder = mapBinder(row, key);
  const slots = binder.pages.reduce((n, p) => n + p.slots.length, 0);
  console.log(`✓ "${binder.title}" → ${binder.id} (${binder.pages.length} pages, ${slots} slots)`);
  out.push(binder);
}

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${out.length} binder(s) → ${OUT}`);

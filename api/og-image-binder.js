/**
 * Composed page image for a shared binder — a 1200×630 render of the binder's fullest
 * page (its cards laid out the way the page looks), used as the og:image for
 * `/binder/:id`. So a shared link unfurls as the actual page, not a single card.
 *
 * Runs on the Edge runtime via @vercel/og (Satori → resvg). Design notes:
 *  - No text nodes → no font dependency (the title/description ride in the meta tags).
 *  - CARD ART: the hosted buckets key images by content hash, so a URL is NOT
 *    constructible from a card id — it comes from the lite `images.json` manifest
 *    (fields ["image","image_small","image_medium"]). Satori can rasterise JPEG/PNG but
 *    NOT WebP, and the two thumb tiers are WebP, so we resolve the `image` field (the
 *    full-size JPEG). See tcgscan-browse `images.ts` / `cardThumbUrl`.
 *  - Satori supports flexbox only, so the page is laid out as nested flex rows. Slot
 *    spans are not honoured yet (a spanned card shows in its origin cell) — see the
 *    follow-up in docs/OPEN-GRAPH.md.
 *  - On ANY failure it redirects to the binder's cover image (or the site image), so a
 *    share always has something.
 */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const BROWSE_URL = process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL || '';
const SITE = process.env.EXPO_PUBLIC_APP_URL || 'https://michi-maker.com';

// Supersample: render at 2× the display size (2400×1260) so the viewer (Discord, etc.)
// downscales from a higher-res source and card art stays crisp instead of soft. All pixel
// sizes below are in this 2×-space.
const S = 2;
const W = 1200 * S;
const H = 630 * S;
const GAP = 8 * S;
const CARD_ASPECT = 2.5 / 3.5; // real card proportions

/** Minimal hyperscript — Satori reads `{ type, props: { style, children, ... } }`. */
const h = (type, props, children) => ({ type, props: { ...(props || {}), children } });

async function fetchJson(url, headers) {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) return null;
  return res.json();
}

async function fetchBinder(id) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const select =
    'title,cover_card_id,binder_pages(position,rows,cols,binder_slots(row_index,col_index,card_id))';
  const url = `${SUPABASE_URL}/rest/v1/binders?id=eq.${encodeURIComponent(
    id,
  )}&is_public=eq.true&select=${encodeURIComponent(select)}`;
  const rows = await fetchJson(url, {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  });
  return Array.isArray(rows) ? rows[0] : null;
}

/** The lite id→content-hashed-image manifest. Fetched once per render (the PNG is edge-cached). */
async function fetchManifest() {
  if (!BROWSE_URL) return null;
  const m = await fetchJson(`${BROWSE_URL}/images.json`);
  if (!m || !Array.isArray(m.fields) || !m.base || !m.cards) return null;
  return m;
}

/** id → absolute URL for a manifest field, or null. `image` is the full JPEG (Satori-safe). */
function manifestUrl(manifest, id, field) {
  if (!manifest || !id) return null;
  const i = manifest.fields.indexOf(field);
  if (i < 0) return null;
  const key = manifest.cards[id]?.[i];
  const base = manifest.base[field];
  return key && base ? `${base}/${key}` : null;
}

const cardCount = (page) => (page.binder_slots || []).filter((s) => s.card_id).length;
const pageCells = (page) => (page.cols || 3) * (page.rows || 3);

/**
 * The page(s) to show. Prefer an OPEN SPREAD (the two fullest pages, in page order) —
 * more art, and it fills the wide frame — falling back to a single page. The spread is
 * capped at ~18 pockets total so a render never fetches an unreasonable pile of
 * full-size card JPEGs.
 */
function pickPages(binder) {
  const pages = (binder.binder_pages || []).slice().sort((a, b) => a.position - b.position);
  const withCards = pages.filter((p) => cardCount(p) > 0);
  if (withCards.length === 0) return [];
  if (withCards.length === 1) return [withCards[0]];
  const topTwo = withCards.slice().sort((a, b) => cardCount(b) - cardCount(a)).slice(0, 2);
  if (pageCells(topTwo[0]) + pageCells(topTwo[1]) > 18) return [topTwo[0]];
  return topTwo.sort((a, b) => a.position - b.position);
}

/** Card size that fits `cols`×`rows` inside the given box while staying card-shaped. */
function cardSize(cols, rows, maxGridW, maxGridH) {
  const cellW = (maxGridW - GAP * (cols - 1)) / cols;
  const cellH = (maxGridH - GAP * (rows - 1)) / rows;
  let cw = cellW;
  let ch = cw / CARD_ASPECT;
  if (ch > cellH) {
    ch = cellH;
    cw = ch * CARD_ASPECT;
  }
  return { cw: Math.floor(cw), ch: Math.floor(ch) };
}

/** One page's grid of cards at a fixed card size. */
function pageGrid(page, cw, ch, manifest) {
  const cols = page.cols || 3;
  const rows = page.rows || 3;
  const byCell = new Map();
  for (const s of page.binder_slots || []) byCell.set(`${s.row_index}:${s.col_index}`, s);
  const rowEls = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const slot = byCell.get(`${r}:${c}`);
      const src = slot && slot.card_id ? manifestUrl(manifest, slot.card_id, 'image') : null;
      cells.push(
        h(
          'div',
          {
            style: {
              display: 'flex',
              width: cw,
              height: ch,
              borderRadius: 9 * S,
              overflow: 'hidden',
              backgroundColor: src ? '#e9e4da' : 'rgba(120,116,108,0.10)',
            },
          },
          src ? h('img', { src, width: cw, height: ch, style: { objectFit: 'cover' } }) : null,
        ),
      );
    }
    rowEls.push(h('div', { style: { display: 'flex', flexDirection: 'row', gap: GAP } }, cells));
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: GAP } }, rowEls);
}

/** The ringed binder spine between two facing pages. */
function spine(height) {
  const rings = [0, 1, 2, 3].map(() =>
    h('div', {
      style: {
        display: 'flex',
        width: 12 * S,
        height: 12 * S,
        borderRadius: 6 * S,
        borderWidth: 2 * S,
        borderStyle: 'solid',
        borderColor: 'rgba(120,116,108,0.40)',
      },
    }),
  );
  return h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        width: 26 * S,
        height,
        paddingTop: 10 * S,
        paddingBottom: 10 * S,
      },
    },
    rings,
  );
}

// Shared previews travel far beyond the app (Discord, X, Reddit) where our fan disclaimer isn't
// visible — so it rides along the bottom of the image itself. @vercel/og renders text with its
// bundled Geist font, no font fetch needed.
const DISCLAIMER =
  'Fan-made tool — not affiliated with, endorsed by, or sponsored by Nintendo, Creatures, or The Pokémon Company. Card images belong to their respective owners.';

const frame = (inner) =>
  h(
    'div',
    {
      style: {
        width: W,
        height: H,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #FAF6EF 0%, #EFE7D9 100%)',
      },
    },
    [
      h(
        'div',
        { style: { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' } },
        inner,
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: 40 * S,
            paddingRight: 40 * S,
            paddingBottom: 12 * S,
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              textAlign: 'center',
              fontSize: 16 * S,
              lineHeight: 1.3,
              color: 'rgba(70,58,42,0.62)',
            },
          },
          DISCLAIMER,
        ),
      ),
    ],
  );

const mat = (children, tilt) =>
  h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        padding: 18 * S,
        borderRadius: 24 * S,
        backgroundColor: '#fbfaf7',
        boxShadow: `0 ${26 * S}px ${70 * S}px rgba(60,50,35,0.30)`,
        transform: `rotate(${tilt}deg)`,
      },
    },
    children,
  );

function compose(pages, manifest) {
  if (pages.length >= 2) {
    // Open spread: shared card size so both pages align; sized to a half-frame box.
    const cols = Math.max(pages[0].cols || 3, pages[1].cols || 3);
    const rows = Math.max(pages[0].rows || 3, pages[1].rows || 3);
    const { cw, ch } = cardSize(cols, rows, 470 * S, 520 * S);
    const spineH = rows * ch + (rows - 1) * GAP;
    return frame(
      mat(
        [
          pageGrid(pages[0], cw, ch, manifest),
          spine(spineH),
          pageGrid(pages[1], cw, ch, manifest),
        ],
        -1,
      ),
    );
  }
  const page = pages[0];
  const { cw, ch } = cardSize(page.cols || 3, page.rows || 3, 760 * S, 540 * S);
  return frame(mat(pageGrid(page, cw, ch, manifest), -1.5));
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get('id') || '').trim();
  let cover = `${SITE}/og.png`;
  try {
    if (id) {
      const [binder, manifest] = await Promise.all([fetchBinder(id), fetchManifest()]);
      if (binder) {
        cover = manifestUrl(manifest, binder.cover_card_id, 'image') || cover;
        const pages = pickPages(binder);
        // Only compose when at least one card actually resolves to an image — otherwise
        // an all-blank page is worse than the cover fallback.
        const anyImage = pages.some((page) =>
          (page.binder_slots || []).some(
            (s) => s.card_id && manifestUrl(manifest, s.card_id, 'image'),
          ),
        );
        if (pages.length && anyImage) {
          return new ImageResponse(compose(pages, manifest), {
            width: W,
            height: H,
            headers: {
              'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
            },
          });
        }
      }
    }
  } catch {
    // fall through to the cover redirect
  }
  return Response.redirect(cover, 302);
}

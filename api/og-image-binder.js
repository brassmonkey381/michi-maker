/**
 * Composed page image for a shared binder — a 1200×630 render of the binder's fullest
 * page (its cards laid out the way the page looks), used as the og:image for
 * `/binder/:id`. So a shared link unfurls as the actual page, not a single card.
 *
 * Runs on the Edge runtime via @vercel/og (Satori → resvg). Design notes:
 *  - No text nodes → no font dependency (the title/description ride in the meta tags).
 *  - Card art uses the flat JPEG tier (`card-imgs/<id>.jpg`); resvg rasterises JPEG/PNG
 *    reliably but not always WebP.
 *  - Satori supports flexbox only, so the page is laid out as nested flex rows. Slot
 *    spans are not honoured yet (a spanned card shows in its origin cell) — see the
 *    follow-up in docs/OPEN-GRAPH.md.
 *  - On ANY failure it redirects to the binder's cover card (the previous behaviour),
 *    so a share always has an image.
 */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const IMG_BASE = process.env.EXPO_PUBLIC_CATALOG_IMG_BASE || '';
const SITE = process.env.EXPO_PUBLIC_APP_URL || 'https://michi-maker.com';

const W = 1200;
const H = 630;
const GAP = 8;
const CARD_ASPECT = 2.5 / 3.5; // real card proportions

const cardJpg = (id) => (id && IMG_BASE ? `${IMG_BASE}/card-imgs/${encodeURIComponent(id)}.jpg` : null);
const cardThumb = (id) =>
  id && IMG_BASE ? `${IMG_BASE}/card-thumbs/640/${encodeURIComponent(id)}.webp` : null;

/** Minimal hyperscript — Satori reads `{ type, props: { style, children, ... } }`. */
const h = (type, props, children) => ({ type, props: { ...(props || {}), children } });

async function fetchBinder(id) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const select =
    'title,cover_card_id,binder_pages(position,rows,cols,binder_slots(row_index,col_index,card_id))';
  const url = `${SUPABASE_URL}/rest/v1/binders?id=eq.${encodeURIComponent(
    id,
  )}&is_public=eq.true&select=${encodeURIComponent(select)}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

const cardCount = (page) => (page.binder_slots || []).filter((s) => s.card_id).length;

/** The page that makes the best hero: the one with the most cards on it. */
function pickPage(binder) {
  const pages = (binder.binder_pages || []).slice().sort((a, b) => a.position - b.position);
  let best = null;
  for (const p of pages) if (!best || cardCount(p) > cardCount(best)) best = p;
  return best && cardCount(best) > 0 ? best : null;
}

/** Card size that fits `cols`×`rows` inside the frame while staying card-shaped. */
function cardSize(cols, rows) {
  const maxGridW = 760;
  const maxGridH = 540;
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

function compose(page) {
  const cols = page.cols || 3;
  const rows = page.rows || 3;
  const { cw, ch } = cardSize(cols, rows);
  const byCell = new Map();
  for (const s of page.binder_slots || []) byCell.set(`${s.row_index}:${s.col_index}`, s);

  const rowEls = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const slot = byCell.get(`${r}:${c}`);
      const src = slot && slot.card_id ? cardJpg(slot.card_id) : null;
      cells.push(
        h(
          'div',
          {
            style: {
              display: 'flex',
              width: cw,
              height: ch,
              borderRadius: 9,
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

  const grid = h('div', { style: { display: 'flex', flexDirection: 'column', gap: GAP } }, rowEls);
  const pageCard = h(
    'div',
    {
      style: {
        display: 'flex',
        padding: 18,
        borderRadius: 24,
        backgroundColor: '#fbfaf7',
        boxShadow: '0 26px 70px rgba(60,50,35,0.30)',
        transform: 'rotate(-2deg)',
      },
    },
    grid,
  );
  return h(
    'div',
    {
      style: {
        width: W,
        height: H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #FAF6EF 0%, #EFE7D9 100%)',
      },
    },
    pageCard,
  );
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get('id') || '').trim();
  let cover = `${SITE}/og.png`;
  try {
    const binder = id ? await fetchBinder(id) : null;
    if (binder) {
      cover = cardThumb(binder.cover_card_id) || cover;
      const page = pickPage(binder);
      if (page) {
        return new ImageResponse(compose(page), {
          width: W,
          height: H,
          headers: {
            'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
          },
        });
      }
    }
  } catch {
    // fall through to the cover redirect
  }
  return Response.redirect(cover, 302);
}

/**
 * Composed page image for a shared binder — a 2880×1512 render of the binder's fullest
 * page (its cards laid out the way the page looks), used as the og:image for
 * `/binder/:id`. So a shared link unfurls as the actual page, not a single card.
 *
 * Runs on the NODE runtime, not Edge, and that is deliberate: @vercel/og can only emit PNG, which
 * for nine card photographs is megabytes, and an og:image that is too large simply doesn't render.
 * On Node the PNG can be handed to sharp and re-encoded as JPEG — ~7× smaller — which is what buys
 * the headroom to render at a HIGHER resolution than the Edge version could. (Node is also where
 * @vercel/og already rasterises with sharp internally, so the dependency is not a new one.) The
 * cost is CJS: an Edge function is always ESM, a Node one here is not, so @vercel/og — which is
 * ESM-only — is pulled in with a dynamic import inside the handler.
 *
 * Design notes:
 *  - The only text is the footer: the fan disclaimer and the michi-maker.com brand stamp, both
 *    in @vercel/og's bundled font. The title and description ride in the meta tags instead.
 *  - CARD ART: the hosted buckets key images by content hash, so a URL is NOT
 *    constructible from a card id — it comes from the lite `images.json` manifest
 *    (fields ["image","image_small","image_medium"]). Satori can rasterise JPEG/PNG but
 *    NOT WebP, and the two thumb tiers are WebP, so we resolve the `image` field (the
 *    full-size JPEG). See tcgscan-browse `images.ts` / `cardThumbUrl`.
 *  - CUSTOM ARTWORK: `slot_type: 'artwork'` slots carry their own `image_url` (the public
 *    `binder-art` bucket, or an imported source) plus the `image_crop` window that makes one
 *    image read as a sliced scene across several pockets. Those are drawn here too — without
 *    them a page whose centre row is a sliced wordart unfurled with three blank pockets.
 *    Art bytes are fetched and format-sniffed here, not handed to Satori blind — see `loadArt`.
 *  - Satori has no CSS grid, so the page is laid out as absolutely-positioned boxes on a
 *    step grid (`pageGrid`). That honours `row_span`/`col_span`, so a 2×2 jumbo reads as one
 *    card and a spanning sliced artwork gets the wide box its crop window was cut for.
 *  - On ANY failure it redirects to the binder's cover image (or the site image), so a
 *    share always has something.
 */
const sharp = require('sharp');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const BROWSE_URL = process.env.EXPO_PUBLIC_CATALOG_BROWSE_URL || '';
const SITE = process.env.EXPO_PUBLIC_APP_URL || 'https://michi-maker.com';

// Render scale. @vercel/og only outputs PNG, and a PNG of nine card photographs is enormous — which
// used to be the binding constraint (1.95× ≈ 3.94MB, against the ~4MB that made Discord balk). The
// PNG is now re-encoded to JPEG before it leaves (see the handler), so size is no longer what caps
// this: at 2.4×/q84 the response is ~0.78MB, a fifth of what 1.95× used to ship.
//
// The cap is now TIME. Measured end-to-end on this binder: 1.95× 3.4s, 2.4× 4.4s, 3× 6.4s, and
// 3.6× falls off a cliff to 20s. A scraper that times out shows no image at all, so 2.4× is chosen
// as the last scale that rasterises comfortably inside the function's maxDuration (vercel.json) —
// and it is already ~2.6× the pixels Discord actually displays (~550 CSS px wide), so the scales
// above it buy nothing anyone can see. All pixel sizes below are multiplied by S, scaling the
// layout uniformly (fractional S is fine — Satori accepts sub-pixel styles).
const S = 2.4;
const W = Math.round(1200 * S); // 2880 — ImageResponse needs integer dimensions
const H = Math.round(630 * S); // 1512

// A SINGLE page is a different shape of problem. A 3×3 page is about 0.75:1, so scaled to the full
// height of a 1.9:1 frame it can only occupy about a third of the width — roughly two thirds of a
// single-page render was empty. This narrower canvas is sized to the page instead, and what space
// is left is filled by a blurred enlargement of the page's own art rather than left blank.
//
// SPREADS ARE UNCHANGED and still render at W×H: two facing pages genuinely need the width.
// Which shape is used is decided by api/og-binder.js and passed in the URL (see `ogImageUrl`), so
// the og:image:width/height it declares and what this renders can never disagree.
const SINGLE_W = 1800;
const SINGLE_H = 1512;

// JPEG settings. 4:4:4 (no chroma subsampling) costs ~0.2MB over 4:2:0 and is worth it here: the
// frame is dense small card text and saturated red/blue art edges, which is precisely what
// subsampling smears. mozjpeg is what gets it back under a megabyte.
const JPEG = { quality: 84, progressive: true, mozjpeg: true, chromaSubsampling: '4:4:4' };
const CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400';
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
  const base =
    'title,cover_card_id,binder_pages(id,position,rows,cols,binder_slots(row_index,col_index,row_span,col_span,card_id,slot_type,image_url,image_fit,image_crop,image_transform))';
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  // Try WITH the featured-pages column first; if the share_page_ids migration hasn't landed yet that
  // select 400s (fetchJson → null), so fall back to the base select. Keeps the composed image working
  // regardless of migration timing — the featured-page selection simply activates once the column
  // exists. (A genuinely private/missing binder returns [] on the first try and resolves to null.)
  for (const select of [`share_page_ids,${base}`, base]) {
    const url = `${SUPABASE_URL}/rest/v1/binders?id=eq.${encodeURIComponent(
      id,
    )}&is_public=eq.true&select=${encodeURIComponent(select)}`;
    const rows = await fetchJson(url, headers);
    if (Array.isArray(rows)) return rows[0] || null;
  }
  return null;
}

/** The lite id→content-hashed-image manifest. Fetched once per render (the PNG is edge-cached). */
async function fetchManifest() {
  if (!BROWSE_URL) return null;
  const m = await fetchJson(`${BROWSE_URL}/images.json`);
  if (!m || !Array.isArray(m.fields) || !m.base || !m.cards) return null;
  return m;
}

/** id → absolute URL for a manifest field, or null. `image` is the full JPEG (Satori-safe).
 * Handles BOTH manifest schemas: schema 1 (single-language: base={field→url}, cards[id]=[keys]) and
 * schema 2 (EN+JP: base={lang→{field→url}}, cards[id]=[lang, ...keys] shifted right by one). The
 * live manifest is schema 2 — reading it as schema 1 returns null for every card, which is what was
 * forcing this endpoint to always fall back to the generic cover image. */
function manifestUrl(manifest, id, field) {
  if (!manifest || !id) return null;
  const i = manifest.fields.indexOf(field);
  if (i < 0) return null;
  const entry = manifest.cards[id];
  if (!entry) return null;
  if (manifest.schema === 2) {
    const lang = entry[0]; // 'en' | 'ja'
    const key = entry[i + 1]; // keys shift right by one for the leading lang tag
    const base = manifest.base[lang] && manifest.base[lang][field];
    return key && base ? `${base}/${key}` : null;
  }
  const key = entry[i];
  const base = manifest.base[field];
  return key && base ? `${base}/${key}` : null;
}

/** A custom-artwork source worth trying, or null. Format is decided later, from the bytes. */
function artUrl(u) {
  if (typeof u !== 'string' || !u) return null;
  if (/^data:image\/svg\+xml[,;]/i.test(u)) return u; // Satori rasterises SVG data URIs itself
  if (/^data:/i.test(u)) return null;
  return /^https?:\/\//i.test(u) ? u : null;
}

/**
 * PNG/JPEG magic numbers — the ONLY reliable format check for slot art. Filenames and
 * content-types both lie here: the `binder-art` bucket holds AVIF bytes stored under a `.jpg`
 * name and served as `image/jpeg` (whatever the import source handed over). Satori decodes
 * PNG/JPEG but not WebP/AVIF, and it doesn't throw on one it can't read — it silently draws
 * nothing, leaving a black pocket. So anything else is skipped and reads as an empty pocket.
 */
function sniffImage(b) {
  if (b.length > 3 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'image/png';
  }
  if (b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Bytes → data URI. Chunked: `fromCharCode(...bytes)` overflows the stack on a real image. */
function toDataUri(type, bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(s)}`;
}

const MAX_ART_BYTES = 4 * 1024 * 1024;

/**
 * url → inlineable data URI, for every distinct artwork on the chosen pages. Fetched here
 * rather than left to Satori so the bytes can be sniffed first (see `sniffImage`) — and so a
 * 404 or a slow host costs one empty pocket instead of the whole render.
 */
async function loadArt(pages) {
  const urls = new Set();
  for (const page of pages) {
    for (const s of page.binder_slots || []) {
      if (s.card_id || s.slot_type !== 'artwork') continue;
      const u = artUrl(s.image_url);
      if (u) urls.add(u);
    }
  }
  const out = new Map();
  await Promise.all(
    [...urls].map(async (u) => {
      if (u.startsWith('data:')) return void out.set(u, u);
      try {
        const res = await fetch(u);
        if (!res.ok) return;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length > MAX_ART_BYTES) return;
        const type = sniffImage(bytes);
        if (type) out.set(u, toDataUri(type, bytes));
      } catch {
        /* leave the pocket empty */
      }
    }),
  );
  return out;
}

/** What a slot draws: a manifest card image, or its own artwork. null = empty pocket. */
function slotArt(slot, manifest, art) {
  if (!slot) return null;
  if (slot.card_id) {
    const src = manifestUrl(manifest, slot.card_id, 'image');
    // `hero` = an 'artwork' slot holding a CARD (card art used as full-bleed art, no pocket frame).
    return src ? { src, hero: slot.slot_type === 'artwork' } : null;
  }
  if (slot.slot_type !== 'artwork') return null;
  const key = artUrl(slot.image_url);
  const src = key && art ? art.get(key) : null;
  if (!src) return null;
  return {
    src,
    artwork: true,
    crop: slot.image_crop,
    fit: slot.image_fit,
    xform: slot.image_transform,
  };
}

// A pocket counts as filled if it draws anything — an art-only page is as much a page as a
// card one, and ranking by card count alone would skip it.
const filledCount = (page) =>
  (page.binder_slots || []).filter((s) => s.card_id || s.image_url).length;
const pageCells = (page) => (page.cols || 3) * (page.rows || 3);

/**
 * The page(s) to show. Prefer an OPEN SPREAD (the two fullest pages, in page order) —
 * more art, and it fills the wide frame — falling back to a single page. The spread is
 * capped at ~18 pockets total so a render never fetches an unreasonable pile of
 * full-size card JPEGs.
 */
function pickPages(binder) {
  const pages = (binder.binder_pages || []).slice().sort((a, b) => a.position - b.position);
  // Owner-chosen featured pages (up to 2), when set. RLS already filtered the fetch to PUBLIC pages,
  // so a hidden/deleted selection just isn't found here; require a filled pocket so a blank pick
  // falls through to the auto choice below.
  const chosenIds = Array.isArray(binder.share_page_ids) ? binder.share_page_ids : null;
  if (chosenIds && chosenIds.length) {
    const chosen = pages.filter((p) => chosenIds.includes(p.id) && filledCount(p) > 0).slice(0, 2);
    if (chosen.length) return chosen; // already in position order
  }
  const withCards = pages.filter((p) => filledCount(p) > 0);
  if (withCards.length === 0) return [];
  if (withCards.length === 1) return [withCards[0]];
  const topTwo = withCards.slice().sort((a, b) => filledCount(b) - filledCount(a)).slice(0, 2);
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

/**
 * The <img> for one pocket, sized to the cw×ch box.
 *
 * A sliced artwork carries a normalised crop window {x,y,w,h} in SOURCE space: the image is
 * blown up to box/crop and offset so this pocket shows just its sub-rectangle — which is what
 * makes one wordart read as three pieces across three pockets. Mirrors `ArtworkImage` in
 * `src/components/binder/BinderGrid.tsx`; keep the two in step.
 */
function slotImage(art, boxW, boxH, spanning) {
  const { src, crop, fit, xform } = art;
  if (!art.artwork) {
    // A card image. Framed pockets letterbox it (the box is card-shaped, so this is a no-op
    // there); a spanning hero-art slot covers its box edge-to-edge — matching `SlotBody`.
    return h('img', {
      src,
      width: boxW,
      height: boxH,
      style: { objectFit: art.hero && spanning ? 'cover' : 'contain' },
    });
  }
  const contain = fit === 'contain'; // whole image, letterboxed — a crop window doesn't apply
  const usable = !contain && crop && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(crop[k]));
  if (!usable) {
    return h('img', {
      src,
      width: boxW,
      height: boxH,
      style: { objectFit: contain ? 'contain' : 'cover' },
    });
  }
  // Clamp the divisor: a degenerate slice (w≈0) would size the image to hundreds of thousands
  // of px and hang the render.
  const kw = Math.max(0.05, crop.w);
  const kh = Math.max(0.05, crop.h);
  const w = Math.round(boxW / kw);
  const hgt = Math.round(boxH / kh);
  const left = Math.round(-(crop.x / kw) * boxW);
  const top = Math.round(-(crop.y / kh) * boxH);
  const rot = (xform && xform.rot) || 0;
  if (!rot && !(xform && (xform.flipH || xform.flipV))) {
    return h('img', {
      src,
      width: w,
      height: hgt,
      style: { position: 'absolute', left, top, objectFit: 'cover' },
    });
  }
  // Transformed slice: a quarter turn swaps the element's width and height, so it's laid out
  // pre-rotation and centre-rotated into place. Slice Studio windows are aspect-true here, so
  // stretching to the box ('fill') is exact.
  const quarter = rot === 90 || rot === 270;
  const parts = [`rotate(${rot}deg)`];
  if (xform.flipH) parts.push('scaleX(-1)');
  if (xform.flipV) parts.push('scaleY(-1)');
  return h('img', {
    src,
    width: quarter ? hgt : w,
    height: quarter ? w : hgt,
    style: {
      position: 'absolute',
      left: quarter ? Math.round(left + (w - hgt) / 2) : left,
      top: quarter ? Math.round(top + (hgt - w) / 2) : top,
      objectFit: 'fill',
      transform: parts.join(' '),
    },
  });
}

/** One pocket: a positioned box, tinted by what it holds, clipping its image. */
function pocket(left, top, w, hgt, art, spanning) {
  return h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'absolute',
        left,
        top,
        width: w,
        height: hgt,
        borderRadius: 9 * S,
        overflow: 'hidden',
        // Artwork is often a transparent PNG, and the app backs it with the dark
        // `Palette.chromeDeep` panel — light art on a light pocket would vanish.
        backgroundColor: !art ? 'rgba(120,116,108,0.10)' : art.artwork ? '#11111a' : '#e9e4da',
      },
    },
    art ? slotImage(art, w, hgt, spanning) : null,
  );
}

/**
 * One page's pockets at a fixed card size.
 *
 * Laid out as absolutely-positioned boxes on a `cols`×`rows` step grid rather than nested flex
 * rows, so `row_span`/`col_span` are honoured: a spanning slot gets one box covering its whole
 * footprint (a 2×2 jumbo reads as one card, a 1×2 sliced artwork gets the two-pocket-wide box
 * its crop window was cut for). Same model as `box()` in BinderGrid.tsx, minus the caption
 * strip this frame doesn't draw. Cells no slot covers get the empty-pocket tint.
 */
function pageGrid(page, cw, ch, manifest, art) {
  const cols = page.cols || 3;
  const rows = page.rows || 3;
  const colStep = cw + GAP;
  const rowStep = ch + GAP;
  const covered = new Set();
  const boxes = [];
  for (const s of page.binder_slots || []) {
    const r = Math.trunc(s.row_index);
    const c = Math.trunc(s.col_index);
    if (!(r >= 0 && r < rows && c >= 0 && c < cols)) continue; // stale slot outside the grid
    // Clamp to the page: a span reaching past the edge would otherwise draw outside the mat.
    const rs = Math.max(1, Math.min(Math.trunc(s.row_span) || 1, rows - r));
    const cs = Math.max(1, Math.min(Math.trunc(s.col_span) || 1, cols - c));
    for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) covered.add(`${r + i}:${c + j}`);
    boxes.push(
      pocket(
        c * colStep,
        r * rowStep,
        cs * cw + (cs - 1) * GAP,
        rs * ch + (rs - 1) * GAP,
        slotArt(s, manifest, art),
        rs > 1 || cs > 1,
      ),
    );
  }
  const empties = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!covered.has(`${r}:${c}`)) empties.push(pocket(c * colStep, r * rowStep, cw, ch, null));
    }
  }
  return h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        width: cols * cw + (cols - 1) * GAP,
        height: rows * ch + (rows - 1) * GAP,
      },
    },
    [...empties, ...boxes], // empties first so a slot always paints over the tint
  );
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

// Brand colours as the shipped og.png draws them (scripts/brand-assets.mjs) rather than as the
// app's `Palette.accent` (#2F6FED) — this image belongs to the same family of cream share cards.
const BRAND_ACCENT = '#3B82F6';
const BRAND_POCKET = '#cfc7b7'; // a shade darker than og.png's mark, which is drawn far larger
const MARK = 30 * S; // the mark's edge
const BRAND_W = 190 * S; // reserved on BOTH sides of the footer, so the disclaimer stays centred

/**
 * The michi-maker mark: a 3×3 pocket grid with one piece of art spanning two pockets — the
 * signature michi move, drawn as geometry, so the stamp costs no image fetch and can't fail the
 * way a fetched logo could.
 *
 * A THIRD copy of a shape that already lives in src/components/brand/LogoMark.tsx (Views) and
 * scripts/brand-assets.mjs (HTML/CSS); Satori shares a runtime with neither. Same proportions —
 * gap = size/12, radius = 24% of a cell — so keep all three in step if the mark changes.
 * Absolutely positioned rather than nested flex rows for the same reason `pageGrid` is: it's the
 * layout model Satori is reliable at, and the spanning tile falls out of it for free.
 */
function logoMark(size) {
  const gap = Math.max(1, Math.round(size / 12));
  const cell = (size - gap * 2) / 3;
  const radius = Math.max(1, cell * 0.24);
  const stepPx = cell + gap;
  const tile = (left, top, w, color) =>
    h('div', {
      style: {
        display: 'flex',
        position: 'absolute',
        left,
        top,
        width: w,
        height: cell,
        borderRadius: radius,
        backgroundColor: color,
      },
    });
  const tiles = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c < 2) continue; // the two pockets the spanning art covers
      tiles.push(tile(c * stepPx, r * stepPx, cell, BRAND_POCKET));
    }
  }
  tiles.push(tile(0, stepPx, cell * 2 + gap, BRAND_ACCENT));
  return h(
    'div',
    { style: { display: 'flex', position: 'relative', width: size, height: size } },
    tiles,
  );
}

/** Mark + wordmark, so the image still says where it came from once it's out of the app. */
const brand = () =>
  h('div', { style: { display: 'flex', alignItems: 'center', width: BRAND_W } }, [
    logoMark(MARK),
    h(
      'div',
      {
        style: { display: 'flex', marginLeft: 11 * S, fontSize: 17 * S, color: 'rgba(70,58,42,0.80)' },
      },
      'michi-maker.com',
    ),
  ]);

/**
 * Content over a footer of [brand | disclaimer | spacer]. The empty spacer is load-bearing: it
 * matches the brand's width so the disclaimer stays centred on the FRAME, not on the space left
 * over beside the logo.
 *
 * The footer is the only thing between the mat and the bottom edge and the mat's height is a
 * fixed constant, so the disclaimer dropped from 16 to 14 to pay for the width the brand takes.
 * At 16 it would have wrapped to a third line in the narrower column and pushed the mat off the
 * frame; at 14 it holds two lines with headroom to spare.
 */
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
            paddingLeft: 40 * S,
            paddingRight: 40 * S,
            paddingBottom: 12 * S,
          },
        },
        [
          brand(),
          h(
            'div',
            {
              style: {
                display: 'flex',
                flex: 1,
                textAlign: 'center',
                fontSize: 14 * S,
                lineHeight: 1.3,
                color: 'rgba(70,58,42,0.62)',
              },
            },
            DISCLAIMER,
          ),
          h('div', { style: { display: 'flex', width: BRAND_W } }),
        ],
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

/**
 * A small, heavily blurred JPEG of one card, as a data URI, to sit behind a single page.
 *
 * Blurred at LOW resolution ON PURPOSE: enlarging an already-blurred 560px image is
 * indistinguishable from blurring the full-size one and costs a fraction of the time. The result
 * is a few KB, so it inlines without meaningfully changing the response size.
 *
 * Returns null on any failure — a missing backdrop just means the plain cream frame, never a
 * failed render.
 */
async function blurBackdrop(src) {
  if (!src) return null;
  try {
    const bytes = src.startsWith('data:')
      ? Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
      : Buffer.from(await (await fetch(src)).arrayBuffer());
    const out = await sharp(bytes)
      .resize(560, 470, { fit: 'cover' })
      .blur(22)
      .modulate({ brightness: 1.06, saturation: 1.15 })
      .jpeg({ quality: 62 })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Whatever this page can offer as backdrop art: a card image, else a custom artwork. */
function backdropSource(page, manifest, art) {
  const slots = page.binder_slots || [];
  const card = slots.find((s) => s.card_id && manifestUrl(manifest, s.card_id, 'image'));
  if (card) return manifestUrl(manifest, card.card_id, 'image');
  for (const s of slots) {
    const key = artUrl(s.image_url);
    const inlined = key && art ? art.get(key) : null;
    if (inlined) return inlined;
  }
  return null;
}

const SINGLE_LEGAL_SIZE = 12 * S;
// Held to a deliberately narrow measure so the disclaimer breaks into three even, centred lines.
// A short measure is what makes centred text read as a caption rather than a stray sentence.
const SINGLE_MEASURE = Math.round(SINGLE_W * 0.62);
const SINGLE_LEGAL_BAND = Math.round(3 * SINGLE_LEGAL_SIZE * 1.38 + 22 * S);

/**
 * One page on the narrow canvas, over a blurred enlargement of its own art.
 *
 * The brand lockup is centred in the band ABOVE the page, and that band's height is DERIVED from
 * the mat rather than set as a padding — so the lockup stays optically centred between the top
 * edge and the top of the page whatever shape the page turns out to be (a 2-row page and a 4-row
 * page do not share a magic number).
 */
function singleFrame(page, manifest, art, backdrop) {
  const cols = page.cols || 3;
  const rows = page.rows || 3;
  const { cw, ch } = cardSize(cols, rows, 540 * S, 455 * S);
  const matH = rows * ch + (rows - 1) * GAP + 36 * S; // + the mat's own padding
  const below = 24 * S; // a little air between the page and the disclaimer
  const topBand = Math.max(70 * S, SINGLE_H - SINGLE_LEGAL_BAND - matH - below);
  const layers = [];
  if (backdrop) {
    layers.push(
      h('img', {
        src: backdrop,
        width: SINGLE_W,
        height: SINGLE_H,
        style: { position: 'absolute', left: 0, top: 0, objectFit: 'cover' },
      }),
      // Scrim: the text has to stay readable over whatever art happens to land behind it.
      h('div', {
        style: {
          display: 'flex',
          position: 'absolute',
          left: 0,
          top: 0,
          width: SINGLE_W,
          height: SINGLE_H,
          backgroundColor: 'rgba(250,246,239,0.34)',
        },
      }),
    );
  }
  layers.push(
    h(
      'div',
      {
        style: {
          display: 'flex',
          position: 'absolute',
          left: 0,
          top: 0,
          width: SINGLE_W,
          height: SINGLE_H,
          flexDirection: 'column',
        },
      },
      [
        h(
          'div',
          { style: { display: 'flex', height: topBand, alignItems: 'center', justifyContent: 'center' } },
          h('div', { style: { display: 'flex', alignItems: 'center' } }, [
            logoMark(28 * S),
            h(
              'div',
              { style: { display: 'flex', marginLeft: 11 * S, fontSize: 17 * S, color: 'rgba(45,36,24,0.88)' } },
              'michi-maker.com',
            ),
          ]),
        ),
        h(
          'div',
          { style: { display: 'flex', flex: 1, alignItems: 'flex-start', justifyContent: 'center' } },
          mat(pageGrid(page, cw, ch, manifest, art), -1.5),
        ),
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'center', paddingBottom: 22 * S } },
          h(
            'div',
            {
              style: {
                display: 'flex',
                width: SINGLE_MEASURE,
                textAlign: 'center',
                fontSize: SINGLE_LEGAL_SIZE,
                lineHeight: 1.38,
                color: 'rgba(45,36,24,0.72)',
              },
            },
            DISCLAIMER,
          ),
        ),
      ],
    ),
  );
  return h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        width: SINGLE_W,
        height: SINGLE_H,
        background: 'linear-gradient(135deg, #FAF6EF 0%, #EFE7D9 100%)',
      },
    },
    layers,
  );
}

function compose(pages, manifest, art) {
  if (pages.length >= 2) {
    // Open spread: shared card size so both pages align; sized to a half-frame box.
    const cols = Math.max(pages[0].cols || 3, pages[1].cols || 3);
    const rows = Math.max(pages[0].rows || 3, pages[1].rows || 3);
    const { cw, ch } = cardSize(cols, rows, 470 * S, 520 * S);
    const spineH = rows * ch + (rows - 1) * GAP;
    return frame(
      mat(
        [
          pageGrid(pages[0], cw, ch, manifest, art),
          spine(spineH),
          pageGrid(pages[1], cw, ch, manifest, art),
        ],
        -1,
      ),
    );
  }
  const page = pages[0];
  const { cw, ch } = cardSize(page.cols || 3, page.rows || 3, 760 * S, 540 * S);
  return frame(mat(pageGrid(page, cw, ch, manifest, art), -1.5));
}

/**
 * Rasterise, then re-encode. If sharp ever fails, the PNG still ships — big beats nothing.
 *
 * `single` comes from the URL, not from counting pages here: whoever wrote the meta tags already
 * committed to a width and a height, and the render must match what was declared. So when the
 * narrow canvas is asked for, only the first page is drawn even if `pickPages` found two.
 */
async function render(pages, manifest, art, single) {
  // @vercel/og is ESM-only and this file is CJS; the import is cached after the first invocation.
  const { ImageResponse } = await import('@vercel/og');
  const node = single
    ? singleFrame(pages[0], manifest, art, await blurBackdrop(backdropSource(pages[0], manifest, art)))
    : compose(pages, manifest, art);
  const png = Buffer.from(
    await new ImageResponse(node, {
      width: single ? SINGLE_W : W,
      height: single ? SINGLE_H : H,
    }).arrayBuffer(),
  );
  try {
    return { body: await sharp(png).jpeg(JPEG).toBuffer(), type: 'image/jpeg' };
  } catch {
    return { body: png, type: 'image/png' };
  }
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  // The shape the meta tags committed to. Only the two known canvases are honoured, so a hand-typed
  // width can't make this render something no og:image:width ever declared.
  const single = String((req.query && req.query.w) || '') === String(SINGLE_W);
  let cover = `${SITE}/og.png`;
  try {
    if (id) {
      const [binder, manifest] = await Promise.all([fetchBinder(id), fetchManifest()]);
      if (binder) {
        cover = manifestUrl(manifest, binder.cover_card_id, 'image') || cover;
        const pages = pickPages(binder);
        const art = await loadArt(pages);
        // Only compose when at least one pocket actually resolves to an image — otherwise
        // an all-blank page is worse than the cover fallback.
        const anyImage = pages.some((page) =>
          (page.binder_slots || []).some((s) => slotArt(s, manifest, art)),
        );
        if (pages.length && anyImage) {
          const { body, type } = await render(pages, manifest, art, single);
          res.setHeader('content-type', type);
          res.setHeader('cache-control', CACHE);
          return res.end(body);
        }
      }
    }
  } catch {
    // fall through to the cover fallback
  }
  // Serve the fallback as a real 200 image, NOT a 302 redirect: Discord (and some other scrapers)
  // don't follow redirects on og:image, so a redirect reads as "no preview image" — which is what
  // made shares show no image whenever the composer fell back.
  try {
    const r = await fetch(cover);
    if (r.ok) {
      res.setHeader('content-type', r.headers.get('content-type') || 'image/png');
      res.setHeader('cache-control', CACHE);
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
  } catch {
    /* fall through to the redirect as a last resort */
  }
  res.statusCode = 302;
  res.setHeader('location', cover);
  return res.end();
};

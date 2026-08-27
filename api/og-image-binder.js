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
// The page choice is shared with the meta endpoint on purpose: og:image:width/height is declared
// there and drawn here, so a second copy of the rule is a preview whose shape can disagree.
const { choosePreviewPages } = require('./_lib');

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

/** The page(s) to show. See choosePreviewPages in api/_lib.js for the rule and its history. */
const pickPages = choosePreviewPages;

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
  'Fan-made tool. Not affiliated with, endorsed by, or sponsored by Nintendo, Creatures, or The Pokémon Company. Card images belong to their respective owners.';

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
function logoMark(size, pocket) {
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
      tiles.push(tile(c * stepPx, r * stepPx, cell, pocket || BRAND_POCKET));
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

/**
 * The page's cream card. `edge` draws a hairline around it, which the banded single-page frame
 * needs and the spread does not: there the mat sits on open cream and its shadow is enough, but
 * over the bands it is cream on cream, so the part of the page that overhangs the header and
 * footer simply disappears. The line is what makes the overhang read as an overhang.
 */
const mat = (children, tilt, edge) =>
  h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        padding: 18 * S,
        borderRadius: 24 * S,
        backgroundColor: '#fbfaf7',
        ...(edge
          ? { borderWidth: MAT_EDGE, borderStyle: 'solid', borderColor: '#000000' }
          : {}),
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
    // Mean colour of the top and bottom strips, so the chrome can be coloured against what is
    // actually behind it. The blurred image and the canvas share an aspect ratio to within 0.1%
    // (560/470 vs 1800/1512) and it is drawn objectFit:cover, so a strip here maps to the same
    // fraction of the canvas. Approximate by design: the blur has no detail for a finer sample to
    // find, and chromeInk only needs the ground it is judging against.
    const strip = async (top, height) => {
      const st = await sharp(out).extract({ left: 0, top, width: 560, height }).stats();
      return st.channels.slice(0, 3).map((c) => c.mean);
    };
    return {
      uri: `data:image/jpeg;base64,${out.toString('base64')}`,
      top: await strip(0, 100),
      bottom: await strip(370, 100),
    };
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
// Held to a measure so the disclaimer breaks into two even, centred lines — wide enough to avoid a
// stubby third line, narrow enough that centred text still reads as a caption rather than a
// sentence stretched wall to wall. At this size the text runs ~15px per character, so ~80
// characters per line need ~1200px; 0.74 of the canvas leaves slack for the word breaks.
const SINGLE_MEASURE = Math.round(SINGLE_W * 0.74);
const SINGLE_LEGAL_LINES = 2;
// Derived, not guessed: `singleFrame` sizes the band above the page from what is left after this,
// so a wrong line count here moves the brand lockup off centre.
const SINGLE_LEGAL_BAND = Math.round(SINGLE_LEGAL_LINES * SINGLE_LEGAL_SIZE * 1.38 + 22 * S);

/**
 * The single-page frame's chrome, settled 2026-08-27 after rendering five variants through this
 * same path (scripts/og-preview.mjs).
 *
 * THE PROBLEM. The mark is a 3x3 grid of pale cream pockets and the backdrop is an enlargement of
 * whatever art the page holds, so over a light busy blur the mark's nine tiles and the caption
 * beneath it all but vanish. At Discord's ~550px that chrome is the one part of the image that has
 * to survive being seen.
 *
 * WHAT WAS REJECTED, and why it is worth recording. Opaque bands behind the header and footer fix
 * the contrast completely, and so does deepening the scrim until any ink reads. Both work by
 * covering the blurred collage, which is the thing this frame exists to show (owner call: do not
 * sacrifice a good blurred background collage). So the scrim stays where it is and the CHROME
 * adapts instead.
 *
 * HOW THE GUARANTEE WORKS. We render the blur ourselves, so we can measure the strip each piece of
 * chrome sits on and pick whichever ink, near-black or near-white, scores higher against it. Two
 * inks at opposite ends of the range mean the worst case is a mid-grey ground, where the better of
 * the two still clears about 3:1; where the winner lands under MIN_CONTRAST a halo in the opposing
 * colour separates the glyphs from the art without hiding any of it.
 */
const CREAM = [250, 246, 239];
const INK_DARK = [38, 30, 20];
const INK_LIGHT = [253, 252, 249];
/** WCAG AA for large text. Below this the lockup stops being legible at the size it is displayed. */
const MIN_CONTRAST = 4.5;
const MAT_EDGE = Math.round(2 * S);
/** Opaque enough to be a ground of its own; the 6% of art left showing keeps it from reading flat. */
const BAND_FILL_ALPHA = 0.94;
const BAND_FILL = `rgba(250,246,239,${BAND_FILL_ALPHA})`;

/**
 * Which of the two treatments a render gets: the blurred collage edge to edge, or opaque cream
 * bands behind the header and footer. Owner call 2026-08-27, having liked both: flip a coin, every
 * time the image is rendered, which in practice means every time a share preview is warmed.
 *
 * A FRESH FLIP PER RENDER, not a stable assignment per binder. That is the ask, and the reasoning
 * is that this is shaped like an A/B test without being one: nothing is being measured, so there is
 * no arm to keep anyone in and no result to protect.
 *
 * The consequence, said once here so nobody rediscovers it as a bug: the image is cached per URL,
 * so a binder wears whichever face it drew until that cache entry is replaced, and a later re-warm
 * can hand an already-shared link the other one. A link's look is therefore not a promise. Both
 * faces are held to the same contrast guarantee (see chromeInk), so whichever one it lands on is
 * legible; only the styling is left to chance.
 */
const flipChrome = () => (Math.random() < 0.5 ? 'collage' : 'bands');

/** WCAG relative luminance. */
function relLum(rgb) {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
const contrastRatio = (a, b) => {
  const pair = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (pair[0] + 0.05) / (pair[1] + 0.05);
};
const blend = (over, under, alpha) => under.map((c, i) => Math.round(over[i] * alpha + c * (1 - alpha)));

/**
 * Ink for a piece of chrome sitting on `bg`, the mean colour of the blurred strip behind it, seen
 * through the frame's cream scrim.
 *
 * Never touches the backdrop. Returns the better of the two inks, a pocket colour for the mark a
 * step softer than the ink (so the grid reads as a mark rather than nine solid blocks), and a halo
 * that is null whenever the ink already clears MIN_CONTRAST on its own.
 */
function chromeInk(bg, scrim) {
  const ground = blend(CREAM, bg, scrim);
  const dark = contrastRatio(INK_DARK, ground);
  const light = contrastRatio(INK_LIGHT, ground);
  const useDark = dark >= light;
  const ratio = Math.max(dark, light);
  const halo = useDark ? INK_LIGHT : INK_DARK;
  return {
    ink: 'rgb(' + (useDark ? INK_DARK : INK_LIGHT).join(',') + ')',
    pocket: useDark ? '#6f6656' : '#efe9dd',
    // Alpha rises with the shortfall, so a near miss gets a whisper and a mid-grey ground gets a
    // real edge. Only ever drawn when the ink needs the help.
    halo:
      ratio >= MIN_CONTRAST
        ? null
        : '0 0 ' + Math.round(6 * S) + 'px rgba(' + halo.join(',') + ',' +
          Math.min(0.95, 0.45 + (MIN_CONTRAST - ratio) * 0.3).toFixed(2) + ')',
    ratio,
  };
}

/**
 * One page on the narrow canvas, over a blurred enlargement of its own art.
 *
 * The brand lockup is centred in the band ABOVE the page, and that band's height is DERIVED from
 * the mat rather than set as a padding — so the lockup stays optically centred between the top
 * edge and the top of the page whatever shape the page turns out to be (a 2-row page and a 4-row
 * page do not share a magic number).
 */
const SCRIM = 0.34;

function singleFrame(page, manifest, art, backdrop, chrome) {
  const bands = chrome === 'bands';
  // The SAME measurement serves both faces; only the ground differs. Under bands the chrome sits
  // on 94% cream, so this reliably returns the dark ink at about 11:1 — which is the point: the
  // band face is not exempt from the guarantee, it simply always passes it.
  const groundScrim = bands ? BAND_FILL_ALPHA : SCRIM;
  // With no backdrop the frame is flat cream, where the dark ink already reads at about 12:1, so
  // the fallback needs no measurement.
  const flat = { ink: 'rgb(38,30,20)', pocket: BRAND_POCKET, halo: null };
  const topInk = backdrop ? chromeInk(backdrop.top, groundScrim) : flat;
  const botInk = backdrop ? chromeInk(backdrop.bottom, groundScrim) : flat;
  const cols = page.cols || 3;
  const rows = page.rows || 3;

  // ── vertical geometry, derived rather than clamped ──────────────────────────────────────
  //
  // Everything below hangs off ONE fixed point: the disclaimer's top edge, which sits at
  // SINGLE_H - SINGLE_LEGAL_BAND no matter what the band does (the band's padding pushes its own
  // top up, never the text down). From there:
  //
  //   page bottom = text top - FOOTER_CLEARANCE      (so the gap is exactly FOOTER_CLEARANCE)
  //   band top    = page bottom - FOOTER_OVERHANG    (so the page laps over it by that much)
  //   top band    = page bottom - matH               (whatever is left above the page)
  //
  // WHY THE PAGE IS SIZED TO FIT RATHER THAN CLAMPED. This used to read
  // `Math.max(70 * S, SINGLE_H - ... - matH - below)`, with the card box capped at a fixed height.
  // On a tall page the computed band went under the floor, the floor won, and the mat was pushed
  // DOWN by the difference — straight through the disclaimer. The clamp silently spent the
  // clearance, so adding more clearance did nothing, which is exactly how it presented. Sizing the
  // card grid to the room that actually exists means the floor can never bind and the three lines
  // above hold for every page shape.
  const FOOTER_CLEARANCE = 30 * S;
  const FOOTER_OVERHANG = 26 * S;
  const MIN_TOP_BAND = 70 * S;
  const TEXT_TOP = SINGLE_H - SINGLE_LEGAL_BAND;
  const pageBottom = TEXT_TOP - FOOTER_CLEARANCE;
  // The mat's own padding and hairline, both sides of each, are not available to the cards.
  const matChrome = 36 * S + 2 * MAT_EDGE;
  const { cw, ch } = cardSize(cols, rows, 540 * S, pageBottom - MIN_TOP_BAND - matChrome);
  const matH = rows * ch + (rows - 1) * GAP + matChrome;
  const topBand = pageBottom - matH;
  const bandBottomH = SINGLE_LEGAL_BAND + FOOTER_CLEARANCE + FOOTER_OVERHANG;
  const layers = [];
  if (backdrop) {
    layers.push(
      h('img', {
        src: backdrop.uri,
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
          backgroundColor: `rgba(250,246,239,${SCRIM})`,
        },
      }),
    );
  }
  // The bands are drawn HERE, as layers beneath the content, and deliberately not as backgrounds
  // on the header and footer rows.
  //
  // As a row background the footer painted AFTER the page, and BAND_FILL is 94% cream, so the part
  // of the page overhanging it kept its cream body (cream over cream, no difference) while its
  // black edge came through at 6% and vanished. The header looked right only by accident of being
  // an earlier sibling. Underneath both, the page overhangs both bands with its edge intact, which
  // is the whole point of the treatment: a page laid over the frame, not slotted between two strips.
  if (bands) {
    const band = (edge, height) =>
      h('div', {
        style: {
          display: 'flex',
          position: 'absolute',
          left: 0,
          [edge]: 0,
          width: SINGLE_W,
          height,
          backgroundColor: BAND_FILL,
        },
      });
    layers.push(band('top', topBand), band('bottom', bandBottomH));
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
          {
            style: {
              display: 'flex',
              height: topBand,
              alignItems: 'center',
              justifyContent: 'center',
            },
          },
          h(
            'div',
            {
              style: { display: 'flex', alignItems: 'center' },
            },
            [
              logoMark(28 * S, topInk.pocket),
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    marginLeft: 11 * S,
                    fontSize: 17 * S,
                    color: topInk.ink,
                    ...(topInk.halo ? { textShadow: topInk.halo } : {}),
                  },
                },
                'michi-maker.com',
              ),
            ],
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', flex: 1, alignItems: 'flex-start', justifyContent: 'center' } },
          mat(pageGrid(page, cw, ch, manifest, art), -1.5, true),
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'center',
              paddingBottom: 22 * S,
              // Matches the bottom band's height above; the band is painted beneath, so this only
              // reserves the room the page laps into.
              ...(bands ? { paddingTop: FOOTER_CLEARANCE + FOOTER_OVERHANG } : {}),
              // Fixed, so the footer row cannot take height from the middle row and shift the page
              // off the geometry above. Without this the row grows with its padding and the mat
              // lands somewhere the three lines of arithmetic never predicted.
              height: bands ? bandBottomH : SINGLE_LEGAL_BAND,
            },
          },
          h(
            'div',
            {
              style: {
                display: 'flex',
                width: SINGLE_MEASURE,
                textAlign: 'center',
                fontSize: SINGLE_LEGAL_SIZE,
                lineHeight: 1.38,
                color: botInk.ink,
                ...(botInk.halo ? { textShadow: botInk.halo } : {}),
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
async function render(pages, manifest, art, single, chrome) {
  // @vercel/og is ESM-only and this file is CJS; the import is cached after the first invocation.
  const { ImageResponse } = await import('@vercel/og');
  const node = single
    ? singleFrame(
        pages[0],
        manifest,
        art,
        await blurBackdrop(backdropSource(pages[0], manifest, art)),
        chrome || flipChrome(),
      )
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

// Tooling seam for scripts/og-preview.mjs, which renders a binder's real share image to a file so
// a design change can be judged on the shipping path rather than on a mock. Not reachable from the
// handler.
module.exports.__tooling = {
  fetchBinder,
  fetchManifest,
  pickPages,
  loadArt,
  render,
  blurBackdrop,
  backdropSource,
  chromeInk,
  flipChrome,
  SCRIM,
};

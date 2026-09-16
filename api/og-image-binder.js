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
 *  - The only text is the brand stamp (mark + michi-maker.com); no disclaimer since r12, both
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
const S = Number(process.env.OG_SCALE) || 2.4;
// The spread canvas is 1.7:1 since r12 (was 1.91:1): the pages' height binds, so the extra width
// was empty cream either side. Keep in step with OG_SPREAD in api/_lib.js.
const W = Math.round(1070 * S); // 2568 — ImageResponse needs integer dimensions
const H = Math.round(630 * S); // 1512

// A SINGLE page is a different shape of problem. A 3×3 page is about 0.75:1, so scaled to the full
// height of a 1.9:1 frame it can only occupy about a third of the width — roughly two thirds of a
// single-page render was empty. This narrower canvas is sized to the page instead, and what space
// is left is filled by a blurred enlargement of the page's own art rather than left blank.
//
// SPREADS ARE UNCHANGED and still render at W×H: two facing pages genuinely need the width.
// Which shape is used is decided by api/og-binder.js and passed in the URL (see `ogImageUrl`), so
// the og:image:width/height it declares and what this renders can never disagree.
const SINGLE_W = Math.round(750 * S); // 1800 at the default scale
const SINGLE_H = Math.round(630 * S); // 1512

// JPEG settings. 4:4:4 (no chroma subsampling) costs ~0.2MB over 4:2:0 and is worth it here: the
// frame is dense small card text and saturated red/blue art edges, which is precisely what
// subsampling smears. mozjpeg is what gets it back under a megabyte.
const JPEG = { quality: Number(process.env.OG_JPEG_QUALITY) || 88, progressive: true, mozjpeg: true, chromaSubsampling: '4:4:4' };
/** Unsharp-mask radius applied before the JPEG (see `render`); 0 turns it off. */
const SHARPEN = process.env.OG_SHARPEN === undefined ? 0.8 : Number(process.env.OG_SHARPEN) || 0;
const CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400';
// THE EDITOR'S NUMBERS (2026-09-15): 10px between pockets, a 14px page margin, a 16px page radius
// and an 8px pocket radius, all times S, so the share image, the poster and the quick look draw
// the page the way the editor and the shelf draw it. Keep in step with binderLayout PAD/GAP and
// theme Radii.
const GAP = 10 * S;
const PAGE_PAD = 14 * S;
const PAGE_RADIUS = 16 * S;
const POCKET_RADIUS = 8 * S;
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
  const slots = 'row_index,col_index,row_span,col_span,card_id,slot_type,image_url,image_fit,image_crop,image_transform';
  const base = `title,cover_card_id,binder_pages(id,position,rows,cols,binder_slots(${slots}))`;
  // THE LOOK (v2, 2026-09-15): the binder's page style and each page's and pocket's own colours,
  // for the render that draws them. Tried first; an older schema 400s it and the plain select
  // below still serves v1.
  const looked = `title,cover_card_id,page_style,share_backdrop,binder_pages(id,position,rows,cols,background_color,sleeve,art_backing,binder_slots(${slots},sleeve,art_backing))`;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  // Try WITH the featured-pages column first; if the share_page_ids migration hasn't landed yet that
  // select 400s (fetchJson → null), so fall back to the base select. Keeps the composed image working
  // regardless of migration timing — the featured-page selection simply activates once the column
  // exists. (A genuinely private/missing binder returns [] on the first try and resolves to null.)
  // The middle entry keeps the look on a database that has page styles but not yet the backdrop.
  const styled = looked.replace('share_backdrop,', '');
  for (const select of [`share_page_ids,${looked}`, `share_page_ids,${styled}`, `share_page_ids,${base}`, base]) {
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
async function loadArt(pages, binder) {
  const urls = new Set();
  for (const page of pages) {
    for (const s of page.binder_slots || []) {
      if (!s.card_id && s.slot_type === 'artwork') {
        const u = artUrl(s.image_url);
        if (u) urls.add(u);
      }
      // v2: a pocket's own pictured sleeve or backing.
      for (const w of [s.sleeve, s.art_backing]) if (isImageRef(w)) urls.add(w);
    }
    // v2: the page's pictured background, sleeves or backing.
    for (const w of [page.background_color, page.sleeve, page.art_backing]) if (isImageRef(w)) urls.add(w);
  }
  // v2: the binder-wide pictures, and the picture behind the whole share image.
  const ps = binder && binder.page_style;
  if (ps) for (const w of [ps.sleeve, ps.artBacking]) if (isImageRef(w)) urls.add(w);
  if (binder && isImageRef(binder.share_backdrop)) urls.add(binder.share_backdrop);
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

/**
 * One pocket: a positioned box, tinted by what it holds, clipping its image.
 *
 * `wear` (v2) is what the pocket wears: `{ ring, color, image }`. The box becomes a ring `ring`
 * wide in the sleeve or backing colour (or the page's own, which reads as no ring), a pictured
 * sleeve fills it, and the card sits inside. Mirrors the ring in BinderGrid's SlotContent.
 */
function pocket(left, top, w, hgt, art, spanning, wear) {
  const ring = wear ? wear.ring : 0;
  const isCard = art && !art.artwork && !art.hero;
  // A CARD IN THE EDITOR IS TRIMMED (BinderGrid CardImage `trim`): the scan's baked-in white
  // margin falls outside the box and the corners are clipped at 5.2% of the width, so the ring
  // meets the card's own edge. Same here, for the same reason.
  const inner = art
    ? isCard && wear
      ? h(
          'div',
          { style: { display: 'flex', position: 'relative', width: w - ring * 2, height: hgt - ring * 2, overflow: 'hidden', borderRadius: Math.max(POCKET_RADIUS - ring, (w - ring * 2) * 0.052) } },
          h('img', {
            src: art.src,
            width: Math.round((w - ring * 2) * 1.044),
            height: Math.round((hgt - ring * 2) * 1.044),
            style: { position: 'absolute', left: -Math.round((w - ring * 2) * 0.022), top: -Math.round((hgt - ring * 2) * 0.022), objectFit: 'contain' },
          }),
        )
      : slotImage(art, w - ring * 2, hgt - ring * 2, spanning)
    : null;
  const children = [];
  if (wear && wear.image) {
    children.push(
      // Stretched to the pocket, as the app draws a pictured sleeve.
      h('img', { src: wear.image, width: w, height: hgt, style: { position: 'absolute', left: 0, top: 0, objectFit: 'fill' } }),
    );
  }
  if (inner) {
    children.push(
      h(
        'div',
        {
          style: {
            display: 'flex',
            position: 'absolute',
            left: ring,
            top: ring,
            width: w - ring * 2,
            height: hgt - ring * 2,
            borderRadius: Math.max(0, POCKET_RADIUS - ring),
            overflow: 'hidden',
            backgroundColor: art.artwork ? '#11111a' : wear ? 'transparent' : '#e9e4da',
          },
        },
        inner,
      ),
    );
  }
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
        borderRadius: POCKET_RADIUS,
        overflow: 'hidden',
        // The editor's hairline round a card's frame (cardFrame / cardFrameOnFabric), and round
        // an empty pocket; a pictured sleeve takes the edge over.
        ...(wear && !wear.image && (isCard || !art)
          ? { borderWidth: S, borderStyle: 'solid', borderColor: wear.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)' }
          : {}),
        // Artwork is often a transparent PNG, and the app backs it with the dark
        // `Palette.chromeDeep` panel — light art on a light pocket would vanish.
        backgroundColor: !art
          ? wear
            ? wear.empty
            : 'rgba(120,116,108,0.10)'
          : wear
            ? wear.color || 'transparent'
            : art.artwork
              ? '#11111a'
              : '#e9e4da',
      },
    },
    children,
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
function pageGrid(page, cw, ch, manifest, art, look) {
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
    const a = slotArt(s, manifest, art);
    boxes.push(
      pocket(
        c * colStep,
        r * rowStep,
        cs * cw + (cs - 1) * GAP,
        rs * ch + (rs - 1) * GAP,
        a,
        rs > 1 || cs > 1,
        look ? pocketWear(look, s, a, cw) : null,
      ),
    );
  }
  const empties = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!covered.has(`${r}:${c}`)) empties.push(pocket(c * colStep, r * rowStep, cw, ch, null, false, look ? pocketWear(look, null, null, cw) : null));
    }
  }
  const innerW = cols * cw + (cols - 1) * GAP;
  const innerH = rows * ch + (rows - 1) * GAP;
  // v2: the seams between the pockets, a welded run of stitches down every sealed gap (see
  // BinderGrid's Seam and pageStyle's seamLines). The hems are pageMat's.
  const seams = [];
  if (look && look.stitch) {
    const lines = seamLines(rows, cols, look.edge);
    const lean = look.edge === 'left' ? -2 * S : 2 * S;
    for (const i of lines.v) if (i > 0 && i < cols) seams.push(...seamV2(true, i * colStep - GAP / 2 + lean, 0, innerH, look));
    for (const i of lines.h) if (i > 0 && i < rows) seams.push(...seamV2(false, i * rowStep - GAP / 2, 0, innerW, look));
  }
  return h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        width: innerW,
        height: innerH,
      },
    },
    [...empties, ...seams, ...boxes], // empties first so a slot always paints over the tint
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// V2: THE LOOK (2026-09-15). What the binder, the page and the pocket chose in the editor, drawn
// into the share image: background (colour or picture), page style (stitch, double stitch) with
// its thread, the zip with its pull, the spine, sleeves and art backing at every level. Mirrors
// src/data/pageStyle.ts and BinderGrid's PageDressing; keep the numbers in step. v1 draws none of
// it and is untouched: `look` is null there.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
const WEAR_NONE = 'none';
function isImageRef(v) {
  return typeof v === 'string' && /^https?:\/\/\S{1,2000}$/i.test(v);
}
/** The first layer that says anything wins; "none" wins with nothing. */
function resolveWear(...layers) {
  for (const l of layers) {
    if (l === undefined || l === null || l === '') continue;
    return l === WEAR_NONE ? undefined : l;
  }
  return undefined;
}
function luminance(hex) {
  if (!HEX.test(hex || '')) return 1;
  const c = (i) => {
    const x = parseInt(hex.slice(i, i + 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
}
/** The thread as chosen, else cut from the page's lightness. */
function threadInk(mat, thread) {
  const dark = luminance(mat) < 0.35;
  if (!thread || (!thread.color && thread.opacity === undefined)) return dark ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.42)';
  const hex = (HEX.test(thread.color || '') ? thread.color : dark ? '#ffffff' : '#000000').slice(1);
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  return `rgba(${n(0)},${n(2)},${n(4)},${thread.opacity === undefined ? 0.6 : thread.opacity})`;
}
/** v2's plain page is v1's cream, so a binder with no choices renders as it always did. */
const V2_MAT = '#fbfaf7';

/** Everything the drawing needs about one page, resolved once. `edge` is the side away from the spine. */
function pageLook(page, binder, art, edge) {
  const ps = (binder && binder.page_style) || {};
  const details = ps.details || {};
  const bg = page.background_color;
  const bgImage = isImageRef(bg) && art ? art.get(bg) || null : null;
  const mat = HEX.test(bg || '') ? bg : V2_MAT;
  const material = ps.material === 'stitched' ? 'double' : ps.material;
  const stitch = material === 'stitch' || material === 'double' ? material : null;
  const zip = details.zip || (ps.material === 'zip' ? {} : null);
  return {
    mat,
    bgImage,
    rows: page.rows || 3,
    cols: page.cols || 3,
    dark: luminance(mat) < 0.35,
    stitch,
    ink: threadInk(mat, ps.thread),
    zip: zip ? { pull: HEX.test(zip.pull || '') ? zip.pull : '#3fcf5e', wavy: zip.track === 'wavy' } : null,
    spine: details.spine === 'cross' || details.spine === 'ribbed' ? details.spine : null,
    thread: ps.thread,
    edge,
    sleeve: [page.sleeve, ps.sleeve],
    backing: [page.art_backing, ps.artBacking],
    art,
  };
}

/** What one pocket wears, for `pocket()`: the ring width, its colour, and its picture if any. */
function pocketWear(look, slot, a, cw) {
  const ring = Math.max(1, Math.round(cw * 0.015));
  const isArt = a && (a.artwork || a.hero);
  const chosen = slot
    ? isArt
      ? resolveWear(slot.art_backing, look.backing[0], look.backing[1])
      : resolveWear(slot.sleeve, look.sleeve[0], look.sleeve[1])
    : undefined;
  const image = isImageRef(chosen) ? look.art.get(chosen) || null : null;
  const color = image ? undefined : HEX.test(chosen || '') ? chosen : look.mat;
  return { ring, color, image, dark: look.dark, empty: look.dark ? 'rgba(255,255,255,0.10)' : 'rgba(120,116,108,0.10)' };
}

/**
 * ONE SEAM, as BinderGrid's Seam draws it: a faint weld band, and on it one run of stitches (two
 * for a double stitch) as a repeating gradient rather than a div per stitch. `at` is the seam's
 * centreline across the run, `from` where it starts along it. STITCH = pitch 5, dash 3, thick 2.
 */
const STITCH = { pitch: 5 * S, dash: 3 * S, thick: 2 * S };
/**
 * Which grid lines carry a seam, as pageStyle's seamLines: every row boundary, and every column
 * line but the bare gap each pair of columns loads through. `edge` is the page's edge
 * away from the spine.
 */
function seamLines(rows, cols, edge) {
  const outer = edge || 'right';
  // Columns pair off from the outer edge; each pair shares one bare gap (lines 1, 3, 5...).
  const bare = new Set();
  for (let k = 1; k < cols; k += 2) bare.add(outer === 'left' ? k : cols - k);
  const v = [];
  for (let i = 0; i <= cols; i++) if (!bare.has(i)) v.push(i);
  const h = [];
  for (let i = 0; i <= rows; i++) h.push(i);
  return { v, h };
}
function seamV2(vertical, at, from, length, look) {
  const g = STITCH;
  const offsets = look.stitch === 'double' ? [-(g.thick + S), S] : [-g.thick / 2];
  const weldW = look.stitch === 'double' ? g.thick * 2 + 2 * S + 4 * S : g.thick + 4 * S;
  const weld = look.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.045)';
  const lead = (g.pitch - g.dash) / 2;
  const box = (o, size) => (vertical ? { left: at + o, top: from, width: size, height: length } : { top: at + o, left: from, height: size, width: length });
  const out = [h('div', { style: { display: 'flex', position: 'absolute', ...box(-weldW / 2, weldW), backgroundColor: weld, borderRadius: weldW / 2 } })];
  for (const o of offsets) {
    out.push(
      h('div', {
        style: {
          display: 'flex',
          position: 'absolute',
          ...box(o, g.thick),
          borderRadius: g.thick / 2,
          backgroundImage: `repeating-linear-gradient(${vertical ? 180 : 90}deg, transparent 0px, transparent ${lead}px, ${look.ink} ${lead}px, ${look.ink} ${lead + g.dash}px, transparent ${lead + g.dash}px, transparent ${g.pitch}px)`,
        },
      }),
    );
  }
  return out;
}

/** The cloth's weave over a box, as BinderGrid's Weave: hairlines both ways, 4px apart. */
function weaveV2(w, hgt, dark, radius) {
  const thread = dark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.035)';
  const pitch = 4 * S;
  const lead = (pitch - S) / 2;
  const line = (deg) => `repeating-linear-gradient(${deg}deg, transparent 0px, transparent ${lead}px, ${thread} ${lead}px, ${thread} ${lead + S}px, transparent ${lead + S}px, transparent ${pitch}px)`;
  return [90, 180].map((deg) => h('div', { style: { display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: hgt, borderRadius: radius, backgroundImage: line(deg) } }));
}

/**
 * The page's mat, v2: its own colour or picture, its hem or its zip band, and the pull hanging off
 * the bottom outer corner. Same padding and radius as v1's `mat`, so the two versions share a
 * geometry and only the dressing differs.
 */
function pageMat(grid, look, gridW, gridH) {
  const band = PAGE_PAD;
  const radius = PAGE_RADIUS;
  const w = gridW + band * 2;
  const hgt = gridH + band * 2;
  const layers = [];
  if (look.bgImage) {
    layers.push(h('img', { src: look.bgImage, width: w, height: hgt, style: { display: 'flex', position: 'absolute', left: 0, top: 0, objectFit: 'cover', borderRadius: radius } }));
  }
  // The material's vignette, as the app draws it: a light catch top-left, a shade bottom-right.
  if (look.stitch || look.zip) {
    layers.push(
      // The editor's two LinearGradients: (0,0)->(0.6,0.8) and (0.4,0.2)->(1,1), both along the
      // same 143deg diagonal; the second starts 35% of the way in.
      h('div', { style: { display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: hgt, borderRadius: radius, background: 'linear-gradient(143deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 100%)' } }),
      h('div', { style: { display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: hgt, borderRadius: radius, background: `linear-gradient(143deg, rgba(0,0,0,0) 35%, ${look.dark ? 'rgba(0,0,0,0.26)' : 'rgba(0,0,0,0.07)'} 100%)` } }),
    );
  }
  const c = band / 2;
  if (look.stitch || look.zip) layers.push(...weaveV2(w, hgt, look.dark, radius));
  if (look.stitch) {
    // The hems, where seamLines says the sheet is sealed. Top, bottom and outer sit at the band's
    // centre and step aside for a zip; the spine-side seam hugs the inside card column and is
    // drawn zip or no zip, as BinderGrid's PageDressing does.
    const lines = seamLines(look.rows, look.cols, look.edge);
    const spineEdge = look.edge === 'left' ? 'right' : 'left';
    if (!look.zip) {
      if (lines.h.includes(0)) layers.push(...seamV2(false, c, c, w - c * 2, look));
      if (lines.h.includes(look.rows)) layers.push(...seamV2(false, hgt - c, c, w - c * 2, look));
      if (spineEdge !== 'left' && lines.v.includes(0)) layers.push(...seamV2(true, c, c, hgt - c * 2, look));
      if (spineEdge !== 'right' && lines.v.includes(look.cols)) layers.push(...seamV2(true, w - c, c, hgt - c * 2, look));
    }
    const hug = band - 3 * S;
    if (lines.v.includes(spineEdge === 'left' ? 0 : look.cols)) layers.push(...seamV2(true, spineEdge === 'left' ? hug : w - hug, band, hgt - band * 2, look));
  }
  if (look.zip) {
    const TAPE = 8 * S;
    const PITCH = 3 * S;
    const outer = look.edge === 'left' ? 'left' : 'right';
    // The cover band: a ring of heavier, darker fabric with a fine edge where it meets the sheet.
    layers.push(
      h('div', { style: { display: 'flex', position: 'absolute', left: 0, top: 0, width: w, height: hgt, borderRadius: radius, borderWidth: band - 2 * S, borderStyle: 'solid', borderColor: look.dark ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.16)' } }),
      h('div', { style: { display: 'flex', position: 'absolute', left: band - 3 * S, top: band - 3 * S, width: w - (band - 3 * S) * 2, height: hgt - (band - 3 * S) * 2, borderRadius: 4 * S, borderWidth: S, borderStyle: 'solid', borderColor: look.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)' } }),
    );
    // THE COIL, TOOTH BY TOOTH, as PageDressing draws it: a dark tape, and teeth 3px apart in two
    // rows that meet at the tape's centreline, staggered by 2px, with a wavy track drifting the
    // whole coil on a slow sine. Each tooth is 2x4 with a lit top edge (turned for the vertical run).
    // Drawn as TWO REPEATING GRADIENTS per tape rather than a div per tooth: the editor's coil
    // is ~140 teeth a side at this scale, and 840 nodes on a spread pushed the raster past the
    // function's 60 seconds (a 504 is no preview at all). Each gradient is one row of teeth at
    // twice the pitch; the second is shifted by one pitch and sits 2px the other side of the
    // centreline, which is exactly the editor's stagger. A tooth is 2px of #5e5e67 with a 1px
    // lit edge, a shade quieter than the editor's coil: at share size the pale one shouted
    // (owner, 2026-09-15), then dark tape. The wavy drift is the one thing a gradient cannot do; a wavy
    // track shows as a straight coil here.
    const runW = w - (c - TAPE / 2) * 2;
    const runH = hgt - (c - TAPE / 2) * 2;
    const period = 2 * PITCH;
    const toothW = 2 * S;
    const row = (vertical, shift, side) =>
      h('div', {
        style: {
          display: 'flex',
          position: 'absolute',
          ...(vertical
            ? { top: 4 * S, bottom: 0, width: 4 * S, left: TAPE / 2 - 2 * S + side * 2 * S }
            : { left: 4 * S, right: 0, height: 4 * S, top: TAPE / 2 - 2 * S + side * 2 * S }),
          backgroundImage: vertical
            ? `repeating-linear-gradient(180deg, transparent 0px, transparent ${shift}px, #8a8a93 ${shift}px, #8a8a93 ${shift + S}px, #5e5e67 ${shift + S}px, #5e5e67 ${shift + toothW}px, transparent ${shift + toothW}px, transparent ${period}px)`
            : `repeating-linear-gradient(90deg, transparent 0px, transparent ${shift}px, #8a8a93 ${shift}px, #8a8a93 ${shift + S}px, #5e5e67 ${shift + S}px, #5e5e67 ${shift + toothW}px, transparent ${shift + toothW}px, transparent ${period}px)`,
        },
      });
    const tape = (style, vertical) =>
      h(
        'div',
        {
          style: { display: 'flex', position: 'absolute', borderRadius: 3 * S, backgroundColor: '#121215', overflow: 'hidden', ...style },
        },
        [row(vertical, 0, -1), row(vertical, PITCH, 1)],
      );
    layers.push(
      tape({ top: c - TAPE / 2, left: c - TAPE / 2, width: runW, height: TAPE }, false),
      tape({ top: hgt - c - TAPE / 2, left: c - TAPE / 2, width: runW, height: TAPE }, false),
      tape({ top: c - TAPE / 2, [outer]: c - TAPE / 2, width: TAPE, height: runH }, true),
    );
    // The slider at the bottom outer corner, and the pull hanging from it past the page's edge:
    // the pull is a child of the slider, at the editor's offsets (top 8, out 9, 34 degrees).
    layers.push(
      h(
        'div',
        {
          style: {
            display: 'flex',
            position: 'absolute',
            bottom: c - 5 * S,
            [outer]: c - 5 * S,
            width: 10 * S,
            height: 12 * S,
            borderRadius: 2 * S,
            backgroundColor: '#6a6a74',
            borderWidth: S,
            borderStyle: 'solid',
            borderColor: '#2a2a30',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              position: 'absolute',
              top: 8 * S,
              [outer]: -9 * S,
              width: 9 * S,
              height: 22 * S,
              borderRadius: 4 * S,
              backgroundColor: look.zip.pull,
              borderWidth: S,
              borderStyle: 'solid',
              borderColor: 'rgba(0,0,0,0.35)',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingBottom: 3 * S,
              transform: `rotate(${outer === 'right' ? -34 : 34}deg)`,
            },
          },
          // The pull's hole.
          h('div', { style: { display: 'flex', width: 4 * S, height: 4 * S, borderRadius: 2 * S, backgroundColor: 'rgba(0,0,0,0.35)' } }),
        ),
      ),
    );
  }
  return h(
    'div',
    {
      style: {
        display: 'flex',
        position: 'relative',
        width: w,
        height: hgt,
        borderRadius: radius,
        backgroundColor: look.mat,
        boxShadow: `0 ${26 * S}px ${70 * S}px rgba(60,50,35,0.30)`,
      },
    },
    [...layers, h('div', { style: { display: 'flex', position: 'absolute', left: band, top: band, width: gridW, height: gridH } }, grid)],
  );
}

/** The binder's spine between two facing pages, v2: the page's cloth, cross-stitched or ribbed. */
function spineV2(height, look) {
  // The editor's book: a 16px gap between the leaves (BinderPages bookGap), the band ending one
  // page margin in from each end (PAGE_PAD), X's every 12px or ribs every 6px.
  // NARROWER AND QUIETER THAN THE EDITOR'S (owner, 2026-09-15): at share size a 16px band of
  // bright X's between two dark pages pulled the eye off the cards. Ten wide, thread at six
  // tenths of its strength.
  const inset = PAGE_PAD;
  const width = 10 * S;
  const unit = (look.spine === 'cross' ? 12 : 6) * S;
  const bandH = height - inset * 2;
  const n = Math.max(0, Math.floor((bandH - 8 * S) / unit));
  const ink = threadInk(look.mat, { color: look.thread && look.thread.color, opacity: (look.thread && look.thread.opacity !== undefined ? look.thread.opacity : 0.5) * 0.6 });
  const rib = look.dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
  const marks = [];
  if (look.spine === 'cross') {
    // TWO DIAGONAL GRADIENTS, not ninety rotated divs: a rotated element is the slowest thing
    // Satori draws, and the X's cost a spread five seconds on their own. Two 2px threads at 45 and
    // -45 degrees, one every `unit` down the band, cross exactly where the editor's do.
    const pitch = unit / Math.SQRT2;
    for (const deg of [45, -45]) {
      marks.push(
        h('div', {
          style: {
            display: 'flex',
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height: bandH,
            backgroundImage: `repeating-linear-gradient(${deg}deg, ${ink} 0px, ${ink} ${2 * S}px, transparent ${2 * S}px, transparent ${pitch}px)`,
          },
        }),
      );
    }
  } else {
    for (let i = 0; i < n; i++) {
      const top = 4 * S + i * unit;
      marks.push(h('div', { style: { display: 'flex', position: 'absolute', left: 3 * S, top: top + 2 * S, width: width - 6 * S, height: 2 * S, borderRadius: S, backgroundColor: rib } }));
    }
  }
  return h(
    'div',
    { style: { display: 'flex', position: 'relative', width, height } },
    h('div', { style: { display: 'flex', position: 'absolute', left: 0, top: inset, width, height: bandH, borderRadius: 3 * S, backgroundColor: look.mat, overflow: 'hidden' } }, [...weaveV2(width, bandH, look.dark, 3 * S), ...marks]),
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

// Brand colours as the shipped og.png draws them (scripts/brand-assets.mjs) rather than as the
// app's `Palette.accent` (#2F6FED) — this image belongs to the same family of cream share cards.
const BRAND_ACCENT = '#3B82F6';
const BRAND_POCKET = '#cfc7b7'; // a shade darker than og.png's mark, which is drawn far larger
const MARK = 26 * S; // the mark's edge
/** The brand strip under a spread: the lockup, centred, and nothing else. */
const BRAND_STRIP = 40 * S;

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
const brand = (ink) =>
  h('div', { style: { display: 'flex', alignItems: 'center' } }, [
    logoMark(MARK, ink ? ink.pocket : undefined),
    h(
      'div',
      {
        style: {
          display: 'flex',
          marginLeft: 10 * S,
          fontSize: 16 * S,
          color: ink ? ink.ink : 'rgba(70,58,42,0.80)',
          ...(ink && ink.halo ? { textShadow: ink.halo } : {}),
        },
      },
      'michi-maker.com',
    ),
  ]);

/**
 * Content over a brand strip: the lockup centred at the foot of the frame and nothing beside it.
 * The disclaimer that used to share the strip (r6 to r11) is gone at the owner's request, and the
 * height it took went to the pages.
 */
const frame = (inner, backdrop) => {
  // The same blurred collage the single page sits on (r12, owner's ask): the cream either side
  // of a height-bound spread reads as the binder's own colours instead of empty margin. The
  // stamp's ink is measured against what is behind it, as on the single page.
  const ink = backdrop ? chromeInk(backdrop.bottom, SCRIM) : null;
  const layers = [];
  if (backdrop) {
    layers.push(
      h('img', {
        src: backdrop.uri,
        width: W,
        height: H,
        style: { display: 'flex', position: 'absolute', left: 0, top: 0, objectFit: 'cover' },
      }),
      h('div', {
        style: {
          display: 'flex',
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H,
          backgroundColor: `rgba(250,246,239,${SCRIM})`,
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
          width: W,
          height: H,
          flexDirection: 'column',
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
              height: BRAND_STRIP,
            },
          },
          brand(ink),
        ),
      ],
    ),
  );
  return h(
    'div',
    {
      style: {
        width: W,
        height: H,
        display: 'flex',
        position: 'relative',
        background: 'linear-gradient(135deg, #FAF6EF 0%, #EFE7D9 100%)',
      },
    },
    layers,
  );
};

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
async function blurBackdrop(src, shape = { w: 560, h: 470 }, opts) {
  if (!src) return null;
  try {
    const bytes = src.startsWith('data:')
      ? Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
      : Buffer.from(await (await fetch(src)).arrayBuffer());
    // `shape` matches the canvas the blur will cover (single 1800x1512 by default; the spread
    // passes its own), so the strips sampled below map to the same fraction of that canvas.
    //
    // A CHOSEN BACKDROP (opts.sharp, 2026-09-15) is the owner's own picture and is drawn as it is:
    // no blur, at a size the canvas can show, so the wave or the sky they picked stays a wave or
    // a sky. The strips are still measured, so the chrome's ink still answers to what is behind it.
    const sharpen = opts && opts.sharp;
    let pipe = sharp(bytes).resize(sharpen ? shape.w * 3 : shape.w, sharpen ? shape.h * 3 : shape.h, { fit: 'cover' });
    if (!sharpen) pipe = pipe.blur(22).modulate({ brightness: 1.06, saturation: 1.15 });
    const out = await pipe.jpeg({ quality: sharpen ? 80 : 62 }).toBuffer();
    if (sharpen) {
      // The strips are read from a small copy at the measuring shape.
      const small = await sharp(out).resize(shape.w, shape.h, { fit: 'cover' }).jpeg({ quality: 60 }).toBuffer();
      const stripH = Math.round(shape.h * 0.21);
      const strip = async (top, height) => {
        const st = await sharp(small).extract({ left: 0, top, width: shape.w, height }).stats();
        return st.channels.slice(0, 3).map((c) => c.mean);
      };
      return { uri: `data:image/jpeg;base64,${out.toString('base64')}`, top: await strip(0, stripH), bottom: await strip(shape.h - stripH, stripH) };
    }
    // Mean colour of the top and bottom strips, so the chrome can be coloured against what is
    // actually behind it. The blurred image and the canvas share an aspect ratio to within 0.1%
    // (560/470 vs 1800/1512) and it is drawn objectFit:cover, so a strip here maps to the same
    // fraction of the canvas. Approximate by design: the blur has no detail for a finer sample to
    // find, and chromeInk only needs the ground it is judging against.
    const stripH = Math.round(shape.h * 0.21);
    const strip = async (top, height) => {
      const st = await sharp(out).extract({ left: 0, top, width: shape.w, height }).stats();
      return st.channels.slice(0, 3).map((c) => c.mean);
    };
    return {
      uri: `data:image/jpeg;base64,${out.toString('base64')}`,
      top: await strip(0, stripH),
      bottom: await strip(shape.h - stripH, stripH),
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

function singleFrame(page, manifest, art, backdrop, chrome, look) {
  const bands = chrome === 'bands';
  // The SAME measurement serves both faces; only the ground differs. Under bands the chrome sits
  // on 94% cream, so this reliably returns the dark ink at about 11:1 — which is the point: the
  // band face is not exempt from the guarantee, it simply always passes it.
  const groundScrim = bands ? BAND_FILL_ALPHA : SCRIM;
  // With no backdrop the frame is flat cream, where the dark ink already reads at about 12:1, so
  // the fallback needs no measurement.
  const flat = { ink: 'rgb(38,30,20)', pocket: BRAND_POCKET, halo: null };
  const cols = page.cols || 3;
  const rows = page.rows || 3;

  // ── THE PAGE TAKES THE FRAME (owner, 2026-09-15) ────────────────────────────────────────
  //
  // The lockup used to sit in a band above the page and the page took what was left. Now the
  // page stands the full height of the frame less a small margin, centred, and the lockup is a
  // small stamp in the bottom-right corner, over the backdrop (and over a small pill on the band
  // face). Level, not tilted: see the note on `rotate` in compose().
  const MARGIN = 14 * S;
  // The mat's own padding and hairline, both sides of each, are not available to the cards.
  const matChrome = 36 * S + 2 * MAT_EDGE;
  const { cw, ch } = cardSize(cols, rows, SINGLE_W - matChrome - MARGIN * 2, SINGLE_H - matChrome - MARGIN * 2);
  const matW = cols * cw + (cols - 1) * GAP + matChrome;
  const matH = rows * ch + (rows - 1) * GAP + matChrome;
  const stampInk = backdrop ? chromeInk(backdrop.bottom, groundScrim) : flat;
  const layers = [];
  if (backdrop) {
    layers.push(
      h('img', {
        src: backdrop.uri,
        width: SINGLE_W,
        height: SINGLE_H,
        style: { display: 'flex', position: 'absolute', left: 0, top: 0, objectFit: 'cover' },
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
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
      h(
        'div',
        { style: { display: 'flex', width: matW, height: matH } },
        look
          ? pageMat(pageGrid(page, cw, ch, manifest, art, look), look, cols * cw + (cols - 1) * GAP, rows * ch + (rows - 1) * GAP)
          : mat(pageGrid(page, cw, ch, manifest, art), 0, true),
      ),
    ),
  );
  // The stamp: mark and wordmark, small, bottom right. On the band face a pill sits under it so
  // the ink keeps its contrast whatever the backdrop's corner holds.
  layers.push(
    h(
      'div',
      {
        style: {
          display: 'flex',
          position: 'absolute',
          right: 14 * S,
          bottom: 10 * S,
          alignItems: 'center',
          paddingTop: 5 * S,
          paddingBottom: 5 * S,
          paddingLeft: 9 * S,
          paddingRight: 10 * S,
          borderRadius: 14 * S,
          ...(bands ? { backgroundColor: BAND_FILL } : {}),
        },
      },
      [
        logoMark(16 * S, stampInk.pocket),
        h(
          'div',
          {
            style: {
              display: 'flex',
              marginLeft: 7 * S,
              fontSize: 11 * S,
              color: stampInk.ink,
              ...(stampInk.halo ? { textShadow: stampInk.halo } : {}),
            },
          },
          'michi-maker.com',
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

function compose(pages, manifest, art, backdrop, looks) {
  if (pages.length >= 2) {
    // Open spread: shared card size so both pages align; sized to a half-frame box.
    const cols = Math.max(pages[0].cols || 3, pages[1].cols || 3);
    const rows = Math.max(pages[0].rows || 3, pages[1].rows || 3);
    // Height: the frame less the brand strip, the mat's padding and a small margin above and
    // below. Width: half the canvas less the spine and the mat's padding. Whichever binds wins,
    // so a 3x3 spread is as tall as the frame allows and a 3x4 spread as wide.
    const { cw, ch } = cardSize(cols, rows, (W - 36 * S - 60 * S) / 2, H - BRAND_STRIP - 36 * S - 20 * S - (rows - 1) * GAP);
    const spineH = rows * ch + (rows - 1) * GAP;
    if (looks) {
      // v2: two mats, each its own page, and the binder's spine (or v1's rings) between them.
      const gw = cols * cw + (cols - 1) * GAP;
      const ridge = looks[0].spine ? spineV2(spineH + PAGE_PAD * 2, looks[0]) : spine(spineH);
      return frame(
        h(
          'div',
          // LEVEL (owner, 2026-09-15). Satori applies a rotate here to the card images inside
          // their clipped pockets and not to the mats, so every card came out turned a degree
          // and cropped against a level pocket. The book lies flat instead.
          { style: { display: 'flex', alignItems: 'center' } },
          [
            pageMat(pageGrid(pages[0], cw, ch, manifest, art, looks[0]), looks[0], gw, spineH),
            ridge,
            pageMat(pageGrid(pages[1], cw, ch, manifest, art, looks[1]), looks[1], gw, spineH),
          ],
        ),
        backdrop,
      );
    }
    return frame(
      mat(
        [
          pageGrid(pages[0], cw, ch, manifest, art),
          spine(spineH),
          pageGrid(pages[1], cw, ch, manifest, art),
        ],
        -1,
        Boolean(backdrop),
      ),
      backdrop,
    );
  }
  const page = pages[0];
  const { cw, ch } = cardSize(page.cols || 3, page.rows || 3, 760 * S, H - BRAND_STRIP - 36 * S - 20 * S - ((page.rows || 3) - 1) * GAP);
  if (looks) {
    const gw = (page.cols || 3) * cw + ((page.cols || 3) - 1) * GAP;
    const gh = (page.rows || 3) * ch + ((page.rows || 3) - 1) * GAP;
    return frame(h('div', { style: { display: 'flex' } }, pageMat(pageGrid(page, cw, ch, manifest, art, looks[0]), looks[0], gw, gh)), backdrop);
  }
  return frame(mat(pageGrid(page, cw, ch, manifest, art), -1.5, Boolean(backdrop)), backdrop);
}

/**
 * Rasterise, then re-encode. If sharp ever fails, the PNG still ships — big beats nothing.
 *
 * `single` comes from the URL, not from counting pages here: whoever wrote the meta tags already
 * committed to a width and a height, and the render must match what was declared. So when the
 * narrow canvas is asked for, only the first page is drawn even if `pickPages` found two.
 */
async function render(pages, manifest, art, single, chrome, opts) {
  // @vercel/og is ESM-only and this file is CJS; the import is cached after the first invocation.
  const { ImageResponse } = await import('@vercel/og');
  // v2 (opts.look): the binder's look, resolved per page. The outer edge is the page's side of the
  // book: on a spread the first page is the left leaf; a single page goes by its position.
  const binder = opts && opts.binder;
  const looks =
    opts && opts.look && binder
      ? pages.map((p, i) => pageLook(p, binder, art, pages.length >= 2 ? (i === 0 ? 'left' : 'right') : (p.position || 0) % 2 === 1 ? 'left' : 'right'))
      : null;
  // THE OWNER'S OWN BACKDROP (2026-09-15) replaces the blurred page art when it loaded, as itself.
  const chosen = binder && isImageRef(binder.share_backdrop) && art ? art.get(binder.share_backdrop) || null : null;
  const node = single
    ? singleFrame(
        pages[0],
        manifest,
        art,
        chosen ? await blurBackdrop(chosen, undefined, { sharp: true }) : await blurBackdrop(backdropSource(pages[0], manifest, art)),
        // A chosen picture is the point of the image, so it is never hidden behind the bands.
        chosen ? 'collage' : chrome || flipChrome(),
        looks ? looks[0] : null,
      )
    : compose(
        pages,
        manifest,
        art,
        // The spread's blur, at the spread's own aspect. Whichever page has art supplies it.
        chosen
          ? await blurBackdrop(chosen, { w: 800, h: Math.round((800 * H) / W) }, { sharp: true })
          : await blurBackdrop(
              backdropSource(pages[0], manifest, art) ||
                (pages[1] ? backdropSource(pages[1], manifest, art) : null),
              { w: 800, h: Math.round((800 * H) / W) },
            ),
        looks,
      );
  const png = Buffer.from(
    await new ImageResponse(node, {
      width: single ? SINGLE_W : W,
      height: single ? SINGLE_H : H,
    }).arrayBuffer(),
  );
  try {
    // A LIGHT SHARPEN before the JPEG. The rasteriser shrinks each full-size card into its pocket
    // with a plain filter, which leaves the card text and art edges a touch soft; an unsharp mask
    // at this radius brings them back without haloing the blurred backdrop. Rendering larger and
    // downscaling was tried first and is not an option here: time grows faster than the pixels
    // (see the note on S above), and a scraper that times out shows nothing.
    let img = sharp(png);
    if (SHARPEN > 0) img = img.sharpen({ sigma: SHARPEN, m1: 0.8, m2: 0.5 });
    return { body: await img.jpeg(JPEG).toBuffer(), type: 'image/jpeg' };
  } catch {
    return { body: png, type: 'image/png' };
  }
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '').trim();
  // The shape the meta tags committed to. Only the two known canvases are honoured, so a hand-typed
  // width can't make this render something no og:image:width ever declared.
  const single = String((req.query && req.query.w) || '') === String(SINGLE_W);
  // v2 (an experiment, 2026-09-15): draw the binder's look. Opt-in by URL while it is judged.
  const look = String((req.query && req.query.v) || '') === '2';
  let cover = `${SITE}/og.png`;
  try {
    if (id) {
      const [binder, manifest] = await Promise.all([fetchBinder(id), fetchManifest()]);
      if (binder) {
        cover = manifestUrl(manifest, binder.cover_card_id, 'image') || cover;
        const pages = pickPages(binder);
        const art = await loadArt(pages, look ? binder : null);
        // Only compose when at least one pocket actually resolves to an image — otherwise
        // an all-blank page is worse than the cover fallback.
        const anyImage = pages.some((page) =>
          (page.binder_slots || []).some((s) => slotArt(s, manifest, art)),
        );
        if (pages.length && anyImage) {
          const { body, type } = await render(pages, manifest, art, single, undefined, { look, binder });
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

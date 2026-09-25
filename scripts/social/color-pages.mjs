/**
 * Build a binder of colour-matched pages for Instagram. Dry run by default; --apply writes.
 *
 *   node scripts/social/color-pages.mjs                     (proposes, writes nothing)
 *   node scripts/social/color-pages.mjs --pages 10 --apply
 *
 * WHY COLOUR AND NOT A SUBJECT. The posts that travel are the ones readable at thumbnail size, and
 * at that size a page is one colour before it is nine cards. So the page is built from the palette
 * outwards: pick a palette, take the cards that already live in it, and the page composes itself.
 *
 * TRI-COLOUR, LITERALLY. `cards_en.color_art` holds each card's THREE dominant colours in CIELAB
 * with the fraction of the picture each one covers: [[L,a,b,w],[L,a,b,w],[L,a,b,w]]. A palette
 * here is up to three LAB anchors, and a card's cost is how far its own three colours sit from the
 * nearest anchor, weighted by how much of the card each covers. That is why a dark card with a
 * bright corner does not win a bright page: the corner carries almost no weight.
 *
 * The whole comparison runs here rather than in SQL. There are only ~1,500 full arts, the column
 * is jsonb, and doing it in the script means the palettes can be tuned by editing a list instead of
 * rewriting a query.
 *
 * FULL ARTS ONLY. On an illustration rare or a named full art the picture IS the card, so nine of
 * them read as one image. An ordinary card is mostly frame, border and text box, and nine of those
 * read as a spreadsheet whatever colour they are.
 *
 * ONE BINDER, MANY PAGES (owner, 2026-09-25), showcased so a caption can link to it: public enough
 * to open, and `hidden_from_feeds` so it never turns up in discovery or featured binders.
 *
 * THE BACKDROP. Each page gets a photograph if one can be found, and ALWAYS gets an image-model
 * prompt written into the report, so any page whose stock photograph is mediocre can be replaced
 * with a generated one without re-running anything.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ROOT, adminSql, adminUser, appSql, backdropFor, cardImageUrl, dataSql,
  fail, imageManifest, isoDate, q, step,
} from '../lib/michi.mjs';

const APPLY = process.argv.includes('--apply');
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const WANT = Math.max(1, Math.min(20, Number(argOf('--pages', '10'))));
const BINDER_TITLE = argOf('--title', 'Colour Study');
const PER_PAGE = 9;

const ART_KINDS = `('special_illustration_rare','illustration_rare','named_full_art')`;

/**
 * The palettes. Each is three CIELAB anchors, a title for the page, and the line that goes in the
 * page description. The captions are written here rather than generated: a caption is the one part
 * of a post a reader actually reads, and a generated one reads like a generated one.
 *
 * `hunt` is what the backdrop is searched for; `prompt` is the fallback for an image model.
 */
const PALETTES = [
  {
    key: 'ember', title: 'Ember',
    anchors: [[45, 60, 40], [62, 45, 58], [24, 8, 6]],
    caption: 'Nine cards that all look like the last ten minutes of a fire.',
    hunt: 'dark red ember texture close up',
    prompt: 'A seamless abstract backdrop of glowing embers fading into charcoal black, deep crimson and burnt orange, soft focus, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'deep-current', title: 'Deep Current',
    anchors: [[32, 8, -45], [52, -28, -12], [88, 0, -2]],
    caption: 'Everything here happens somewhere the light has trouble reaching.',
    hunt: 'deep blue ocean water surface texture',
    prompt: 'A seamless abstract backdrop of deep ocean blue fading to teal with pale caustic light from above, soft gradient, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'gilded', title: 'Gilded',
    anchors: [[75, 8, 70], [90, 2, 18], [26, 4, 4]],
    caption: 'The pages you turn to slowly, because somebody spent the gold on them.',
    hunt: 'gold leaf texture black background',
    prompt: 'A seamless abstract backdrop of brushed gold leaf on near-black, warm ivory highlights, subtle grain, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'verdant', title: 'Verdant',
    anchors: [[50, -45, 25], [40, -28, 30], [88, -4, 14]],
    caption: 'Green enough that you can almost hear it.',
    hunt: 'green moss forest canopy texture',
    prompt: 'A seamless abstract backdrop of layered green foliage, moss and fern tones with pale cream light breaking through, soft focus, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'twilight', title: 'Twilight',
    anchors: [[38, 35, -40], [30, 10, -42], [68, 38, 2]],
    caption: 'That twenty minutes after sunset when everything goes purple.',
    hunt: 'purple twilight sky gradient dusk',
    prompt: 'A seamless abstract backdrop of violet and indigo dusk sky with a low rose glow at the horizon, smooth gradient, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'blush', title: 'Blush',
    anchors: [[72, 38, 4], [84, 20, 2], [92, 3, 10]],
    caption: 'Soft, pink, and entirely unbothered by anything happening elsewhere.',
    hunt: 'pale pink silk texture soft',
    prompt: 'A seamless abstract backdrop of pale rose and blush pink silk folds with ivory highlights, very soft light, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'ink-and-snow', title: 'Ink and Snow',
    anchors: [[22, 0, 0], [95, 0, 0], [58, 0, -4]],
    // Monochrome is the one palette the identity gate cannot express, because its identity is the
    // ABSENCE of colour. The gate only asks that the card's largest colour be neutral, and the
    // first version of this page came back with a rainbow Togekiss and a rainbow Darmanitan: both
    // are mostly white, with the colour in the second and third slots. maxChroma asks the whole
    // card instead, so anything with a vivid area anywhere is out.
    maxChroma: 14,
    caption: 'No colour at all, and somehow still the loudest page in the binder.',
    hunt: 'black and white marble texture minimal',
    prompt: 'A seamless abstract backdrop of black ink bleeding into white paper, grey mid tones, high contrast, no colour, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'citrus', title: 'Citrus',
    anchors: [[78, 5, 72], [66, 42, 60], [58, -40, 40]],
    caption: 'Yellow, orange, and a green that refuses to calm down.',
    hunt: 'bright citrus yellow orange background',
    prompt: 'A seamless abstract backdrop of bright citrus yellow and orange with a slice of fresh green, high key, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'tide', title: 'Tide',
    anchors: [[58, -32, -8], [86, -8, 2], [36, 6, -38]],
    caption: 'Shallow water over pale sand, which is a colour more than a place.',
    hunt: 'turquoise shallow water sand aerial',
    prompt: 'A seamless abstract backdrop of turquoise shallow water over pale sand, gentle ripples seen from above, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'dusk-rose', title: 'Dusk Rose',
    anchors: [[68, 36, 6], [42, 32, -34], [76, 10, 58]],
    caption: 'Pink and gold and a little bit of trouble.',
    hunt: 'pink gold sunset clouds gradient',
    prompt: 'A seamless abstract backdrop of rose pink clouds shot through with gold and a deep violet edge, sunset gradient, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'rust', title: 'Rust',
    anchors: [[48, 28, 38], [32, 16, 22], [80, 6, 30]],
    caption: 'Warm, worn, and older than everything around it.',
    hunt: 'rusted metal texture warm brown',
    prompt: 'A seamless abstract backdrop of rusted iron and weathered terracotta, warm browns and ochre, fine grain, no text, no characters, 4:5 vertical.',
  },
  {
    key: 'glacier', title: 'Glacier',
    anchors: [[82, -10, -14], [94, -2, -4], [56, -14, -22]],
    caption: 'Cold in the way a photograph of somewhere cold is cold.',
    hunt: 'glacier ice blue white texture',
    prompt: 'A seamless abstract backdrop of pale glacial ice, white and cold blue, cracked translucent surface, no text, no characters, 4:5 vertical.',
  },
];

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

/** CIE76 distance. Crude next to CIEDE2000 and entirely sufficient for "is this card blue". */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * THE HERE-IS-THE-HUE GATE, and the reason it exists.
 *
 * The obvious score is "each of the card's three colours to the nearest anchor, weighted by how
 * much of the picture it covers". That was the first version and it produced nine brown-grey cards
 * under the title "Ember", with exactly one red one. Every palette holds a neutral anchor, and a
 * neutral anchor is an escape hatch: a card that is only charcoal is very close to the charcoal
 * anchor, so it scores beautifully on a palette whose point is that things are on fire.
 *
 * So the FIRST anchor is the identity, and a card has to actually carry it. The test is in a/b
 * only, ignoring lightness, because "is this card red" is a question about hue and saturation and
 * not about how dark it is: a bright scarlet and a deep oxblood both belong on the red page, and a
 * charcoal card belongs on neither. The same rule gives the monochrome palette its behaviour for
 * free, since its identity sits at a=b=0 and every neutral passes at any lightness.
 *
 * Only colours covering at least a fifth of the picture can satisfy it, so a red logo in the corner
 * is not enough.
 */
const MIN_SHARE = 0.2;
const HERO_MAX = 28;

/** The closest qualifying colour to the identity, and how much of the card it covers. */
function heroDistance(colors, hero) {
  const big = colors.filter((c) => (Number(c[3]) || 0) >= MIN_SHARE);
  const pool = big.length ? big : colors;
  let best = { d: Infinity, share: 0 };
  for (const c of pool) {
    const d = Math.hypot(c[1] - hero[1], c[2] - hero[2]);
    if (d < best.d) best = { d, share: Number(c[3]) || 0 };
  }
  return best;
}

/** Lower is better; Infinity means the card does not carry the palette's identity at all. */
function cost(colors, anchors, maxChroma) {
  const { d: hero, share } = heroDistance(colors, anchors[0]);
  if (!(hero <= HERO_MAX)) return Infinity;
  // A ceiling on EVERY reported colour, at any share at all. The share filter used everywhere else
  // is wrong here: `color_art` is already a three-cluster summary of the whole picture, so a rainbow
  // background does not show up as one big vivid cluster, it shows up as two small ones either side
  // of a large pale one. A rainbow Togekiss survived a 15% floor with its colour sitting at 14% and
  // 5%. Anything this palette can see, it judges.
  if (maxChroma !== undefined && colors.some((c) => Math.hypot(c[1], c[2]) > maxChroma)) return Infinity;
  let total = 0;
  let weight = 0;
  for (const c of colors) {
    const w = Number(c[3]) || 0;
    if (!w) continue;
    total += w * Math.min(...anchors.map((a) => dist(c, a)));
    weight += w;
  }
  const spread = weight ? total / weight : Infinity;
  // The identity counts for more than the supporting colours, so a true match outranks a card that
  // merely sits near the neutral end of the palette. And a card whose identity colour covers most
  // of the picture is preferred over one that carries it in a quarter: at thumbnail size a page is
  // its dominant colour, which is the whole reason these pages work as posts.
  return spread + 1.5 * hero + (1 - share) * 20;
}

/** LAB to #rrggbb, for reading the report without opening anything. */
function labHex([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const [X, Y, Z] = [f(fx) * 0.95047, f(fy), f(fz) * 1.08883];
  const lin = [
    X * 3.2406 + Y * -1.5372 + Z * -0.4986,
    X * -0.9689 + Y * 1.8758 + Z * 0.0415,
    X * 0.0557 + Y * -0.204 + Z * 1.057,
  ];
  return '#' + lin.map((v) => {
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(s * 255))).toString(16).padStart(2, '0');
  }).join('');
}

// ---------------------------------------------------------------------------

console.log(APPLY ? '*** APPLY: this will write to the live database ***\n' : 'DRY RUN: nothing will be written.\n');

step(1, 'every full art and its three dominant colours');
const manifest = await imageManifest();
const raw = await dataSql(`
  select c.id::text as id, c.name, c.set_name, c.illustrator, c.full_art_kind,
         coalesce(c.full_art_score, 0) as art_score, c.color_art
    from public.cards_en c
   where c.full_art_kind in ${ART_KINDS} and c.color_art is not null;
`);
const cards = raw
  .map((r) => ({ ...r, colors: (typeof r.color_art === 'string' ? JSON.parse(r.color_art) : r.color_art) ?? [] }))
  .filter((r) => r.colors.length && cardImageUrl(manifest, r.id));
console.log(`  ${raw.length} full arts carry a palette, ${cards.length} of them also have a picture`);
if (cards.length < PER_PAGE * 2) fail('not enough full arts with both a palette and a picture');

step(2, 'matching cards to palettes');
// Each card lands on ONE page, its best, so no card appears twice in the binder. Palettes are
// filled in order of how well their own best nine score, so the strongest pages are built first.
const ranked = PALETTES.map((p) => {
  // Cards that fail the identity gate score Infinity and are dropped here, never ranked. Keeping
  // them would let a palette short of nine matches pad the page with cards it had just rejected,
  // which is how a grey-blue Tapu Koko ended up on a gold page.
  const scoredCards = cards
    .map((c) => ({ ...c, cost: cost(c.colors, p.anchors, p.maxChroma) }))
    .filter((c) => Number.isFinite(c.cost))
    .sort((a, b) => a.cost - b.cost);
  return { ...p, best: scoredCards };
}).sort((a, b) =>
  a.best.slice(0, PER_PAGE).reduce((s, c) => s + c.cost, 0) - b.best.slice(0, PER_PAGE).reduce((s, c) => s + c.cost, 0));

const taken = new Set();
const pages = [];
for (const p of ranked) {
  if (pages.length >= WANT) break;
  const picked = [];
  for (const c of p.best) {
    if (picked.length >= PER_PAGE) break;
    if (taken.has(c.id)) continue;
    picked.push(c);
  }
  if (picked.length < PER_PAGE) {
    console.log(`  skipped ${p.title}: only ${picked.length} card(s) both match it and are unclaimed`);
    continue;
  }
  picked.forEach((c) => taken.add(c.id));
  const spread = picked[picked.length - 1].cost - picked[0].cost;
  pages.push({ ...p, cards: picked, tightness: picked.reduce((s, c) => s + c.cost, 0) / picked.length, spread });
}
for (const p of pages) {
  console.log(`  ${p.title.padEnd(14)} avg distance ${p.tightness.toFixed(1)}  anchors ${p.anchors.map(labHex).join(' ')}`);
  for (const c of p.cards) {
    console.log(`    ${c.colors.map((x) => `${labHex(x)}@${(Number(x[3]) * 100).toFixed(0)}%`).join(' ')}  ${c.name}`);
  }
}
if (!pages.length) fail('no palette could be filled');

step(3, 'backdrops');
const seenArt = new Set();
for (const p of pages) {
  p.art = await backdropFor(p.hunt, { seen: seenArt });
  if (p.art) seenArt.add(p.art.url);
  console.log(`  ${p.title.padEnd(14)} ${p.art ? `${p.art.source}, ${p.art.credit}` : 'none found, use the prompt'}`);
}

step(4, 'the report');
const dir = join(ROOT, 'state', 'social');
mkdirSync(dir, { recursive: true });
const reportPath = join(dir, `colour-pages-${isoDate(new Date())}.md`);

if (!APPLY) {
  writeFileSync(reportPath, report(pages, null), 'utf8');
  console.log(`  ${reportPath}`);
  console.log('\nOK: nothing written to the database. Re-run with --apply.');
  process.exit(0);
}

// ---------------------------------------------------------------------------

const me = await adminUser();
step(5, `writing as @${me.username}`);
const [existing] = await appSql(
  `select id from public.binders where owner_id = ${q(me.id)} and title = ${q(BINDER_TITLE)} limit 1;`,
);
if (existing) {
  await appSql(`delete from public.binders where id = ${q(existing.id)};`);
  console.log(`  replaced the previous "${BINDER_TITLE}"`);
}
const binderId = randomUUID();
await appSql(`
  insert into public.binders (id, owner_id, title, description, layout_style, cover_card_id, is_public, is_demo)
  values (${q(binderId)}, ${q(me.id)}, ${q(BINDER_TITLE)},
          ${q('One palette per page. Nothing here is trying to be a checklist.')},
          'themed_story', ${q(pages[0].cards[0].id)}, false, false);
`);

// Pages are created PUBLIC: a page's own is_public is what the share renderer sees, and it reads
// the binder anonymously. A public binder of private pages draws nothing and opens empty.
await appSql(`
  insert into public.binder_pages (id, binder_id, position, title, rows, cols, background_color, notes, is_public)
  values ${pages.map((p, i) => {
    p.id = randomUUID();
    return `(${q(p.id)}, ${q(binderId)}, ${i}, ${q(p.title)}, 3, 3, ${q(p.art?.url ?? null)}, ${q(p.caption)}, true)`;
  }).join(',\n          ')};
`);
const slots = pages.flatMap((p) => p.cards.map((c, k) =>
  `(${q(randomUUID())}, ${q(p.id)}, ${Math.floor(k / 3)}, ${k % 3}, 1, 1, 'card', ${q(c.id)})`));
await appSql(`
  insert into public.binder_slots (id, page_id, row_index, col_index, row_span, col_span, slot_type, card_id)
  values ${slots.join(',\n          ')};
`);
console.log(`  "${BINDER_TITLE}": ${pages.length} pages, ${slots.length} cards`);

step(6, 'showcasing');
await adminSql(`select public.admin_set_binder_showcase(${q(binderId)}, true);`);
const [state] = await appSql(`
  select b.is_public, b.hidden_from_feeds,
         (select count(*) from public.binder_pages p where p.binder_id = b.id and p.is_public) as public_pages,
         (select count(*) from public.binder_pages p where p.binder_id = b.id and p.notes is not null) as captioned
    from public.binders b where b.id = ${q(binderId)};
`);
console.log(`  public: ${state.is_public}, hidden from feeds: ${state.hidden_from_feeds}, `
  + `visible pages: ${state.public_pages}, captioned: ${state.captioned}`);
if (!state.is_public || !state.hidden_from_feeds) fail('the binder is not showcased');
if (Number(state.public_pages) !== pages.length) fail('some pages are not visible to the renderer');
if (Number(state.captioned) !== pages.length) fail('some pages have no caption');

step(7, 'what an anonymous reader sees, which is what the renderer is');
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || (await import('../lib/michi.mjs')).envVar('EXPO_PUBLIC_SUPABASE_URL');
const KEY = (await import('../lib/michi.mjs')).envVar('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const sel = encodeURIComponent('title,binder_pages(id,title,binder_slots(card_id))');
const res = await fetch(`${URL_}/rest/v1/binders?id=eq.${binderId}&is_public=eq.true&select=${sel}`, { headers: { apikey: KEY } });
const [seen] = await res.json();
const visible = (seen?.binder_pages ?? []).filter((pg) => (pg.binder_slots ?? []).some((s) => s.card_id));
console.log(`  anon sees "${seen?.title}" with ${visible.length} drawable page(s)`);
if (visible.length !== pages.length) fail('the renderer cannot see every page');

writeFileSync(reportPath, report(pages, binderId), 'utf8');
console.log(`\nOK: michi-maker.com/binder/${binderId}\n    ${reportPath}`);

// ---------------------------------------------------------------------------

function report(ps, id) {
  const link = id ? `https://michi-maker.com/binder/${id}` : '(not written yet, dry run)';
  return `# Colour pages for Instagram

Binder: ${link}

Generated by scripts/social/color-pages.mjs. One palette per page, nine full arts each, chosen by
how close each card's own three dominant colours sit to the palette. Every page is public and the
binder is kept out of discovery and featured binders, so the link works and nothing else changes.

To post one: open the binder, go to the page, share it as an image, and paste the caption.

${ps.map((p, i) => `
## ${i + 1}. ${p.title}

**Caption:** ${p.caption}

**Link:** ${id ? `${link}?page=${i + 1}` : '(dry run)'}

**Palette:** ${p.anchors.map(labHex).join('  ')} (average card distance ${p.tightness.toFixed(1)})

**Backdrop:** ${p.art ? `${p.art.source}, ${p.art.credit}, ${p.art.page}` : 'none found automatically'}

**If you want a better backdrop, paste this into an image model:**

> ${p.prompt}

**Cards:** ${p.cards.map((c) => c.name).join(', ')}
`).join('\n')}

## Suggested caption tail for Instagram

> Full page at michi-maker.com, where you can build your own.
>
> #pokemon #pokemontcg #pokemoncards #pokemonbinder #tcgcollector #pokemoncollection #cardcollector
`;
}

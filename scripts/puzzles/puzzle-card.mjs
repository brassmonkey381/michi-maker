/**
 * Wrap a rendered puzzle page in its social furniture, for the surface it is going to.
 *
 *   node scripts/puzzles/puzzle-card.mjs <page.jpg> <themeCount> [out.png] --date YYYY-MM-DD
 *                                        [--aspect 3:4|4:5|1:1|9:16] [--cta "..."] [--guides]
 *
 * THE FURNITURE IS ADDED AROUND, NOT OVER. The share image is a binder page, and a banner laid on
 * top of it covers a card, which on a puzzle is the one thing that must not happen: a player cannot
 * guess from eight cards and a corner. The canvas grows; the artwork is never touched.
 *
 * NO HINT AND NO ANSWER HERE, deliberately. Both belong in the caption, which can be edited after
 * posting, unlike a PNG.
 *
 * THE COUNT IS A PARAMETER because a puzzle is not always two themes, and it is spelled out in
 * words ("two", not "2"): a numeral inside a sentence gets skimmed past, and the count is the part
 * of the question a player actually needs.
 *
 * THREE SURFACES, THREE SHAPES.
 *   3:4  feed post. Instagram moved profile grid thumbnails to 3:4 in January 2025 and added native
 *        3:4 feed posts that May, so 4:5 is taller in the FEED but gets trimmed at the sides on the
 *        GRID. The question runs the width of the image, so that trim eats the question rather than
 *        a margin.
 *   9:16 story, laid out around Instagram's own chrome and around the quiz sticker. See below.
 *   4:5  reddit, where the feed card is wider and nothing is cropped once a reader opens the post.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const VALUED = new Set(['date', 'aspect', 'cta']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && VALUED.has(argv[i - 1].slice(2))));
const [src, countArg, outArg] = positional;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!src) fail('usage: node scripts/puzzles/puzzle-card.mjs <page.jpg> <count> [out.png] --date YYYY-MM-DD');
if (!existsSync(src)) fail(`${src} not found`);
const count = Number(countArg) || 2;
const out = outArg ?? join(dirname(src), `${basename(src).replace(/\.[^.]+$/, '')}-puzzle.png`);

/**
 * THE DATE IS THE POSTING DATE, NOT TODAY. A puzzle is drawn the day before it goes out at least as
 * often as the day of, so reading the clock here would stamp yesterday on half the posts. Its
 * absence is an error rather than a silent fallback to now.
 *
 * Parsed as UTC, because `new Date('2026-09-24')` west of Greenwich renders as the 23rd in local
 * time, which is exactly the off-by-one a reader notices.
 */
const dateArg = flag('date');
if (!dateArg) fail('--date YYYY-MM-DD is required (the date the puzzle is POSTED, not today)');
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) fail(`--date must be YYYY-MM-DD, got "${dateArg}"`);
const when = new Date(`${dateArg}T00:00:00Z`);
if (Number.isNaN(when.getTime())) fail(`"${dateArg}" is not a real date`);
const dateLine = when
  .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  .toUpperCase();

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const word = WORDS[count] ?? String(count);

const ASPECTS = { '3:4': 4 / 3, '4:5': 5 / 4, '1:1': 1, '9:16': 16 / 9 };
const aspect = flag('aspect') ?? '3:4';
if (!ASPECTS[aspect]) fail(`--aspect must be one of ${Object.keys(ASPECTS).join(', ')}, got "${aspect}"`);
const story = aspect === '9:16';

/**
 * The call to action is a FLAG with a default rather than a constant, because a prize claim dates:
 * the week the raffle is not running the line has to come off, and a line hardcoded in a script is
 * one nobody remembers to remove. `--cta ""` leaves a plain frame.
 *
 * A story needs no CTA of its own: the quiz sticker IS the call to action, and text competing with
 * it in the same third of the screen is text nobody reads.
 */
const DEFAULT_CTA = 'Leave your guess, like, and follow for a chance to win a month of membership!';
const ctaArg = flag('cta');
const cta = ctaArg !== undefined ? ctaArg : (story ? '' : DEFAULT_CTA);
const guides = has('guides');

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const title = 'DAILY THEME SEARCH PUZZLE!';
const question = `Can you guess which ${word} theme search terms were combined to make this binder page?`;

const meta = await sharp(src).metadata();
const W = meta.width;
const H = Math.round(W * ASPECTS[aspect]);

const GRAD_BG = `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#171a2b"/>
    <stop offset="55%" stop-color="#241d3d"/>
    <stop offset="100%" stop-color="#3a1f45"/>
  </linearGradient>
  <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#ffb454" stop-opacity="0"/>
    <stop offset="22%" stop-color="#ffb454"/>
    <stop offset="78%" stop-color="#ff7ac8"/>
    <stop offset="100%" stop-color="#ff7ac8" stop-opacity="0"/>
  </linearGradient>`;

const marks = (h, o = 0.07) => `
  <g opacity="${o}" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-weight="700">
    <text x="${Math.round(W * 0.045)}" y="${Math.round(h * 0.86)}" font-size="${Math.round(h * 1.05)}">?</text>
    <text x="${Math.round(W * 0.93)}" y="${Math.round(h * 0.7)}" font-size="${Math.round(h * 0.8)}">?</text>
  </g>`;

const titleSize = Math.round(W * 0.052);
const questionSize = Math.round(W * 0.0225);
const dateSize = Math.round(W * 0.019);
const ctaSize = Math.round(W * 0.0205);

let layout;
if (story) {
  /**
   * A STORY IS NOT A TALL FEED POST. Instagram draws its own chrome over the top and bottom of a
   * story (the avatar and close button above, the reply bar below), and the quiz sticker has to be
   * dropped somewhere that is neither. So the page sits high, and the bottom third is left
   * deliberately EMPTY for the sticker: an empty band is not a design failure here, it is the
   * whole point, and anything put there would end up behind the sticker or under the reply bar.
   *
   * `--guides` draws those zones so the layout can be checked. That version is a working file and
   * is never the one posted.
   */
  const TOP_UI = Math.round(H * 0.105);
  const BOTTOM_UI = Math.round(H * 0.115);
  const header = Math.round(H * 0.175);
  const pageW = Math.round(W * 0.9);
  const pageH = Math.round((meta.height / meta.width) * pageW);
  const stickerTop = TOP_UI + header + pageH + Math.round(H * 0.02);
  const stickerH = H - BOTTOM_UI - stickerTop;
  if (stickerH < Math.round(H * 0.1)) fail('the page is too tall to leave the quiz sticker any room');
  layout = { kind: 'story', TOP_UI, BOTTOM_UI, header, pageW, pageH, stickerTop, stickerH };
} else {
  const MIN_HEADER = Math.round(W * 0.26);
  const MIN_FOOTER = Math.round(W * 0.05);
  let pageW = meta.width;
  let pageH = meta.height;
  const room = H - MIN_HEADER - MIN_FOOTER;
  if (pageH > room) {
    pageW = Math.round(pageW * (room / pageH));
    pageH = room;
  }
  const leftover = H - pageH;
  // Two to one, so the page sits slightly high, which is where the eye expects a poster's subject.
  const header = Math.round(leftover * 0.66);
  layout = { kind: 'feed', header, footer: leftover - header, pageW, pageH };
}

/** The header block, drawn at whatever height the surface gave it. */
const headerSvg = (h, topPad = 0) => `<svg width="${W}" height="${h + topPad}" xmlns="http://www.w3.org/2000/svg">
  <defs>${GRAD_BG}</defs>
  <rect width="${W}" height="${h + topPad}" fill="url(#bg)"/>
  ${marks(h + topPad)}
  <text x="${Math.round(W / 2)}" y="${topPad + Math.round(h * 0.3)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="700"
        font-size="${dateSize}" letter-spacing="${Math.round(W * 0.005)}"
        fill="#ffb454">${esc(dateLine)}</text>
  <text x="${Math.round(W / 2)}" y="${topPad + Math.round(h * 0.53)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="800"
        font-size="${titleSize}" letter-spacing="${Math.round(W * 0.0022)}"
        fill="#ffffff">${esc(title)}</text>
  <rect x="${Math.round(W * 0.16)}" y="${topPad + Math.round(h * 0.625)}"
        width="${Math.round(W * 0.68)}" height="${Math.max(3, Math.round(W * 0.0022))}"
        fill="url(#rule)"/>
  <text x="${Math.round(W / 2)}" y="${topPad + Math.round(h * 0.83)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="500"
        font-size="${questionSize}" fill="#d6d2ea">${esc(question)}</text>
</svg>`;

const composite = [];

if (layout.kind === 'feed') {
  const footSvg = `<svg width="${W}" height="${layout.footer}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fbg" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#171a2b"/><stop offset="55%" stop-color="#241d3d"/>
      <stop offset="100%" stop-color="#3a1f45"/>
    </linearGradient>
    <linearGradient id="frule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff7ac8" stop-opacity="0"/><stop offset="25%" stop-color="#ff7ac8"/>
      <stop offset="75%" stop-color="#ffb454"/><stop offset="100%" stop-color="#ffb454" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${layout.footer}" fill="url(#fbg)"/>
  ${marks(layout.footer)}
  ${cta ? `
  <rect x="${Math.round(W * 0.22)}" y="${Math.round(layout.footer * 0.3)}"
        width="${Math.round(W * 0.56)}" height="${Math.max(2, Math.round(W * 0.0016))}" fill="url(#frule)"/>
  <text x="${Math.round(W / 2)}" y="${Math.round(layout.footer * 0.64)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="600"
        font-size="${ctaSize}" fill="#ffd9a3">${esc(cta)}</text>` : ''}
</svg>`;
  composite.push(
    { input: await sharp(Buffer.from(headerSvg(layout.header))).png().toBuffer(), left: 0, top: 0 },
    { input: await sharp(src).resize(layout.pageW, layout.pageH).toBuffer(), left: Math.round((W - layout.pageW) / 2), top: layout.header },
    { input: await sharp(Buffer.from(footSvg)).png().toBuffer(), left: 0, top: layout.header + layout.pageH },
  );
} else {
  const { TOP_UI, header, pageW, pageH, stickerTop, stickerH, BOTTOM_UI } = layout;
  const tailTop = TOP_UI + header + pageH;
  const tailH = H - tailTop;
  const tailSvg = `<svg width="${W}" height="${tailH}" xmlns="http://www.w3.org/2000/svg">
  <defs>${GRAD_BG}</defs>
  <rect width="${W}" height="${tailH}" fill="url(#bg)"/>
  ${marks(tailH, 0.05)}
  ${guides ? `
  <rect x="2" y="${stickerTop - tailTop}" width="${W - 4}" height="${stickerH}"
        fill="none" stroke="#3fb27f" stroke-width="6" stroke-dasharray="26 18"/>
  <text x="${Math.round(W / 2)}" y="${stickerTop - tailTop + Math.round(stickerH / 2)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${Math.round(W * 0.028)}"
        fill="#3fb27f">QUIZ STICKER GOES HERE</text>
  <rect x="2" y="${tailH - BOTTOM_UI}" width="${W - 4}" height="${BOTTOM_UI - 2}"
        fill="none" stroke="#e2584d" stroke-width="6" stroke-dasharray="26 18"/>
  <text x="${Math.round(W / 2)}" y="${tailH - Math.round(BOTTOM_UI / 2)}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${Math.round(W * 0.024)}"
        fill="#e2584d">INSTAGRAM REPLY BAR, KEEP CLEAR</text>` : ''}
</svg>`;
  composite.push(
    { input: await sharp(Buffer.from(headerSvg(header, TOP_UI))).png().toBuffer(), left: 0, top: 0 },
    { input: await sharp(src).resize(pageW, pageH).toBuffer(), left: Math.round((W - pageW) / 2), top: TOP_UI + header },
    { input: await sharp(Buffer.from(tailSvg)).png().toBuffer(), left: 0, top: tailTop },
  );
}

await sharp({ create: { width: W, height: H, channels: 3, background: '#171a2b' } })
  .composite(composite)
  .png()
  .toFile(out);

console.log(`Wrote ${out}`);
console.log(`  ${W}x${H} (${aspect})`);
if (layout.kind === 'story') {
  console.log(`  top chrome ${layout.TOP_UI}  header ${layout.header}  page ${layout.pageW}x${layout.pageH}`);
  console.log(`  quiz sticker zone: y ${layout.stickerTop} to ${layout.stickerTop + layout.stickerH}  (${layout.stickerH}px tall)`);
  console.log(`  reply bar kept clear: bottom ${layout.BOTTOM_UI}px`);
  if (guides) console.log('  GUIDES ARE DRAWN. This file is for checking the layout, not for posting.');
} else {
  console.log(`  header ${layout.header}  page ${layout.pageW}x${layout.pageH}  footer ${layout.footer}`);
}
console.log(`  ${dateLine}`);
if (cta) console.log(`  cta: "${cta}"`);

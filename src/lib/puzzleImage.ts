/**
 * The Instagram image for a published puzzle, built in the browser.
 *
 * WHAT IT DRAWS. The app's own poster-scale render of the binder page (api/og-image-hires.js), with
 * a header band above it and a footer band below, exactly the composition
 * scripts/puzzles/puzzle-card.mjs produces offline. The bands are the only new pixels; the page
 * itself is the same picture the Share sheet gives, so a post looks like the product.
 *
 * WHY IN THE BROWSER AND NOT ON THE SERVER. The page render already exists as an endpoint and is
 * the slow, expensive half. Compositing two gradient bands and four lines of text onto it is a few
 * milliseconds of Canvas 2D, and doing it here means no new function, no second deploy target, and
 * no sharp in a serverless bundle.
 *
 * THE CANVAS IS NOT TAINTED, because the render is served from this same origin (/api/...). A
 * cross-origin image would silently poison `toBlob` and the download would fail with a security
 * error rather than a wrong picture, which is worth knowing if this ever moves off-origin.
 *
 * WEB ONLY. It uses a canvas and an anchor download. Native has no use for it: the post is made at
 * a desk.
 */
import { Platform } from 'react-native';

/** Ratios shared with scripts/puzzles/puzzle-card.mjs, so both produce the same composition. */
const ASPECTS: Record<string, number> = { '3:4': 4 / 3, '4:5': 5 / 4, '1:1': 1, '9:16': 16 / 9 };
const TITLE = 'DAILY THEME SEARCH PUZZLE!';
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export interface PuzzleImageInput {
  /** The published binder page, drawn by the app's own renderer. */
  binderId: string;
  pageId: string | null;
  /** YYYY-MM-DD, the UTC day the puzzle is for. */
  publishOn: string;
  themeCount: number;
  cta?: string;
  aspect?: keyof typeof ASPECTS;
}

/** THURSDAY, SEPTEMBER 24, 2026. Parsed as UTC so it cannot render as the previous day. */
export function dateLine(publishOn: string): string {
  const when = new Date(`${publishOn}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return '';
  return when
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase();
}

export function questionLine(themeCount: number): string {
  const word = WORDS[themeCount] ?? String(themeCount);
  return `Can you guess which ${word} theme search terms were combined to make this binder page?`;
}

/** Where the page render lives. Same origin, so the canvas stays clean. */
export function pageRenderUrl(binderId: string, pageId: string | null, cacheKey: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const page = pageId ? `&page=${encodeURIComponent(pageId)}` : '';
  return `${base}/api/og-image-hires?id=${encodeURIComponent(binderId)}&v=2&t=${encodeURIComponent(cacheKey)}${page}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The page image could not be drawn. Is the binder showcased?'));
    img.src = url;
  });
}

/**
 * Build the composed PNG.
 *
 * The page keeps its own proportions and is centred; the leftover height is split about two to one
 * between header and footer so the page sits slightly high, which is where the eye expects a
 * poster's subject. When the page is too tall to leave the header room, the PAGE is scaled down:
 * the header has a fixed amount of writing and stops being readable first.
 */
export async function buildPuzzleImage(input: PuzzleImageInput): Promise<Blob> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('The puzzle image is built in a browser.');
  }
  const aspect = input.aspect ?? '3:4';
  const page = await loadImage(pageRenderUrl(input.binderId, input.pageId, input.publishOn));

  const W = 2000;
  const H = Math.round(W * (ASPECTS[aspect] ?? ASPECTS['3:4']));
  const MIN_HEADER = Math.round(W * 0.26);
  const MIN_FOOTER = Math.round(W * 0.05);

  let pw = W;
  let ph = Math.round((page.height / page.width) * W);
  const room = H - MIN_HEADER - MIN_FOOTER;
  if (ph > room) {
    pw = Math.round(pw * (room / ph));
    ph = room;
  }
  const leftover = H - ph;
  const band = Math.round(leftover * 0.66);
  const foot = leftover - band;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas.');

  const ground = (y: number, h: number, flip = false) => {
    const g = flip ? ctx.createLinearGradient(0, y + h, W, y) : ctx.createLinearGradient(0, y, W, y + h);
    g.addColorStop(0, '#171a2b');
    g.addColorStop(0.55, '#241d3d');
    g.addColorStop(1, '#3a1f45');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, h);
  };
  ctx.fillStyle = '#171a2b';
  ctx.fillRect(0, 0, W, H);
  ground(0, band);
  ground(band + ph, foot, true);

  // The question marks from the page backdrop, echoed faintly so the bands belong to it.
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(band * 1.05)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText('?', Math.round(W * 0.045), Math.round(band * 0.86));
  ctx.font = `700 ${Math.round(band * 0.8)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText('?', Math.round(W * 0.93), Math.round(band * 0.7));
  ctx.restore();

  ctx.drawImage(page, Math.round((W - pw) / 2), band, pw, ph);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb454';
  ctx.font = `700 ${Math.round(W * 0.019)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(dateLine(input.publishOn), W / 2, Math.round(band * 0.3));

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${Math.round(W * 0.052)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(TITLE, W / 2, Math.round(band * 0.53));

  const rule = ctx.createLinearGradient(Math.round(W * 0.16), 0, Math.round(W * 0.84), 0);
  rule.addColorStop(0, 'rgba(255,180,84,0)');
  rule.addColorStop(0.22, '#ffb454');
  rule.addColorStop(0.78, '#ff7ac8');
  rule.addColorStop(1, 'rgba(255,122,200,0)');
  ctx.fillStyle = rule;
  ctx.fillRect(Math.round(W * 0.16), Math.round(band * 0.625), Math.round(W * 0.68), Math.max(3, Math.round(W * 0.0022)));

  ctx.fillStyle = '#d6d2ea';
  ctx.font = `500 ${Math.round(W * 0.0225)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(questionLine(input.themeCount), W / 2, Math.round(band * 0.83));

  if (input.cta) {
    const frule = ctx.createLinearGradient(Math.round(W * 0.22), 0, Math.round(W * 0.78), 0);
    frule.addColorStop(0, 'rgba(255,122,200,0)');
    frule.addColorStop(0.25, '#ff7ac8');
    frule.addColorStop(0.75, '#ffb454');
    frule.addColorStop(1, 'rgba(255,180,84,0)');
    ctx.fillStyle = frule;
    ctx.fillRect(Math.round(W * 0.22), band + ph + Math.round(foot * 0.3), Math.round(W * 0.56), Math.max(2, Math.round(W * 0.0016)));
    ctx.fillStyle = '#ffd9a3';
    ctx.font = `600 ${Math.round(W * 0.0205)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(input.cta, W / 2, band + ph + Math.round(foot * 0.64));
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))), 'image/png');
  });
}

/** Build it and hand it to the browser as a file. */
export async function downloadPuzzleImage(input: PuzzleImageInput): Promise<void> {
  const blob = await buildPuzzleImage(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `michi-daily-${input.publishOn}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a turn of the loop, not immediately: Safari cancels a download whose object URL is
  // released in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

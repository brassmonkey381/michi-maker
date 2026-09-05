/**
 * STORY COVER PLANNER — a binder cover that previews the story inside.
 *
 * Given a finished story plan, lay out the four cover surfaces with stickers, notecards and art,
 * so the binder in the hand foreshadows what is in it:
 *
 *   FRONT (FC)         the title in the display face, the story's one-line blurb, a hero picture
 *                      (stock art, never one used on a page), and a tag with "Created by · date".
 *   INSIDE FRONT (IFC) a notecard listing the themes in order — the table of contents — and a
 *                      strip of small pictures, one per theme, captioned; a post-it with the build.
 *   INSIDE BACK (IBC)  "By the numbers" on a notecard (pages, spreads, cards, art panels, which
 *                      printings, where the cards came from), one sentence on how it was made, and a
 *                      post-it crediting the photographers and the card owners.
 *   BACK (BC)          a wide band of art, the hero cards fanned like a hand, and the wordmark line.
 *
 * Everything is in the cover model's own units (`CoverDecoration`): x/y are the centre as fractions
 * of the surface's width and height, w/h and text sizes are fractions of the WIDTH. The surface is
 * taller than wide, so vertical positions are worked out in "width units" from the top and converted
 * with the model's aspect. The art is requested as COVER ART JOBS: the planner emits placeholder
 * image decorations whose id is the job id; the sheet fetches each picture (sharing the binder's
 * used-image set so nothing repeats) and calls `applyCoverArt`, or `dropCoverArt` when nothing was
 * found. `normalizeCover` would drop an image row with no URL anyway, so an unfilled placeholder
 * never reaches the database.
 *
 * Pure: no store, no network, node-testable. The sheet writes the result with
 * `updateBinder(id, { cover })` — `createBinder` does not persist a cover.
 */
import { BINDER_MODELS, DEFAULT_BINDER_MODEL_ID, binderColourway, binderModel, coverAspect, type CoverSurfaceId } from './binderModels.ts';
import type { BinderCover, CoverDecoration, CoverImageDecoration, CoverTextDecoration } from './binderTypes.ts';
import type { StoryPlan, RarityMode } from './storyBinder.ts';
import type { ArtKind, StoryTemplate } from './storyThemes.ts';

export interface CoverArtJob {
  /** Also the id of the placeholder decoration on `surface`. */
  id: string;
  surface: CoverSurfaceId;
  queries: string[];
  kind: ArtKind;
  /** The box's width / height, for choosing a hit and its crop. */
  aspect: number;
  label: string;
}

export interface StoryCoverInput {
  template: StoryTemplate;
  plan: StoryPlan;
  /** "@username" or a display name; empty ⇒ "Created with michi-maker". */
  author: string;
  date: Date;
  rarity: RarityMode;
  source: 'catalog' | 'collection';
  /** Art panels actually filled on the pages (for the numbers card). */
  artPlaced: number;
  mkId: () => string;
  /** Override the model/colourway; default picks a colourway that suits the story. */
  modelId?: string;
  colourway?: string;
}

export interface StoryCoverPlan {
  cover: BinderCover;
  artJobs: CoverArtJob[];
}

/** A colourway for each story, on the default model. Anything unknown gets the first colourway. */
const STORY_COLOURWAYS: Record<string, string> = {
  seasons: 'forest-green',
  'day-to-night': 'royal-blue',
  habitats: 'ocean-blue',
  moods: 'fire-red',
  weather: 'sunrise-yellow',
};

/** coverDecorations.ts MAX_DECORATIONS_PER_SURFACE — kept in step by the test. */
const MAX_LAYERS = 12;

const PAPER = { postit: '#fff3a8', notecard: '#fffdf4', postcard: '#f7f1e3', tag: '#f4e2c4' } as const;
const INK = '#1f2024';
const INK_ON_DARK = '#f4f1ea';
const CARD_ASPECT = 63 / 88;

/** Rough character width as a fraction of the font size, per face, for line estimates. */
const CHAR_W: Record<CoverTextDecoration['font'], number> = { sans: 0.52, serif: 0.5, rounded: 0.54, mono: 0.6, brand: 0.55, marker: 0.5 };

/** How many lines `text` takes in a box `w` wide (width units) at `size`, wrapping on words. */
export function estimateLines(text: string, font: CoverTextDecoration['font'], size: number, w: number, pad: number): number {
  const inner = Math.max(0.05, w - 2 * pad);
  const perLine = Math.max(4, Math.floor(inner / (size * CHAR_W[font])));
  let lines = 0;
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let cur = 0;
    let n = 1;
    for (const word of words) {
      const len = word.length + (cur ? 1 : 0);
      if (cur + len > perLine && cur > 0) {
        n += 1;
        cur = word.length;
      } else cur += len;
    }
    lines += n;
  }
  return lines;
}

interface TextSpec {
  text: string;
  font: CoverTextDecoration['font'];
  size: number;
  w: number;
  color?: string;
  weight?: 'regular' | 'bold';
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  leading?: number;
  bg?: keyof typeof PAPER | 'none';
  pad?: number;
  rot?: number;
  name?: string;
}

/** A text decoration whose height fits its text; returns it with the height it takes (width units). */
function textDecoration(mkId: () => string, spec: TextSpec, x: number, yUnits: number, aspect: number): { d: CoverTextDecoration; h: number } {
  const leading = spec.leading ?? 1.2;
  const pad = spec.bg && spec.bg !== 'none' ? (spec.pad ?? 0.03) : 0.01;
  const lines = estimateLines(spec.text, spec.font, spec.size, spec.w, pad);
  const h = Math.min(1.2, lines * spec.size * leading + 2 * pad + 0.01);
  const d: CoverTextDecoration = {
    id: mkId(),
    kind: 'text',
    x,
    y: clamp01((yUnits + h / 2) * aspect),
    w: spec.w,
    h,
    rot: norm(spec.rot ?? 0),
    text: spec.text.slice(0, 500),
    font: spec.font,
    size: spec.size,
    weight: spec.weight,
    italic: spec.italic,
    align: spec.align ?? 'left',
    leading,
    color: spec.color ?? INK,
    name: spec.name,
    ...(spec.bg && spec.bg !== 'none'
      ? { bg: { shape: spec.bg, edge: 'rounded' as const, color: PAPER[spec.bg], pad } }
      : {}),
  };
  return { d, h };
}

function artPlaceholder(id: string, x: number, yUnits: number, w: number, h: number, aspect: number, name: string, rot = 0): CoverImageDecoration {
  return {
    id,
    kind: 'art',
    x,
    y: clamp01((yUnits + h / 2) * aspect),
    w,
    h,
    rot: norm(rot),
    imageUrl: '',
    fit: 'fill',
    mask: { shape: 'rounded', radius: 0.04 },
    name,
  };
}

function cardSticker(mkId: () => string, cardId: string, x: number, yUnits: number, w: number, aspect: number, rot: number, name: string): CoverImageDecoration {
  const h = w / CARD_ASPECT;
  return {
    id: mkId(),
    kind: 'art',
    x,
    y: clamp01((yUnits + h / 2) * aspect),
    w,
    h,
    rot: norm(rot),
    cardId,
    aspect: CARD_ASPECT,
    fit: 'contain',
    mask: { shape: 'rounded', radius: 0.03 },
    name,
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const norm = (deg: number) => ((deg % 360) + 360) % 360;

export function formatCoverDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function planStoryCover(input: StoryCoverInput): StoryCoverPlan {
  const { template, plan, mkId } = input;
  const model = binderModel(input.modelId ?? DEFAULT_BINDER_MODEL_ID);
  const colourway = binderColourway(model, input.colourway ?? STORY_COLOURWAYS[template.id] ?? model.colourways[0]?.id);
  const aspect = coverAspect(model); // width / height
  const Hu = 1 / aspect; // the surface height in width units
  const ink = colourway.light ? INK : INK_ON_DARK;
  const jobs: CoverArtJob[] = [];
  const byline = input.author ? `Created by ${input.author} · ${formatCoverDate(input.date)}` : `Created ${formatCoverDate(input.date)} with michi-maker`;

  const cardCount = plan.pages.reduce((n, p) => n + p.slots.filter((s) => s.type === 'card').length, 0);
  const themes = template.spreads;

  // ── FRONT
  const front: CoverDecoration[] = [];
  {
    const heroId = mkId();
    // Art first (bottom of the stack); the title sits above the picture, not on it.
    const heroW = 0.86;
    const heroH = Math.min(0.62, Hu - 0.56);
    jobs.push({ id: heroId, surface: 'front', queries: template.coverArt, kind: template.coverArtKind ?? 'any', aspect: heroW / heroH, label: `${template.title} · front cover` });
    front.push(artPlaceholder(heroId, 0.5, 0.36, heroW, heroH, aspect, 'Cover picture'));
    const title = textDecoration(mkId, { text: template.title, font: 'brand', size: 0.13, w: 0.9, color: ink, align: 'center', leading: 1.05, name: 'Title' }, 0.5, 0.07, aspect);
    front.push(title.d);
    const sub = textDecoration(mkId, { text: template.blurb, font: 'serif', size: 0.038, w: 0.84, color: ink, italic: true, align: 'center', leading: 1.25, name: 'Subtitle' }, 0.5, 0.07 + title.h + 0.005, aspect);
    front.push(sub.d);
    const by = textDecoration(mkId, { text: byline, font: 'marker', size: 0.036, w: 0.7, bg: 'tag', rot: -2, align: 'center', name: 'Created by' }, 0.5, Hu - 0.12, aspect);
    front.push(by.d);
  }

  // ── INSIDE FRONT: the table of contents, a picture per theme, a post-it.
  const frontInside: CoverDecoration[] = [];
  {
    const toc = `Inside\n${themes.map((t, i) => `${i + 1}. ${t.title}`).join('\n')}`;
    const card = textDecoration(mkId, { text: toc, font: 'marker', size: themes.length > 4 ? 0.04 : 0.046, w: 0.56, bg: 'notecard', leading: 1.3, rot: 1.5, name: 'Contents' }, 0.33, 0.06, aspect);
    frontInside.push(card.d);
    // The post-it beside the contents card.
    const built = textDecoration(mkId, { text: `Built ${formatCoverDate(input.date)}\n${cardCount} cards on ${plan.pages.length} pages`, font: 'marker', size: 0.036, w: 0.34, bg: 'postit', rot: -5, leading: 1.25, name: 'Build note' }, 0.79, 0.1, aspect);
    frontInside.push(built.d);
    // A strip of theme pictures, three across, captioned — captions only while the surface's
    // twelve-layer cap allows a picture AND a caption per theme (two layers are already spent).
    const captions = 2 + themes.length * 2 <= MAX_LAYERS;
    const perRow = 3;
    // Smaller pictures when there are two rows of them, so both rows fit above the bottom edge.
    const thumbW = themes.length > perRow ? 0.22 : 0.26;
    const gapX = (1 - perRow * thumbW) / (perRow + 1);
    const rowGap = captions ? 0.075 : 0.03;
    let u = 0.06 + card.h + 0.05;
    themes.forEach((theme, i) => {
      const col = i % perRow;
      if (i > 0 && col === 0) u += thumbW + rowGap;
      if (u + thumbW + (captions ? 0.045 : 0) > Hu - 0.01) return; // out of room: the rest go without a picture
      const x = gapX + thumbW / 2 + col * (thumbW + gapX);
      const id = mkId();
      jobs.push({ id, surface: 'frontInside', queries: theme.art, kind: theme.artKind ?? 'any', aspect: 1, label: `${theme.title} · inside front` });
      frontInside.push(artPlaceholder(id, x, u, thumbW, thumbW, aspect, `${theme.title} picture`));
      if (captions) {
        const cap = textDecoration(mkId, { text: theme.title, font: 'sans', size: 0.03, w: thumbW, color: ink, align: 'center', leading: 1.1, name: `${theme.title} caption` }, x, u + thumbW + 0.008, aspect);
        frontInside.push(cap.d);
      }
    });
  }

  // ── INSIDE BACK: the numbers, the tags, the credits.
  const backInside: CoverDecoration[] = [];
  {
    const printings = input.rarity === 'illustration' ? 'Illustration rares & full arts' : 'Any tagged printing';
    const from = input.source === 'collection' ? 'my collection' : 'the whole catalog';
    const numbers = [
      'By the numbers',
      `${plan.pages.length} pages · ${plan.spreads.length} spreads`,
      `${cardCount} cards`,
      `${input.artPlaced} art panels`,
      printings,
      `Cards from ${from}`,
    ].join('\n');
    const num = textDecoration(mkId, { text: numbers, font: 'mono', size: 0.036, w: 0.62, bg: 'notecard', leading: 1.35, rot: -1.5, name: 'By the numbers' }, 0.36, 0.06, aspect);
    backInside.push(num.d);
    // One sentence on how it was made — not the tag list, which reads as machinery on a cover.
    const how = textDecoration(
      mkId,
      {
        text: 'How it was made\nEvery spread was chosen from the pictures on the cards themselves: what they show, where they are set and how they feel.',
        font: 'sans',
        size: 0.036,
        w: 0.86,
        bg: 'tag',
        leading: 1.3,
        rot: 1,
        name: 'How it was made',
      },
      0.5,
      0.06 + num.h + 0.06,
      aspect,
    );
    backInside.push(how.d);
    const credits = textDecoration(mkId, { text: 'Pictures by Pexels and Pixabay photographers, credited on each panel. Card art belongs to its owners.', font: 'marker', size: 0.034, w: 0.56, bg: 'postit', rot: 3, leading: 1.25, name: 'Credits' }, 0.66, Hu - 0.3, aspect);
    backInside.push(credits.d);
  }

  // ── BACK: a band of art, the hero cards fanned, the wordmark line.
  const back: CoverDecoration[] = [];
  {
    const bandId = mkId();
    const bandW = 0.9;
    const bandH = 0.34;
    jobs.push({ id: bandId, surface: 'back', queries: template.coverArt, kind: template.coverArtKind ?? 'any', aspect: bandW / bandH, label: `${template.title} · back cover` });
    back.push(artPlaceholder(bandId, 0.5, 0.06, bandW, bandH, aspect, 'Back band'));
    const heroes = plan.heroCardIds.slice(0, 3);
    const cardW = 0.3;
    const fanU = 0.06 + bandH + 0.1;
    heroes.forEach((cardId, i) => {
      const n = heroes.length;
      const x = 0.5 + (i - (n - 1) / 2) * 0.22;
      const rot = (i - (n - 1) / 2) * 8;
      back.push(cardSticker(mkId, cardId, x, fanU + Math.abs(i - (n - 1) / 2) * 0.03, cardW, aspect, rot, `Hero card ${i + 1}`));
    });
    const foot = textDecoration(mkId, { text: 'Made with michi-maker · michi-maker.com', font: 'sans', size: 0.03, w: 0.8, color: ink, align: 'center', leading: 1.1, name: 'Wordmark' }, 0.5, Hu - 0.08, aspect);
    back.push(foot.d);
  }

  const cover: BinderCover = {
    modelId: model.id,
    colourway: colourway.id,
    showCover: true,
    surfaces: { front, frontInside, backInside, back },
  };
  return { cover, artJobs: jobs };
}

/** Fill a placeholder with the fetched picture. */
export function applyCoverArt(
  cover: BinderCover,
  jobId: string,
  art: { imageUrl: string; crop: { x: number; y: number; w: number; h: number }; attribution: CoverImageDecoration['attribution']; aspect?: number },
): BinderCover {
  return mapDecoration(cover, jobId, (d) => ({ ...d, imageUrl: art.imageUrl, crop: art.crop, aspect: art.aspect, attribution: art.attribution }) as CoverImageDecoration);
}

/** Remove a placeholder nothing was found for (and its caption, which shares the picture's name). */
export function dropCoverArt(cover: BinderCover, jobId: string): BinderCover {
  const surfaces = { ...(cover.surfaces ?? {}) };
  for (const key of Object.keys(surfaces) as CoverSurfaceId[]) {
    const list = surfaces[key];
    if (!list) continue;
    const gone = list.find((d) => d.id === jobId);
    if (!gone) continue;
    const captionName = gone.name ? gone.name.replace(/ picture$/, ' caption') : null;
    surfaces[key] = list.filter((d) => d.id !== jobId && !(captionName && d.name === captionName));
  }
  return { ...cover, surfaces };
}

function mapDecoration(cover: BinderCover, id: string, fn: (d: CoverDecoration) => CoverDecoration): BinderCover {
  const surfaces = { ...(cover.surfaces ?? {}) };
  for (const key of Object.keys(surfaces) as CoverSurfaceId[]) {
    const list = surfaces[key];
    if (list?.some((d) => d.id === id)) surfaces[key] = list.map((d) => (d.id === id ? fn(d) : d));
  }
  return { ...cover, surfaces };
}

/** Placeholders still empty (for the sheet to drop if the build is cancelled). */
export function emptyCoverArtIds(cover: BinderCover): string[] {
  const out: string[] = [];
  for (const list of Object.values(cover.surfaces ?? {})) {
    for (const d of list ?? []) if (d.kind !== 'text' && !('cardId' in d && d.cardId) && !(d as CoverImageDecoration).imageUrl) out.push(d.id);
  }
  return out;
}

export { BINDER_MODELS };

/**
 * STORY BINDER PLANNER — a whole binder from a template of themes, each spread designed on its own.
 *
 * Input: the tagged cards (the catalog, or the owner's collection), a StoryTemplate (an ordered
 * list of themes, one per two-page spread) and a page shape. Output: the pages, ready for
 * `createBinder`, plus the ART JOBS: every reserved artwork panel with the stock-art searches that
 * should fill it. The planner is pure — no store, no network — so `node --test` can exercise it
 * against synthetic cards and the sheet can preview counts before anything is built.
 *
 * HOW A SPREAD IS DESIGNED. Each theme names the tags that place a card in it (`want`), softer
 * signals (`bonus`) and tags that pull a card out (`avoid`). A card's score is the sum of its
 * matching tags weighted by RANK — the catalog publishes tags strongest first — plus a ladder for
 * the picture rarities, minus a penalty when the foil hides the art. The strongest qualifying
 * cards go on the spread, at most one per species and two per illustrator so a spread reads as a
 * theme rather than a species page. The LAYOUT is one of the spread art templates (art-richest
 * first, rotated per spread so consecutive spreads differ), and the cards are seated so the best
 * ones sit closest to the art: the pockets are ordered by distance to the reserved cells and
 * filled in score order, alternating leaves so both pages carry equal weight.
 *
 * THE COVER. Page 0 is a right-hand leaf on its own (pageSide: even indexes are right pages), so
 * the binder opens on a single page: one hero card from each spread's theme around a plate of art
 * for the template as a whole. The spreads then run (1,2), (3,4), … so every theme is a true
 * two-page spread when the binder is read as a book.
 *
 * Nothing here is capped. A template with six themes makes thirteen pages; every panel in every
 * template gets an art job. Caps, if any are ever wanted, belong in the sheet.
 */
import { ART_SLACK, ART_TEMPLATES, artCells, pickTemplate, reservedCells, templateArtSlots, type ArtRole, type ArtTemplate } from './artTemplates.ts';
import type { DemoPage, DemoSlot } from './binderTypes.ts';
import { seededRandom, type SeededRandom } from './seededRandom.ts';
import type { ArtKind, StoryTemplate, StoryTheme } from './storyThemes.ts';

/** The slice of a catalog card the planner reads. Structural, so tests need no real CatalogCard. */
export interface StoryCard {
  id: string;
  name: string;
  rarity: string;
  illustrator?: string;
  evolutionLine?: string[];
  language?: string;
  // NO sceneTags. They were removed on 2026-09-11 when scoring moved to the server so the tag
  // corpus stops being downloadable; a card arrives here already scored. See lib/themeScores.
}

export interface PageShape {
  rows: number;
  cols: number;
}

export type RarityMode = 'illustration' | 'all';

export interface StoryPlanOptions {
  /**
   * Scored candidates, ONE ARRAY PER SPREAD, aligned to `template.spreads`.
   *
   * It used to be the tagged cards, and the planner scored them itself. Scoring is a server call
   * now (lib/themeScores.scoreThemes), so the caller does the awaiting and this function stays
   * pure and synchronous — which is what keeps it testable against synthetic scores with no
   * network, and is why the other 400 lines of it did not have to move.
   */
  ranked: ThemeScore[][];
  template: StoryTemplate;
  shape: PageShape;
  /** Restrict to these card ids (the owner's collection). Null/undefined = every eligible card. */
  pool?: ReadonlySet<string> | null;
  /** 'illustration': only the picture rarities (Illustration Rare, Special Illustration Rare, Ultra
   *  Rare, full arts). 'all': any tagged card, with the picture rarities still scored higher. */
  rarity?: RarityMode;
  /** Id factory, injected so tests run without the uuid dependency. */
  mkId?: () => string;
  /**
   * VARIETY, REPRODUCIBLY. With a seed the cover page's layout, each spread's layout and which
   * leaf takes the strongest card are drawn from a seeded random source, so two binders from the
   * same template do not share a rhythm, while the same seed always rebuilds the same binder.
   * Without one the plan is the fixed rotation it always was.
   */
  seed?: string | number;
}

/** One reserved artwork panel and how to fill it. */
export interface ArtJob {
  pageIndex: number;
  slotId: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  role: ArtRole;
  /** Stock-art searches, in order of preference. */
  queries: string[];
  kind: ArtKind;
  /** For progress copy: "Winter · rail". */
  label: string;
}

export interface SpreadPlan {
  theme: StoryTheme;
  /** [left, right] page indexes in the binder. */
  pageIndexes: [number, number];
  templateId: string | null;
  /** How many cards qualified before the layout capped them. */
  candidates: number;
  placed: number;
}

export interface StoryPlan {
  title: string;
  description: string;
  pages: DemoPage[];
  artJobs: ArtJob[];
  spreads: SpreadPlan[];
  /** Cards placed anywhere in the binder (cover included). */
  cardIds: string[];
  /** The one hero card per theme that opens the binder on page 0, in theme order. */
  heroCardIds: string[];
  /** The `want` tags that placed the most cards, across every spread, strongest first. */
  topTags: string[];
}

// ─── Scoring ─────────────────────────────────────────────────────────────────────────────────────

const PICTURE_RARITY = /illustration rare|special art|art rare|full art|hyper rare|secret rare|ultra rare|trainer gallery|character rare|radiant/i;

/** The rarity ladder: how much a card's printing says "this one is about the picture". */
export function rarityBoost(rarity: string): number {
  const r = rarity.toLowerCase();
  if (r.includes('special illustration')) return 0.7;
  if (r.includes('illustration rare')) return 0.6;
  if (/special art|art rare|full art|trainer gallery|character rare/.test(r)) return 0.45;
  if (/ultra rare|hyper rare|secret rare|radiant/.test(r)) return 0.3;
  return 0;
}

export function isPictureRarity(rarity: string): boolean {
  return PICTURE_RARITY.test(rarity);
}

export interface ThemeScore {
  card: StoryCard;
  score: number;
  /** The `want` tags that matched, strongest first — what the page description names. */
  hits: string[];
  /** True when the card qualifies outright (a `want` match), false when it is fallback material. */
  qualifies: boolean;
}

/**
 * Every card that belongs to a theme, best first. `pool` restricts to owned ids; `rarity`
 * 'illustration' keeps only the picture printings.
 */
export function themeCandidates(
  scored: readonly ThemeScore[],
  opts: { pool?: ReadonlySet<string> | null; rarity?: RarityMode } = {},
): ThemeScore[] {
  // IT TAKES SCORES NOW, NOT CARDS. The scoring moved to the server on 2026-09-11 so the tag
  // corpus stops being downloadable (see lib/themeScores); what is left here is the filtering the
  // server cannot do and the sort the planner depends on.
  //
  // The rarity rule stays on this side deliberately: isPictureRarity is a judgement about what a
  // PRINTING says, read off a rarity string, and has nothing to do with the tag data. The pool and
  // language filters are applied server-side as well, and are kept here because a caller may hold
  // a narrower pool than it asked with, and filtering twice is free.
  const out = scored.filter((s) => {
    if (s.card.language && s.card.language !== 'en') return false;
    if (opts.pool && !opts.pool.has(s.card.id)) return false;
    if ((opts.rarity ?? 'illustration') === 'illustration' && !isPictureRarity(s.card.rarity)) return false;
    return true;
  });
  // Qualifying cards first, then by score; ties by id so a plan is reproducible.
  return out
    .slice()
    .sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || b.score - a.score || a.card.id.localeCompare(b.card.id));
}

// ─── Species / illustrator diversity ─────────────────────────────────────────────────────────────

const NAME_DECORATIONS = new Set(['ex', 'gx', 'v', 'vmax', 'vstar', 'v-union', 'mega', 'm', 'radiant', 'tag', 'team', '&', 'lv.x', 'prime', 'legend', 'break', 'shining', 'dark', 'light']);

/** The species a printing depicts: the evolution-line member in the name, else the name minus decorations. */
export function speciesKey(card: StoryCard): string {
  const n = card.name.toLowerCase();
  const line = card.evolutionLine ?? [];
  if (line.length > 0) {
    const hit = [...line].sort((a, b) => b.length - a.length).find((s) => n.includes(s.toLowerCase()));
    if (hit) return hit.toLowerCase();
  }
  return n
    .split(/\s+/)
    .filter((t) => !NAME_DECORATIONS.has(t) && !/['’]s$/.test(t))
    .join(' ')
    .trim();
}

/**
 * Take up to `count` cards from a ranked list, skipping ids already used anywhere in the binder,
 * at most one per species and two per illustrator on this spread.
 */
export function pickDiverse(ranked: ThemeScore[], count: number, used: Set<string>): ThemeScore[] {
  const out: ThemeScore[] = [];
  const species = new Set<string>();
  const byIllustrator = new Map<string, number>();
  for (const s of ranked) {
    if (out.length >= count) break;
    if (used.has(s.card.id)) continue;
    const sp = speciesKey(s.card);
    if (sp && species.has(sp)) continue;
    const ill = (s.card.illustrator ?? '').trim().toLowerCase();
    if (ill && (byIllustrator.get(ill) ?? 0) >= 2) continue;
    out.push(s);
    if (sp) species.add(sp);
    if (ill) byIllustrator.set(ill, (byIllustrator.get(ill) ?? 0) + 1);
  }
  return out;
}

// ─── Seating ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The free pockets of a leaf, nearest-the-art first. A leaf with no art reads row-major. Ties
 * break row-major too, so the seating is stable and reads left to right, top to bottom.
 */
export function seatingOrder(shape: PageShape, reserved: Set<string>): [number, number][] {
  const art: [number, number][] = [];
  for (const key of reserved) {
    const [r, c] = key.split(',').map(Number);
    art.push([r, c]);
  }
  const cells: { r: number; c: number; d: number }[] = [];
  for (let r = 0; r < shape.rows; r += 1) {
    for (let c = 0; c < shape.cols; c += 1) {
      if (reserved.has(`${r},${c}`)) continue;
      const d = art.length ? Math.min(...art.map(([ar, ac]) => Math.abs(ar - r) + Math.abs(ac - c))) : 0;
      cells.push({ r, c, d });
    }
  }
  cells.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
  return cells.map((x) => [x.r, x.c]);
}

function cardSlot(mkId: () => string, r: number, c: number, cardId: string, fromCollection: boolean): DemoSlot {
  return { id: mkId(), row: r, col: c, rowSpan: 1, colSpan: 1, type: 'card', cardId, ...(fromCollection ? { fromCollection: true } : {}) };
}

/**
 * The page description: the theme's one sentence. Not the tags — a reader of the binder should see
 * a caption, not the machinery ("scene:snow, mood:cold") that chose the cards. The tags that
 * placed the most cards are still reported on the plan (`topTags`) for anyone tuning the themes.
 */
function describe(theme: StoryTheme): string {
  return theme.blurb;
}

// ─── Layout choice ───────────────────────────────────────────────────────────────────────────────

/**
 * The spread layout for the i-th theme: art-led (never a layout with no art while one with art
 * fits), among the richer half of what fits, rotating through them and never repeating the
 * previous spread's layout. `pickTemplate` alone cycles a shortlist of two or three; a six-theme
 * story deserves more variety than that, and a run of two identical spreads reads as a mistake.
 */
export function spreadTemplate(shape: PageShape, available: number, index: number, previousId: string | null, rng?: SeededRandom | null): ArtTemplate | null {
  const fits = ART_TEMPLATES.filter(
    (t) => t.rows === shape.rows && t.cols === shape.cols && t.spread && t.cardPockets <= Math.max(available, 1) + ART_SLACK * 2,
  ).sort((a, b) => artCells(b) - artCells(a) || a.id.localeCompare(b.id));
  const withArt = fits.filter((t) => artCells(t) > 0);
  const poolT = withArt.length ? withArt : fits;
  if (poolT.length === 0) return null;
  const richest = artCells(poolT[0]);
  // The richer half: anything within ART_SLACK * 3 pockets of the richest, at least three choices.
  let short = poolT.filter((t) => artCells(t) >= richest - ART_SLACK * 3);
  if (short.length < 3) short = poolT.slice(0, 3);
  if (rng) {
    // Any of the richer half except the one just used: a shuffle rather than a march.
    const fresh = short.filter((t) => t.id !== previousId);
    return rng.pick(fresh.length ? fresh : short) ?? short[0];
  }
  const rotated = short[index % short.length];
  if (rotated.id !== previousId || short.length === 1) return rotated;
  return short[(index + 1) % short.length];
}

// ─── The plan ────────────────────────────────────────────────────────────────────────────────────

let seq = 0;
const defaultId = () => `story-${Date.now().toString(36)}-${(seq += 1)}`;

export function planStoryBinder(opts: StoryPlanOptions): StoryPlan {
  const mkId = opts.mkId ?? defaultId;
  const { template, shape } = opts;
  const rng = opts.seed === undefined ? null : seededRandom(`plan:${opts.seed}`);
  const fromCollection = !!opts.pool;
  const used = new Set<string>();
  const pages: DemoPage[] = [];
  const artJobs: ArtJob[] = [];
  const spreads: SpreadPlan[] = [];
  const allPlaced: ThemeScore[] = [];

  // Rank every theme up front: the cover borrows each theme's best card before the spreads pick.
  const ranked = template.spreads.map((_theme, i) =>
    themeCandidates(opts.ranked[i] ?? [], { pool: opts.pool, rarity: opts.rarity }));

  // ── Cover: page 0, a right-hand leaf on its own.
  const heroes: ThemeScore[] = [];
  for (const list of ranked) {
    const pick = pickDiverse(list, 1, used)[0];
    if (pick) {
      heroes.push(pick);
      used.add(pick.card.id);
    }
  }
  const coverTemplate = pickTemplate(shape.rows, shape.cols, heroes.length, { spread: false, rotate: rng ? rng.int(64) : 0 });
  pages.push(
    leafPage(mkId, shape, coverTemplate, undefined, heroes, template.title, template.blurb, fromCollection, pages.length, artJobs, {
      queries: template.coverArt,
      kind: template.coverArtKind ?? 'any',
      label: `${template.title} · cover`,
    }),
  );

  // ── Spreads: (1,2), (3,4), …
  let previousId: string | null = null;
  template.spreads.forEach((theme, i) => {
    const list = ranked[i];
    const available = list.filter((s) => !used.has(s.card.id)).length;
    // An art-led layout that seats the cards we have, different from the spread before it.
    const t = spreadTemplate(shape, available, i, previousId, rng);
    previousId = t?.id ?? null;
    const pockets = t ? t.cardPockets : shape.rows * shape.cols * 2;
    const chosen = pickDiverse(list, pockets, used);
    for (const c of chosen) used.add(c.card.id);
    allPlaced.push(...chosen);

    const leftReserved = t ? reservedCells(t, 'left') : new Set<string>();
    const rightReserved = t ? reservedCells(t, 'right') : new Set<string>();
    const leftSeats = seatingOrder(shape, leftReserved);
    const rightSeats = seatingOrder(shape, rightReserved);
    const left: ThemeScore[] = [];
    const right: ThemeScore[] = [];
    // Alternate leaves in score order so both pages carry equal weight; overflow to whichever
    // leaf still has room. Seeded, the strongest card opens on either leaf.
    const firstLeft = rng ? rng.chance() : true;
    for (const [k, c] of chosen.entries()) {
      const preferLeft = (k % 2 === 0) === firstLeft;
      if (preferLeft && left.length < leftSeats.length) left.push(c);
      else if (right.length < rightSeats.length) right.push(c);
      else if (left.length < leftSeats.length) left.push(c);
    }
    const description = describe(theme);
    const leftIndex = pages.length;
    pages.push(leafPage(mkId, shape, t, 'left', left, theme.title, description, fromCollection, leftIndex, artJobs, { queries: theme.art, kind: theme.artKind ?? 'any', label: theme.title }, leftSeats));
    pages.push(leafPage(mkId, shape, t, 'right', right, theme.title, description, fromCollection, leftIndex + 1, artJobs, { queries: theme.art, kind: theme.artKind ?? 'any', label: theme.title }, rightSeats));
    spreads.push({ theme, pageIndexes: [leftIndex, leftIndex + 1], templateId: t?.id ?? null, candidates: list.length, placed: chosen.length });
  });

  const themeList = template.spreads.map((t) => t.title.toLowerCase()).join(', ');
  const tagCounts = new Map<string, number>();
  for (const s of allPlaced) for (const h of s.hits) tagCounts.set(h, (tagCounts.get(h) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return {
    title: template.title,
    // Says what the binder IS, never how it was made: the tagging behind it is the owner's secret
    // sauce, and a VIP is meant to discover it, not read about it on a description.
    description: `A story in ${template.spreads.length} spreads: ${themeList}.`,
    pages,
    artJobs,
    spreads,
    cardIds: [...used],
    heroCardIds: heroes.map((h) => h.card.id),
    topTags,
  };
}

/** One leaf: the template's art panels for that side, the cards seated nearest the art. */
function leafPage(
  mkId: () => string,
  shape: PageShape,
  t: ArtTemplate | null,
  leaf: 'left' | 'right' | undefined,
  cards: ThemeScore[],
  title: string,
  description: string,
  fromCollection: boolean,
  pageIndex: number,
  artJobs: ArtJob[],
  art: { queries: string[]; kind: ArtKind; label: string },
  seats?: [number, number][],
): DemoPage {
  const reserved = t ? reservedCells(t, leaf) : new Set<string>();
  const order = seats ?? seatingOrder(shape, reserved);
  const slots: DemoSlot[] = cards.slice(0, order.length).map((s, i) => cardSlot(mkId, order[i][0], order[i][1], s.card.id, fromCollection));
  const artSlots = t ? templateArtSlots(t, mkId, leaf) : [];
  for (const a of artSlots) {
    artJobs.push({
      pageIndex,
      slotId: a.id,
      row: a.row,
      col: a.col,
      rowSpan: a.rowSpan,
      colSpan: a.colSpan,
      role: (a.artRole as ArtRole | undefined) ?? 'accent',
      queries: art.queries,
      kind: art.kind,
      label: `${art.label} · ${a.artRole ?? 'art'}`,
    });
  }
  return { id: mkId(), title, description, rows: shape.rows, cols: shape.cols, slots: [...slots, ...artSlots] };
}

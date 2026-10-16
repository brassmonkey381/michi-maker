/**
 * THE FILL SHEET'S "ONLY" ROW (owner, 2026-10-16): a frame and a type that every fill method
 * honours. "Fill with this evolution line, but only windowed cards" or "same scene, Fire types,
 * illustration rares only" are the same page with a narrower candidate list, so the choice lives
 * beside the method rather than inside each one. Pure: pageComposer applies it to candidates
 * before ranking, the sheet draws it, and `node --test` reaches it.
 */
import type { CatalogCard } from '@/lib/catalog';

export type ComposeFrame = 'all' | 'full' | 'illustration' | 'window';

export interface ComposeFilter {
  /** Which artwork framing to allow. `all` (or absent) keeps every card. */
  frame?: ComposeFrame;
  /** Energy types to allow, OR-ed; a card matches when any of its types is listed. Empty: any. */
  types?: readonly string[];
}

export const COMPOSE_FRAMES: { key: ComposeFrame; label: string }[] = [
  { key: 'all', label: 'Any art' },
  { key: 'full', label: 'Full art' },
  { key: 'illustration', label: 'Illustration rares' },
  { key: 'window', label: 'Windowed' },
];

/** The energy types a chip is offered for, in the order they are printed on the sheet. */
export const COMPOSE_TYPES = [
  'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting',
  'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless',
] as const;

/**
 * The catalog's `fullArtKind` values that are a WINDOWED card: the pipeline's "scene_tagged" is
 * an ordinary framed card whose picture has been tagged, and '' is one that has not. Everything
 * else (illustration rares, named full arts, measured full arts, double rares) bleeds to the edge.
 */
const WINDOWED_KINDS = new Set(['', 'scene_tagged']);
const ILLUSTRATION_KINDS = new Set(['illustration_rare', 'special_illustration_rare']);

export function frameOf(fullArtKind: string | undefined): Exclude<ComposeFrame, 'all'> {
  const kind = fullArtKind ?? '';
  if (ILLUSTRATION_KINDS.has(kind)) return 'illustration';
  return WINDOWED_KINDS.has(kind) ? 'window' : 'full';
}

/** Is a filter asking for anything at all? */
export function filterActive(filter?: ComposeFilter | null): boolean {
  return !!filter && ((!!filter.frame && filter.frame !== 'all') || (filter.types?.length ?? 0) > 0);
}

/** Does `card` pass `filter`? An absent or empty filter passes everything. */
export function matchesComposeFilter(
  card: Pick<CatalogCard, 'fullArtKind' | 'types'>,
  filter?: ComposeFilter | null,
): boolean {
  if (!filter) return true;
  if (filter.frame && filter.frame !== 'all') {
    const f = frameOf(card.fullArtKind);
    // "Full art" is every edge-to-edge card, illustration rares included.
    if (filter.frame === 'full' ? f === 'window' : f !== filter.frame) return false;
  }
  if (filter.types && filter.types.length > 0) {
    const want = new Set(filter.types.map((t) => t.toLowerCase()));
    if (!card.types.some((t) => want.has(t.toLowerCase()))) return false;
  }
  return true;
}

/** The filter in words, for the toast and the error line: "Fire, windowed". */
export function describeComposeFilter(filter?: ComposeFilter | null): string {
  if (!filterActive(filter)) return '';
  const parts: string[] = [];
  if (filter?.types?.length) parts.push(filter.types.join(' or '));
  const frame = COMPOSE_FRAMES.find((f) => f.key === filter?.frame);
  if (frame && frame.key !== 'all') parts.push(frame.label.toLowerCase());
  return parts.join(', ');
}

/**
 * HOW DISCOVER'S SEARCH LANES BECOME ONE LIST (pure; MIC-080).
 *
 * Discover runs several searches for one typed query (data/discoverSearch) and joins them here.
 * The search lab (/lab/search) joins them with these same functions, so what the lab shows as
 * "the merged order" is the order Discover shows, by construction. Change the rules here, never
 * in a copy.
 *
 * Imports nothing at runtime, so `node --test` can reach it.
 */

/** The one field the merge reads. RankedBinderRow (data/binderRepo) satisfies it. */
export interface RowLike {
  binder_id: string;
}

/** Two ranked lists as one, the lead list first, never a binder twice. Null only when both are. */
export function mergeRows<T extends RowLike>(lead: readonly T[] | null, rest: readonly T[] | null): T[] | null {
  if (!lead && !rest) return null;
  const seen = new Set((lead ?? []).map((r) => r.binder_id));
  return [...(lead ?? []), ...(rest ?? []).filter((r) => !seen.has(r.binder_id))];
}

/** The parts of a parsed query the plain-words test reads (tcgscan-browse ParsedQuery). */
export interface QueryShape {
  words: readonly string[];
  fields: readonly unknown[];
  comparisons: readonly unknown[];
}

/**
 * PLAIN WORDS ARE ALSO WHAT THE ART SHOWS (owner, 2026-11-11): a query of bare words only
 * ("watercolor", "rainy city") is asked twice, as words and as themes. Anything with a field or a
 * comparison is asked once.
 */
export function isPlainWords(parsed: QueryShape): boolean {
  return parsed.words.length > 0 && parsed.fields.length === 0 && parsed.comparisons.length === 0;
}

/** The colour-word match the merge reads (data/colourWords ColourWordMatch). */
export interface ColourWordLike {
  family: string;
  onlyColour: boolean;
}

/**
 * The ranked rows Discover shows for a query: a colour word on its own puts its colour pages
 * first; inside a longer query they follow the card-ranked rows.
 */
export function finalCardHits<T extends RowLike>(
  ranked: readonly T[] | null,
  byColour: readonly T[] | null,
  cw: ColourWordLike | null,
): T[] | null {
  return cw?.onlyColour ? mergeRows(byColour, ranked) : mergeRows(ranked, byColour);
}

/**
 * Which binders get the "5 green pages" line: only rows that came from the colour search. A
 * card-ranked row's matching pages are about the cards, not the colour, so a binder that the card
 * lanes also found loses the line, unless the colour word stood alone.
 */
export function wordColourPages<T extends RowLike>(
  ranked: readonly T[] | null,
  byColour: readonly T[] | null,
  cw: ColourWordLike | null,
): { family: string; ids: ReadonlySet<string> } | null {
  const kept = new Set(cw?.onlyColour ? [] : (ranked ?? []).map((r) => r.binder_id));
  const colourIds = (byColour ?? []).map((r) => r.binder_id).filter((b) => !kept.has(b));
  return cw && colourIds.length ? { family: cw.family, ids: new Set(colourIds) } : null;
}

/** Where one binder in the final list came from. */
export type MergedSource = 'ranked' | 'title';

/**
 * THE ORDER DISCOVER DRAWS. Every ranked row first, in order; then the title lane's binders
 * (search_binders: title, description, @owner, page titles, page tags) that no ranked row named.
 * Mirrors RankedResults in app/discover.tsx, which appends `extra` after the last ranked row.
 */
export function discoverOrder(
  cardHits: readonly RowLike[] | null,
  titleIds: readonly string[],
): { binder_id: string; from: MergedSource }[] {
  const ranked = (cardHits ?? []).map((r) => ({ binder_id: r.binder_id, from: 'ranked' as const }));
  const seen = new Set(ranked.map((r) => r.binder_id));
  const extra: { binder_id: string; from: MergedSource }[] = [];
  for (const id of titleIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    extra.push({ binder_id: id, from: 'title' });
  }
  return [...ranked, ...extra];
}

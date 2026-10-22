/**
 * WHAT TO LOOK FOR ART OF, before the page's cards are read.
 *
 * Owner, 2026-10-22: "if we're looking to pull in art from external sources, we would want the
 * search to be prepopulated with what we most recently theme searched or added to our binder page
 * (forest, pikachu, etc.)". A page title is the weakest signal, because people rarely edit one;
 * the search they just ran, or the card they just placed, is what they are thinking about.
 *
 * Two small things live here: the words of a browse query with its operators stripped, and a
 * memory of the last card that landed in a pocket. The sheet that asks (FindArtSheet.useArtLead)
 * reads the kit's live browse query first, this memory second, the page's cards third.
 *
 * PURE except for the one-slot memory, so the parsing is under `npm test`.
 */

let lastAdded: string | null = null;

/** The binder store calls this whenever a card lands in a pocket, whichever way it got there. */
export function rememberCardAdded(cardId: string | null | undefined): void {
  if (cardId) lastAdded = cardId;
}

export function lastCardAdded(): string | null {
  return lastAdded;
}

/** Test seam. */
export function forgetCardAdded(): void {
  lastAdded = null;
}

/**
 * The subject words of a browse query: `theme:forest` and `art:forest` give "forest", a quoted
 * value loses its quotes, every other `key:value` operator (set:, type:, sort:, have:, >$100) is
 * dropped, and a leading minus marks an exclusion, which is not a subject. "" when nothing is left.
 */
export function themeWordsOf(query: string | null | undefined): string {
  if (!query) return '';
  const words: string[] = [];
  const re = /(-?)([a-z_]+):("([^"]*)"|'([^']*)'|(\S+))|("([^"]*)")|(\S+)/gi;
  for (const m of query.matchAll(re)) {
    const [, neg, key, , dq, sq, bare, , quoted, plain] = m;
    if (key) {
      if (neg || !/^(theme|art)$/i.test(key)) continue;
      const v = (dq ?? sq ?? bare ?? '').trim();
      if (v) words.push(v);
      continue;
    }
    const w = (quoted ?? plain ?? '').trim();
    if (!w || w.startsWith('-') || /^[<>]?\$?\d/.test(w)) continue;
    words.push(w);
  }
  return words.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

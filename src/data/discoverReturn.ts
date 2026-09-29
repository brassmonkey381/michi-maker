/**
 * Where Discover was when you left it, so coming back from a binder puts you where you were.
 *
 * THE PROBLEM (owner, 2026-09-29). Discover's shelves are carousels. Page to the fourth shelf of
 * public binders, open one, come back, and you are on page one again with no way to tell which of
 * the four you had already seen. The deeper someone browses, the more the back button costs them,
 * which is exactly backwards.
 *
 * MODULE STATE, NOT STORAGE, AND ON PURPOSE. Opening a binder is client-side navigation, so this
 * survives it; a hard reload or a new tab clears it, which is the right behaviour. A remembered
 * shelf page is worth nothing a day later, the list will have moved under it, and persisting it
 * would mean restoring someone to page four of a list that no longer has four pages.
 *
 * KEYED BY SHELF AND ORDERING. The public shelf under "Most liked" and under "Recently public" are
 * different lists, so page three of one is meaningless in the other; giving them separate keys
 * resets the position when the sort chip flips, which is what you want, without any extra wiring.
 */

/** Per-shelf carousel page. Cleared only by a reload. */
const shelfPages = new Map<string, number>();

/** Whether Discover has been open in this session, which decides where a binder's back link goes. */
let visited = false;

/** The key for one shelf under one ordering. */
export function shelfKey(shelf: string, ordering?: string): string {
  return ordering ? `${shelf}:${ordering}` : shelf;
}

/** Remember a shelf's page. Anything not a non-negative whole number is ignored, not stored. */
export function rememberShelfPage(key: string, page: number): void {
  if (!key) return;
  if (!Number.isInteger(page) || page < 0) return;
  shelfPages.set(key, page);
}

/** The page to open a shelf on. 0 when nothing is remembered, so callers need no fallback. */
export function recallShelfPage(key: string): number {
  return shelfPages.get(key) ?? 0;
}

/** Called when Discover mounts. */
export function noteDiscoverVisit(): void {
  visited = true;
}

/**
 * Where a binder's "back" link should go.
 *
 * `/discover` only for someone who has been there this session. A visitor who arrived on a binder
 * from a shared link has no position to return to, and sending them to a feed rather than the home
 * page would answer a question they never asked.
 */
export function binderBackHref(): '/discover' | '/' {
  return visited ? '/discover' : '/';
}

/** Tests only. */
export function resetDiscoverReturn(): void {
  shelfPages.clear();
  visited = false;
}

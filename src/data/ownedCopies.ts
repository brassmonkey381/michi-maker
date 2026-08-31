/**
 * WHICH PHYSICAL CARD is in this pocket — the accounting that makes "I own it" and "it is placed"
 * the same fact about the same object.
 *
 * THE TWO DEFECTS THIS EXISTS FOR, both reported live 2026-08-29 on one binder:
 *
 *   1. A CARD PLACED FROM BROWSING NEVER COST ANYTHING. Placement consumed an owned copy only when
 *      the add came from the collection UI (DemoSlot.fromCollection, set by that one caller), so
 *      the same card added from browse, from home, or from the binder editor stayed "free" in the
 *      collection for ever — and could be placed again, and again. Five pockets, one card owned.
 *
 *   2. NO POCKET KNEW WHICH COPY IT HELD. A slot carried a cardId, and a cardId is a catalogue
 *      entry, not a possession. Own five and every pocket wore the newest scan of the five,
 *      because there was nothing else it could show.
 *
 * A copy is a `portfolio_entries` row (a LOT, which may hold several identical cards — hence
 * `quantity`, and hence availability counted per entry rather than a set of taken ids). A pocket
 * claims one by stamping `DemoSlot.sourceEntryId`, the column that shipped for the rebuild importer
 * and is now what every placement path uses.
 *
 * ASPIRATIONAL PLACEMENT IS STILL LEGAL and still the default for a card you do not own: a binder
 * of cards you are hunting is the whole point of browsing. What is no longer legal is a pocket
 * holding a card you DO own without saying which one, because that is the state that could not be
 * counted, could not be reclaimed, and could not show its own photo.
 *
 * Pure and dependency-light so `node --test` can run it (see ownedCopies.test.ts).
 */

/** One owned lot: a `portfolio_entries` row, which is one or more identical physical cards. */
export interface OwnedEntry {
  entryId: string;
  cardId: string;
  /** How many identical cards this lot holds. Always >= 1. */
  quantity: number;
  /** Whether this lot has a scan photo. A scanned copy is the one worth tying to a pocket. */
  hasScan: boolean;
  /** The camera moment, for a stable and sensible preference order. */
  scannedAt: string | null;
}

/** Anything that can claim a copy: a binder slot, reduced to the only field that matters here. */
export interface CopyClaim {
  sourceEntryId?: string;
}

/**
 * How many copies of each lot are already sitting in a pocket.
 *
 * Counts CLAIMS, not distinct slots, because a lot of three can legitimately fill three pockets.
 * An id nothing owns any more (the lot was deleted in tcgscan) still counts here and is simply
 * absent from `entries`; availability then reads zero for it, which is the honest answer.
 */
export function claimedByEntry(claims: readonly CopyClaim[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of claims) {
    if (!c.sourceEntryId) continue;
    out.set(c.sourceEntryId, (out.get(c.sourceEntryId) ?? 0) + 1);
  }
  return out;
}

/** Copies of this lot not yet in a pocket. Never negative: an over-claimed lot reads zero. */
export function availableOf(entry: OwnedEntry, claimed: ReadonlyMap<string, number>): number {
  return Math.max(0, entry.quantity - (claimed.get(entry.entryId) ?? 0));
}

/**
 * Every unplaced copy of one card, in the order a placement should take them.
 *
 * SCANNED COPIES FIRST, newest scan first, then by id. A pocket that can show the real card should,
 * and among photos the newest is the one taken with the current camera path. The final id
 * tie-break is what stops two identical lots from swapping places between renders.
 */
export function availableCopiesOf(
  cardId: string,
  entries: readonly OwnedEntry[],
  claimed: ReadonlyMap<string, number>,
): OwnedEntry[] {
  return entries
    .filter((e) => e.cardId === cardId && availableOf(e, claimed) > 0)
    .sort(
      (a, b) =>
        Number(b.hasScan) - Number(a.hasScan) ||
        (b.scannedAt ?? '').localeCompare(a.scannedAt ?? '') ||
        a.entryId.localeCompare(b.entryId),
    );
}

/** Total unplaced copies of a card, across every lot holding it. */
export function freeCopiesOf(
  cardId: string,
  entries: readonly OwnedEntry[],
  claimed: ReadonlyMap<string, number>,
): number {
  return entries
    .filter((e) => e.cardId === cardId)
    .reduce((n, e) => n + availableOf(e, claimed), 0);
}

/**
 * Choose a copy for each card about to be placed, consuming availability ACROSS THE BATCH.
 *
 * Returns one entry per input card, in order, `undefined` where the user owns no free copy — that
 * placement is aspirational and stays so. Adding three of a card you own two of ties two pockets
 * to your two cards and leaves the third wishing, which is exactly what the shelf looks like.
 *
 * The running tally is why this is one function and not a call per card: a per-card loop reading
 * the same `claimed` map would hand the same copy to all three.
 */
export function assignCopies(
  cardIds: readonly string[],
  entries: readonly OwnedEntry[],
  claimed: ReadonlyMap<string, number>,
): (string | undefined)[] {
  const running = new Map(claimed);
  return cardIds.map((cardId) => {
    const next = availableCopiesOf(cardId, entries, running)[0];
    if (!next) return undefined;
    running.set(next.entryId, (running.get(next.entryId) ?? 0) + 1);
    return next.entryId;
  });
}

/**
 * The toast suffix for pockets that stayed aspirational because the OWNED copies ran out — the
 * feedback for over-placement, which used to happen in silence. One shared string so browse, home
 * and the binder editor say it the same way. Empty when nothing was left out (including the
 * never-owned case: an aspirational pocket for a card you are hunting is the design default and
 * not worth a warning).
 *
 * `shortfall` counts pockets for cards the user OWNS that could not claim a free copy; `total` is
 * how many cards the add placed (1 switches to the friendlier single-card phrasing).
 */
export function catalogArtNote(shortfall: number, total: number): string {
  if (shortfall <= 0) return '';
  // The FACT leads and the reason trails, so a clipped tail loses the why, never the what.
  if (total === 1) return ' · this one shows catalogue art since your copies are all in pockets';
  return ` · ${shortfall} show${shortfall === 1 ? 's' : ''} catalogue art (no free copies left)`;
}

/**
 * TCG-035 PULL LIST, the Michi half: which physical copy each pocket of a binder should be pulled
 * from, so BiBo can walk the owner to every card and move them all in one commit.
 *
 * BiBo owns the list (its tables, the checklist, the commit and the undo). Michi only PLANS it:
 * one item per pocket holding a card the owner has, naming the copy (a portfolio_entries lot) and
 * the pocket it goes to. The commit stamps `binder_slots.source_entry_id` with that same copy, so
 * ownedCopies' owned-versus-placed counts stay right without anything extra here.
 *
 * COPY CHOICE (TCG-035 step 2):
 *   1. A pocket that already claims a copy keeps it. The owner, or an earlier fill, chose it.
 *   2. Otherwise the cheapest copy to fetch: loose, then a stack or box, then another binder.
 *      Pulling from a binder empties a pocket somewhere else, so it goes last.
 *   3. Ties fall back to ownedCopies' own order (scanned first, newest scan, id).
 * Availability is consumed across the whole batch, like assignCopies, so two pockets of one card
 * never name the same single copy.
 *
 * Pure and dependency-light so `node --test` can run it (see pullList.test.ts).
 */
import { availableCopiesOf, type OwnedEntry } from './ownedCopies.ts';

/** Where a copy physically sits, from BiBo's storage_units.kind. */
export type CopySpot = 'loose' | 'stack' | 'box' | 'binder';

const SPOT_RANK: Record<CopySpot, number> = { loose: 0, stack: 1, box: 1, binder: 2 };

/** The pocket fields the planner reads. */
export interface PullPocket {
  slotId: string;
  cardId?: string;
  type: string;
  sourceEntryId?: string;
  /** 1-based, as a person counts them. */
  page: number;
  pocket: number;
}

export interface PullItem {
  slotId: string;
  cardId: string;
  entryId: string;
  page: number;
  pocket: number;
  spot: CopySpot;
}

export interface PullPlan {
  items: PullItem[];
  /** Pockets for owned cards whose copies are all placed elsewhere. */
  short: number;
}

/** The pockets of a binder, numbered the way a person counts them (page 1, pocket 1 top-left). */
export function pocketsOf(
  pages: readonly { rows: number; cols: number; slots: readonly { id: string; row: number; col: number; type: string; cardId?: string; sourceEntryId?: string }[] }[],
): PullPocket[] {
  const out: PullPocket[] = [];
  pages.forEach((p, i) => {
    for (const s of p.slots) {
      out.push({
        slotId: s.id,
        cardId: s.cardId,
        type: s.type,
        sourceEntryId: s.sourceEntryId,
        page: i + 1,
        pocket: s.row * Math.max(1, p.cols) + s.col + 1,
      });
    }
  });
  return out;
}

/**
 * Plan the pull for one binder.
 *
 * `claimed` is claimedByEntry over EVERY pocket of every binder (this one included), so a copy
 * already placed elsewhere is not offered twice. A pocket's own stamp is honoured even when the lot
 * reads over-claimed: it is the pocket that already holds it.
 * `spotOf` maps an entry id to where it sits; an entry it does not know reads as loose.
 */
export function planPull(
  pockets: readonly PullPocket[],
  entries: readonly OwnedEntry[],
  claimed: ReadonlyMap<string, number>,
  spotOf: (entryId: string) => CopySpot,
): PullPlan {
  const byId = new Map(entries.map((e) => [e.entryId, e]));
  const running = new Map(claimed);
  const items: PullItem[] = [];
  let short = 0;
  const cardPockets = pockets.filter((p) => p.type === 'card' && p.cardId);
  // Stamped pockets first, so their copies are spoken for before the free choice runs.
  for (const p of cardPockets) {
    const e = p.sourceEntryId ? byId.get(p.sourceEntryId) : undefined;
    if (!e || e.cardId !== p.cardId) continue;
    items.push({ slotId: p.slotId, cardId: e.cardId, entryId: e.entryId, page: p.page, pocket: p.pocket, spot: spotOf(e.entryId) });
  }
  const done = new Set(items.map((i) => i.slotId));
  for (const p of cardPockets) {
    if (done.has(p.slotId)) continue;
    const cardId = p.cardId!;
    if (!entries.some((e) => e.cardId === cardId)) continue; // never owned: a card being hunted
    const options = availableCopiesOf(cardId, entries, running);
    // A stable sort keeps ownedCopies' order inside each spot.
    const pick = options
      .map((e, i) => ({ e, i }))
      .sort((a, b) => SPOT_RANK[spotOf(a.e.entryId)] - SPOT_RANK[spotOf(b.e.entryId)] || a.i - b.i)[0]?.e;
    if (!pick) {
      short++;
      continue;
    }
    running.set(pick.entryId, (running.get(pick.entryId) ?? 0) + 1);
    items.push({ slotId: p.slotId, cardId, entryId: pick.entryId, page: p.page, pocket: p.pocket, spot: spotOf(pick.entryId) });
  }
  items.sort((a, b) => a.page - b.page || a.pocket - b.pocket);
  return { items, short };
}

/** The button's one line of status. Plain words, no counts the owner has to decode. */
export function pullSummary(plan: PullPlan): string {
  const n = plan.items.length;
  if (n === 0) return 'No cards from your collection on this binder yet.';
  const cards = n === 1 ? '1 card' : `${n} cards`;
  return plan.short > 0 ? `${cards} to pull. ${plan.short} more ${plan.short === 1 ? "has" : "have"} no free copy.` : `${cards} to pull.`;
}

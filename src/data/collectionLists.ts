/**
 * MIC-041: THE WANT LIST AND THE TRADE LIST, the pure part.
 *
 * A pocket's corner circle cycles NO > WANT > OWNED > TRADE > NO (owner, 2026-11-26):
 *   - NO: today's faint green ring, nothing recorded;
 *   - WANT: a white heart on light blue; a row in card_wants (per CARD, with a quantity);
 *   - OWNED: today's green check; a copy in portfolio_entries (user_cards rolls it up);
 *   - TRADE: ⇄ on amber; a row in entry_trades for the owned COPY (per copy, so a collector with
 *     three copies can offer one, and keep the graded one).
 * Wants and trade marks live in Michi-owned tables so BiBo's sync never overwrites them (see the
 * migration 20261126120000_want_trade_lists.sql).
 */

export type PocketState = 'no' | 'want' | 'owned' | 'trade';

export const POCKET_CYCLE: readonly PocketState[] = ['no', 'want', 'owned', 'trade'];

export function nextPocketState(s: PocketState): PocketState {
  return POCKET_CYCLE[(POCKET_CYCLE.indexOf(s) + 1) % POCKET_CYCLE.length];
}

/**
 * What a pocket shows. Owning beats wanting: a want left over after the card arrived never hides
 * the check. TRADE needs an owned copy; a trade mark on a copy that is gone reads as NO.
 */
export function pocketStateOf(
  cardId: string,
  owned: ReadonlySet<string>,
  wanted: ReadonlySet<string>,
  traded: ReadonlySet<string>,
): PocketState {
  if (owned.has(cardId)) return traded.has(cardId) ? 'trade' : 'owned';
  return wanted.has(cardId) ? 'want' : 'no';
}

/** What one tap does, as steps the screen runs in order. */
export type PocketStep =
  | { kind: 'addWant' }
  | { kind: 'removeWant' }
  | { kind: 'markOwned' }
  | { kind: 'markTrade' }
  | { kind: 'unmarkTrade' }
  | { kind: 'unmarkOwned' };

export function stepsFor(from: PocketState): PocketStep[] {
  switch (from) {
    case 'no':
      return [{ kind: 'addWant' }];
    case 'want':
      return [{ kind: 'removeWant' }, { kind: 'markOwned' }];
    case 'owned':
      return [{ kind: 'markTrade' }];
    case 'trade':
      return [{ kind: 'unmarkTrade' }, { kind: 'unmarkOwned' }];
  }
}

export const POCKET_LABEL: Record<PocketState, string> = {
  no: 'Not owned, tap to want',
  want: 'Wanted, tap to mark as owned',
  owned: 'Owned, tap to mark for trade',
  trade: 'For trade, tap to clear',
};

/** Which copy a TRADE mark lands on: the one placed in this pocket, else a scanned one, else any. */
export function tradeCopyFor<E extends { entryId: string; cardId: string; hasScan: boolean }>(
  cardId: string,
  placedEntryId: string | undefined,
  entries: readonly E[],
): E | undefined {
  const mine = entries.filter((e) => e.cardId === cardId);
  return mine.find((e) => e.entryId === placedEntryId) ?? mine.find((e) => !e.hasScan) ?? mine[0];
}

/** The cards on a binder that are not owned and not already wanted: what "Mark every card I don't own as WANT" adds. */
export function unownedToWant(cardIds: Iterable<string>, owned: ReadonlySet<string>, wanted: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const id of cardIds) if (id && !owned.has(id) && !wanted.has(id)) out.add(id);
  return [...out];
}

// The collection table ------------------------------------------------------------------------

export interface CopyRow {
  entryId: string;
  cardId: string;
  quantity: number;
  variant: string;
  condition?: string | null;
  hasScan: boolean;
}
export interface WantRow {
  cardId: string;
  quantity: number;
}
export interface TradeRow {
  entryId: string;
  quantity: number;
}
export interface TableRow {
  cardId: string;
  owned: number;
  want: number;
  trade: number;
  copies: (CopyRow & { trade: number })[];
}

/** One row per card that is owned, wanted or offered: owned | want | trade, and the copies under it. */
export function collectionTable(copies: readonly CopyRow[], wants: readonly WantRow[], trades: readonly TradeRow[]): TableRow[] {
  const tradeBy = new Map(trades.map((t) => [t.entryId, t.quantity]));
  const rows = new Map<string, TableRow>();
  const row = (cardId: string) => {
    let r = rows.get(cardId);
    if (!r) rows.set(cardId, (r = { cardId, owned: 0, want: 0, trade: 0, copies: [] }));
    return r;
  };
  for (const c of copies) {
    const q = Math.max(1, c.quantity);
    // A trade mark never offers more than the copy holds (BiBo may lower a quantity later).
    const t = Math.min(tradeBy.get(c.entryId) ?? 0, q);
    const r = row(c.cardId);
    r.owned += q;
    r.trade += t;
    r.copies.push({ ...c, trade: t });
  }
  for (const w of wants) row(w.cardId).want += Math.max(1, w.quantity);
  return [...rows.values()];
}

export type TableFilter = 'all' | 'owned' | 'want' | 'trade';

export function filterTable(rows: readonly TableRow[], f: TableFilter): TableRow[] {
  if (f === 'all') return [...rows];
  return rows.filter((r) => r[f] > 0);
}

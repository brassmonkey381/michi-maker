/**
 * MIC-041: the signed-in account's Want and Trade lists, one copy for the whole app.
 *
 * One module-level store per account, read through useSyncExternalStore WITH THE SNAPSHOT AS THE
 * VALUE (MIC-077: the React Compiler memoizes a read that sits outside the store call, which froze
 * every view chip on the live site). Writes patch the store first, then save; a failed save puts
 * the previous lists back and says so.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { TradeRow, WantRow } from '@/data/collectionLists';
import {
  addWants,
  fetchMyLists,
  markTrade as saveTrade,
  removeWant as deleteWant,
  setWantQuantity as saveWantQuantity,
  unmarkTrade as deleteTrades,
} from '@/data/listsRepo';
import { useAuth } from '@/store/auth';

type Snap = { userId: string; wants: WantRow[]; trades: TradeRow[] } | null;

let snap: Snap = null;
let loading: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getSnap = () => snap;
function put(next: Snap) {
  snap = next;
  for (const fn of listeners) fn();
}

function load(userId: string, force = false) {
  if (!force && (loading === userId || snap?.userId === userId)) return;
  loading = userId;
  fetchMyLists(userId)
    .then((l) => {
      if (loading === userId) put({ userId, ...l });
    })
    .catch(() => {
      // Not live yet, or offline: empty lists, and the circles still show owned as before.
      if (loading === userId) put({ userId, wants: [], trades: [] });
    })
    .finally(() => {
      if (loading === userId) loading = null;
    });
}

export interface CollectionLists {
  ready: boolean;
  wants: WantRow[];
  trades: TradeRow[];
  wantedIds: ReadonlySet<string>;
  tradedEntryIds: ReadonlySet<string>;
  addWant: (cardIds: string[]) => Promise<void>;
  removeWant: (cardId: string) => Promise<void>;
  setWantQuantity: (cardId: string, quantity: number) => Promise<void>;
  markTrade: (entryId: string, quantity?: number) => Promise<void>;
  unmarkTrade: (entryIds: string[]) => Promise<void>;
  reload: () => void;
}

const EMPTY_W: WantRow[] = [];
const EMPTY_T: TradeRow[] = [];

export function useCollectionLists(): CollectionLists {
  const { user } = useAuth();
  const userId = user && !user.is_anonymous ? user.id : null;
  const s = useSyncExternalStore(subscribe, getSnap, getSnap);

  useEffect(() => {
    if (userId) load(userId);
  }, [userId]);

  const mine = s && s.userId === userId ? s : null;
  const wants = mine?.wants ?? EMPTY_W;
  const trades = mine?.trades ?? EMPTY_T;
  const wantedIds = useMemo(() => new Set(wants.map((w) => w.cardId)), [wants]);
  const tradedEntryIds = useMemo(() => new Set(trades.map((t) => t.entryId)), [trades]);

  /** Patch, save, and put it back if the save fails. */
  const apply = useCallback(
    async (patch: (w: WantRow[], t: TradeRow[]) => { wants: WantRow[]; trades: TradeRow[] }, save: () => Promise<void>) => {
      if (!userId) throw new Error('Sign in to keep a Want list');
      const before = snap && snap.userId === userId ? snap : { userId, wants: [], trades: [] };
      put({ userId, ...patch(before.wants, before.trades) });
      try {
        await save();
      } catch (e) {
        put(before);
        throw e;
      }
    },
    [userId],
  );

  const addWant = useCallback(
    (cardIds: string[]) =>
      apply(
        (w, t) => {
          const have = new Set(w.map((x) => x.cardId));
          return { wants: [...cardIds.filter((id) => !have.has(id)).map((cardId) => ({ cardId, quantity: 1 })), ...w], trades: t };
        },
        () => addWants(userId!, cardIds),
      ),
    [apply, userId],
  );
  const removeWant = useCallback(
    (cardId: string) => apply((w, t) => ({ wants: w.filter((x) => x.cardId !== cardId), trades: t }), () => deleteWant(userId!, cardId)),
    [apply, userId],
  );
  const setWantQuantity = useCallback(
    (cardId: string, quantity: number) =>
      apply(
        (w, t) => ({
          wants: quantity <= 0 ? w.filter((x) => x.cardId !== cardId) : w.some((x) => x.cardId === cardId) ? w.map((x) => (x.cardId === cardId ? { ...x, quantity } : x)) : [{ cardId, quantity }, ...w],
          trades: t,
        }),
        () => saveWantQuantity(userId!, cardId, quantity),
      ),
    [apply, userId],
  );
  const markTrade = useCallback(
    (entryId: string, quantity = 1) =>
      apply((w, t) => ({ wants: w, trades: [{ entryId, quantity }, ...t.filter((x) => x.entryId !== entryId)] }), () => saveTrade(userId!, entryId, quantity)),
    [apply, userId],
  );
  const unmarkTrade = useCallback(
    (entryIds: string[]) =>
      apply((w, t) => ({ wants: w, trades: t.filter((x) => !entryIds.includes(x.entryId)) }), () => deleteTrades(userId!, entryIds)),
    [apply, userId],
  );
  const reload = useCallback(() => {
    if (userId) load(userId, true);
  }, [userId]);

  return { ready: !!mine, wants, trades, wantedIds, tradedEntryIds, addWant, removeWant, setWantQuantity, markTrade, unmarkTrade, reload };
}

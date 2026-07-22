/**
 * The signed-in user's owned-card id set (own ≥ 1 copy), from the `user_cards` inventory —
 * the collection-aware layer the browse kit consumes via its `ownedIds` prop (tile checks, set
 * completion %, the have: filter chip). Live: re-derives on any scan/import change.
 *
 * Returns `undefined` for guests / unconfigured Supabase / before the first load, so the kit's
 * optional `ownedIds` simply stays off (no collection UI) until real inventory arrives.
 */
import { useEffect, useMemo, useState } from 'react';

import { fetchUserCards, subscribeUserCards, type UserCard } from '@/data/collectionRepo';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

export function useOwnedCards(): ReadonlySet<string> | undefined {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Rows are keyed by the identity they were loaded for, so a signed-out (or switched) user is
  // derived as "no inventory" during render — no reset-setState in the effect, no stale leak.
  const [cards, setCards] = useState<{ userId: string; rows: UserCard[] } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    const load = () =>
      fetchUserCards()
        .then((rows) => {
          if (active) setCards({ userId, rows });
        })
        .catch(() => {});
    load();
    const unsubscribe = subscribeUserCards(userId, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  const rows = cards && cards.userId === userId ? cards.rows : null;

  // undefined (not empty) until the first inventory load, so the kit shows no collection UI at all
  // for guests — an empty Set would (incorrectly) mark every card "missing".
  return useMemo(() => (rows ? new Set(rows.map((c) => c.cardId)) : undefined), [rows]);
}

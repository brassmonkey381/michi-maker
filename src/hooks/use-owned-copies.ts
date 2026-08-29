/**
 * Which of the user's physical cards a placement should claim.
 *
 * Every "add this card to a binder" path in the app goes through `useCopyAssigner`, and that is the
 * point: the accounting used to depend on WHICH SCREEN you added from — the collection marked its
 * pockets as owned, browse and the editor did not — so the same card placed from browse never cost
 * a copy and could be placed for ever (see ownedCopies.ts for the report this comes from).
 *
 * The assignment is derived, never stored: owned lots come from tcgscan, claims come from the
 * binders already in the store, and availability is the difference at the moment of the tap.
 *
 * FETCH-ONCE PER IDENTITY, deliberately unsubscribed, exactly like useScanImages. Ownership changes
 * when the user scans or edits in tcgscan, which is not something that happens while they are
 * dragging cards into a binder here; a realtime feed on portfolio_entries would re-derive this map
 * on every quantity edit. The cost is that a copy scanned mid-session is not offered until the next
 * load, which reads as "it isn't there yet", not as an error.
 */
import { useCallback, useEffect, useState } from 'react';

import { fetchOwnedEntries } from '@/data/collectionRepo';
import {
  assignCopies,
  availableCopiesOf,
  claimedByEntry,
  type OwnedEntry,
} from '@/data/ownedCopies';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';
import { useBinders } from '@/store/binders';

/** The user's owned lots, or undefined for guests / no backend / before the first load. */
export function useOwnedCopies(): OwnedEntry[] | undefined {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Keyed by the identity it was loaded for, so a signed-out or switched account derives to "owns
  // nothing" during render rather than lending the previous user's cards to a pocket.
  const [loaded, setLoaded] = useState<{ userId: string; entries: OwnedEntry[] } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let active = true;
    fetchOwnedEntries()
      .then((entries) => {
        if (active) setLoaded({ userId, entries });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  return loaded && loaded.userId === userId ? loaded.entries : undefined;
}

/**
 * `assign(cardIds)` → the copy each placement should claim, `undefined` where the user owns no free
 * one (an aspirational pocket, which stays perfectly legal — a binder of cards you are hunting is
 * what browsing is for).
 *
 * Claims are read across EVERY binder the user has, not just the one being added to: a card is in a
 * pocket or it is not, and which binder that pocket belongs to has nothing to do with it.
 */
export function useCopyAssigner(): (cardIds: string[]) => (string | undefined)[] {
  const entries = useOwnedCopies();
  const { userBinders } = useBinders();
  return useCallback(
    (cardIds: string[]) => {
      if (!entries || entries.length === 0) return cardIds.map(() => undefined);
      const claims = userBinders.flatMap((b) => b.pages.flatMap((p) => p.slots));
      return assignCopies(cardIds, entries, claimedByEntry(claims));
    },
    [entries, userBinders],
  );
}

/**
 * `available(cardId)` → this card's unplaced copies, best first — what the copy picker offers.
 *
 * The same derivation as useCopyAssigner, exposed as a list rather than a choice, because the whole
 * point of the picker is that the choice is the user's. Empty means there is nothing to ask about:
 * either they own none, or every copy is already in a pocket.
 */
export function useAvailableCopies(): (cardId: string) => OwnedEntry[] {
  const entries = useOwnedCopies();
  const { userBinders } = useBinders();
  return useCallback(
    (cardId: string) => {
      if (!entries || entries.length === 0) return [];
      const claims = userBinders.flatMap((b) => b.pages.flatMap((p) => p.slots));
      return availableCopiesOf(cardId, entries, claimedByEntry(claims));
    },
    [entries, userBinders],
  );
}

/**
 * Paid-product unlocks — does the signed-in user own `product` (e.g. 'pdf_binder:<id>')?
 *
 * Reads the owner's row from `entitlements` (owner-only RLS; grants are server-side only —
 * manual SQL today, a payment webhook later, see supabase/migrations/20260715120000). The
 * check re-runs when the user identity changes, and `refresh()` lets a purchase flow re-poll
 * after checkout completes.
 *
 * Guests and signed-out visitors are never entitled. The resolved answer is keyed to the
 * user id it was fetched for, so an account switch can't leak a stale unlock — until the new
 * account's query lands, the hook reports `loading` with `unlocked: false`.
 *
 * AN EXPIRED ROW IS NOT AN UNLOCK. The RLS select policy is owner-scoped with no expiry
 * predicate, so a lapsed row comes back to the client like any other and `expires_at` has to be
 * checked HERE. It is checked through tiers.isActive rather than by hand, so this agrees with
 * how every other surface decides the same question.
 *
 * NOTHING CALLS THIS TODAY (2026-09-22). It is kept because it is the right shape for a
 * per-product unlock, and made correct because a dead hook that answers "yes" for a refunded or
 * lapsed purchase is worse than no hook at all.
 */
import { useCallback, useEffect, useState } from 'react';

import { isActive } from '@/data/tiers';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

export function useEntitlement(product: string): {
  unlocked: boolean;
  loading: boolean;
  refresh: () => void;
} {
  const { user, isSignedIn } = useAuth();
  // The last resolved answer, tagged with the uid it belongs to (no cross-account leaks).
  const [state, setState] = useState<{ uid: string; unlocked: boolean } | null>(null);
  // Bump to re-run the query (e.g. right after a manual/checkout grant).
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    if (!supabase || !isSignedIn || !user) return;
    let live = true;
    supabase
      .from('entitlements')
      .select('product, expires_at')
      .eq('user_id', user.id)
      .eq('product', product)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const unlocked = !!data && isActive({ product: data.product, expires_at: data.expires_at }, Date.now());
        setState({ uid: user.id, unlocked });
      });
    return () => {
      live = false;
    };
  }, [isSignedIn, user, product, generation]);

  const known = !!user && state?.uid === user.id;
  return {
    unlocked: isSignedIn && known && !!state?.unlocked,
    loading: !!supabase && isSignedIn && !!user && !known,
    refresh,
  };
}

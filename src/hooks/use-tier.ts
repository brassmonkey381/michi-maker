/**
 * The signed-in user's effective TIER + limits, resolved from their `entitlements` rows.
 *
 * One read per identity, keyed to the uid it was fetched for (no cross-account leaks — same
 * discipline as useEntitlement). Guests (anonymous / signed-out) never query and always resolve
 * to the 'guest' tier. `refresh()` re-polls after a checkout completes (webhooks lag by seconds).
 *
 * The limit matrix comes back permissive (unlimited) until `LIMITS_ENFORCED` is flipped in
 * src/data/tiers.ts — so this hook is safe to wire into gates now; nothing bites until then.
 * `hasFullPrint` is independent of that switch (it only ever grants print, per the grandfather
 * clause), so the print unlock works the moment a grant lands.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  hasFullPrint as computeFullPrint,
  limitsForTier,
  resolveTier,
  type EntitlementRow,
  type Tier,
  type TierLimits,
} from '@/data/tiers';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

interface TierState {
  uid: string;
  tier: Tier;
  hasFullPrint: boolean;
}

export interface UseTier {
  tier: Tier;
  limits: TierLimits;
  /** Full fill-sheet / placeholder PDF export (PRO/VIP or a grandfathered pdf_print unlock). */
  hasFullPrint: boolean;
  /** A paid subscriber (PRO or VIP). */
  isPaid: boolean;
  /** True while the first query for the current identity is still in flight. */
  loading: boolean;
  refresh: () => void;
}

export function useTier(): UseTier {
  const { user, isSignedIn } = useAuth();
  const [state, setState] = useState<TierState | null>(null);
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    // Only real accounts can hold paid tiers; guests never query (they're always 'guest').
    if (!supabase || !isSignedIn || !user) return;
    let live = true;
    supabase
      .from('entitlements')
      // Select '*' (not an explicit 'expires_at') so this query still succeeds if the
      // 20260715130000 term-support migration hasn't been applied yet — a missing column is
      // then simply absent from each row and read as null (lifetime) below. Existing pdf_print
      // holders never lose print to a migration-ordering gap.
      .select('*')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!live) return;
        const rows: EntitlementRow[] = (data ?? []).map((r) => ({
          product: r.product,
          expires_at: (r as { expires_at?: string | null }).expires_at ?? null,
        }));
        // Resolve against "now" here in the effect — never call the clock during render.
        const now = Date.now();
        const tier = resolveTier({ isSignedIn: true, rows }, now);
        setState({ uid: user.id, tier, hasFullPrint: computeFullPrint(tier, rows, now) });
      });
    return () => {
      live = false;
    };
  }, [isSignedIn, user, generation]);

  const known = isSignedIn && !!user && state?.uid === user.id;
  const tier: Tier = known ? state!.tier : 'guest';

  return {
    tier,
    limits: limitsForTier(tier),
    hasFullPrint: known ? state!.hasFullPrint : false,
    isPaid: tier === 'pro' || tier === 'vip',
    loading: !!supabase && isSignedIn && !!user && !known,
    refresh,
  };
}

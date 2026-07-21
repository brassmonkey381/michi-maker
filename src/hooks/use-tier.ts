/**
 * The signed-in user's effective TIER + limits, resolved from their `entitlements` rows.
 *
 * One read per identity, keyed to the uid it was fetched for (no cross-account leaks — same
 * discipline as useEntitlement). Guests (anonymous / signed-out) never query and always resolve
 * to the 'guest' tier. `refresh()` re-polls after a checkout completes (webhooks lag by seconds).
 *
 * The limit matrix comes back permissive (unlimited) until `LIMITS_ENFORCED` is flipped in
 * src/data/tiers.ts — so this hook is safe to wire into gates now; nothing bites until then.
 * `hasFullPrint` is independent of that switch: full print of your own binders is a PRO/VIP
 * subscription perk (one-time prints are per-binder, checked via `products`).
 */
import { useCallback, useEffect, useState } from 'react';

import type { BillingInterval } from '@/data/printWindow';
import {
  hasFullPrint as computeFullPrint,
  hasTcgscanPro as computeTcgscanPro,
  tcgscanLevel as computeTcgscanLevel,
  isActive,
  limitsForTier,
  PRODUCTS,
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
  hasTcgscanPro: boolean;
  tcgscanLevel: 'pro' | 'vip' | null;
  products: string[];
  interval: BillingInterval | null;
  periodStart: string | null;
  termAllocation: number | null;
}

export interface UseTier {
  tier: Tier;
  limits: TierLimits;
  /** Full fill-sheet / placeholder PDF export of your own binders (included with PRO/VIP). */
  hasFullPrint: boolean;
  /** A paid subscriber (PRO or VIP). */
  isPaid: boolean;
  /** CROSS-APP: holds ANY paid TCGScan tier (PRO or VIP) — unlocks scan-powered features. */
  hasTcgscanPro: boolean;
  /** CROSS-APP: the sibling tcgscan account's exact paid level ('vip' > 'pro' > null). */
  tcgscanLevel: 'pro' | 'vip' | null;
  /** ACTIVE product keys, for direct checks (e.g. the per-binder `pdf_binder:<id>` unlock). */
  products: string[];
  /**
   * How the ACTIVE tier subscription is billed. null for free/guest, manual grants, and rows
   * written before the interval column existed. Yearly is what makes the annual print pool
   * offerable (see src/data/printWindow.ts).
   */
  interval: BillingInterval | null;
  /** ISO start of the active tier's CURRENT billing term; null when there isn't one. */
  periodStart: string | null;
  /**
   * Included prints for the WHOLE current term — the annual pool total, already prorated by the
   * webhook when the user upgraded mid-term. null = fall back to a full year at the current rate.
   */
  termAllocation: number | null;
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
      // then simply absent from each row and read as null (lifetime) below.
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
        // Billing shape of the row that WON the tier resolution (a VIP row's term is the one
        // that matters when someone holds both). Absent columns read as null — same defensive
        // stance as the select('*') above.
        const tierProduct =
          tier === 'vip' ? PRODUCTS.tierVip : tier === 'pro' ? PRODUCTS.tierPro : null;
        const tierRow = tierProduct
          ? (data ?? []).find(
              (r) =>
                r.product === tierProduct &&
                isActive(
                  { product: r.product, expires_at: (r as { expires_at?: string | null }).expires_at ?? null },
                  now,
                ),
            )
          : undefined;
        const rawInterval = (tierRow as { interval?: unknown } | undefined)?.interval;
        setState({
          uid: user.id,
          tier,
          hasFullPrint: computeFullPrint(tier),
          hasTcgscanPro: computeTcgscanPro(rows, now),
          tcgscanLevel: computeTcgscanLevel(rows, now),
          products: rows.filter((r) => isActive(r, now)).map((r) => r.product),
          interval: rawInterval === 'month' || rawInterval === 'year' ? rawInterval : null,
          periodStart:
            (tierRow as { period_start?: string | null } | undefined)?.period_start ?? null,
          termAllocation:
            (tierRow as { term_print_allocation?: number | null } | undefined)
              ?.term_print_allocation ?? null,
        });
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
    hasTcgscanPro: known ? state!.hasTcgscanPro : false,
    tcgscanLevel: known ? state!.tcgscanLevel : null,
    products: known ? state!.products : [],
    interval: known ? state!.interval : null,
    periodStart: known ? state!.periodStart : null,
    termAllocation: known ? state!.termAllocation : null,
    loading: !!supabase && isSignedIn && !!user && !known,
    refresh,
  };
}

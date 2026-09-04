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
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { BillingInterval } from '@/data/printWindow';
import {
  hasFullPrint as computeFullPrint,
  hasAdvancedSearch as computeAdvancedSearch,
  hasFindSimilar as computeFindSimilar,
  hasTcgscanPro as computeTcgscanPro,
  michiIsPaid as computeMichiIsPaid,
  tcgscanIsPaid as computeTcgscanIsPaid,
  tcgscanIsYearly as computeTcgscanIsYearly,
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
  /** CROSS-APP: holds a PAID (non-trial) tcgscan tier - the server's bundle condition. */
  tcgscanIsPaid: boolean;
  /** Holds a PAID (non-trial) michi tier. False while trialling. */
  michiIsPaid: boolean;
  tcgscanLevel: 'pro' | 'vip' | null;
  tcgscanIsYearly: boolean;
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
  /** "Advanced Search" (PRO/VIP): sort by value, price filters, tri-colour, refine by similarity. */
  hasAdvancedSearch: boolean;
  /** The visual-similarity search (PRO/VIP): "≈ Find similar" and "find similar to all". Its own
   *  flag rather than a corner of hasAdvancedSearch — they line up today but are sold apart. */
  hasFindSimilar: boolean;
  /** A paid subscriber (PRO or VIP). */
  isPaid: boolean;
  /** CROSS-APP: holds ANY ACTIVE TCGScan tier (PRO or VIP) — unlocks scan-powered features.
   *  TRUE ON A TRIAL; for bundle pricing use tcgscanIsPaid. */
  hasTcgscanPro: boolean;
  /** CROSS-APP: holds a PAID (non-trial) TCGScan tier — the server's bundle condition. */
  tcgscanIsPaid: boolean;
  /** Holds a PAID (non-trial) michi tier. False while trialling, unlike isPaid. */
  michiIsPaid: boolean;
  /** CROSS-APP: the sibling tcgscan account's exact paid level ('vip' > 'pro' > null). */
  tcgscanLevel: 'pro' | 'vip' | null;
  /** CROSS-APP: the qualifying tcgscan tier is billed YEARLY — gates the YEARLY bundle price so the
   *  page never shows a yearly 60% the server's bundleQualifies won't honour. */
  tcgscanIsYearly: boolean;
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

/**
 * Shared tier invalidation. `refresh()` re-polls EVERY mounted useTier, not only the caller's own
 * instance — so a tier change made in one place (a trial started in TrialCta) is reflected on the
 * screens that keep their own useTier (the plans page, the print sheet) instead of reading stale
 * until they remount. Mirrors useEntitlements' shared store on the tcgscan side.
 */
const tierListeners = new Set<() => void>();
export function refreshAllTiers(): void {
  // The cache is what every mount reads first, so an invalidation has to clear it — otherwise a
  // screen that remounts after a checkout would rehydrate the pre-purchase tier from memory.
  tierCache = null;
  for (const bump of tierListeners) bump();
}

/**
 * THE RESOLVED TIER, SHARED BY EVERY MOUNT. Module-level on purpose, and it fixes a real bug.
 *
 * This state used to be per-instance and start at null, so a component that mounted LATER spent
 * its first round trip reporting the `guest` tier — `known` is false until the query lands. Every
 * gate that asked during that window got the answer for a signed-out visitor.
 *
 * That is not theoretical. The card browser locks its paid features from `useTier`, and the
 * browse kit runs a handed-in similarity search ON MOUNT. So a VIP who opened Find similar from
 * the binder while the cards dock was CLOSED mounted the browser and the search in the same frame:
 * the search asked a hook that had not answered yet, read `guest`, and hit the PRO wall. With the
 * dock already open the browser had been mounted for a while, the tier was known, and the very
 * same action worked — which is exactly the kind of intermittent that never gets diagnosed.
 *
 * Sharing the answer means the second mount starts where the first finished. It also collapses N
 * mounted `useTier`s from N identical queries into one.
 */
let tierCache: TierState | null = null;
/** The in-flight read, so several mounts in one frame make ONE request. Keyed by uid. */
let tierInflight: { uid: string; promise: Promise<void> } | null = null;

/**
 * Read one identity's entitlements and resolve them into the shared cache.
 *
 * Deduplicated: mounts that arrive while a read is in flight await THAT read rather than starting
 * their own. A failed read leaves the cache empty and clears the in-flight slot, so the next mount
 * retries instead of inheriting a permanent 'guest'.
 */
function loadTier(uid: string): Promise<void> {
  if (tierInflight?.uid === uid) return tierInflight.promise;
  const client = supabase;
  if (!client) return Promise.resolve();
  // An async IIFE rather than a `.then` chain: supabase-js returns a PromiseLike, which has no
  // `catch`, so the failure path has to be a `try` here.
  const promise = (async () => {
    try {
      // Select '*' (not an explicit 'expires_at') so this query still succeeds if the
      // 20260715130000 term-support migration hasn't been applied yet — a missing column is
      // then simply absent from each row and read as null (lifetime) below.
      const { data } = await client.from('entitlements').select('*').eq('user_id', uid);
      const rows: EntitlementRow[] = (data ?? []).map((r) => ({
        product: r.product,
        expires_at: (r as { expires_at?: string | null }).expires_at ?? null,
        // Carried for the cross-app bundle's yearly term-match (tcgscanIsYearly); absent → null.
        interval: (r as { interval?: string | null }).interval ?? null,
        // Carried so the bundle price shown matches what checkout will charge: a TRIAL earns no
        // bundle (src/data/bundle.ts), and without this the page cannot tell a trialling sibling
        // from a paying one and would advertise a 60% the server refuses.
        source: (r as { source?: string | null }).source ?? null,
      }));
      // Resolve against "now" here rather than during render — never call the clock in render.
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
      tierCache = {
        uid,
        tier,
        hasFullPrint: computeFullPrint(tier),
        hasTcgscanPro: computeTcgscanPro(rows, now),
        tcgscanIsPaid: computeTcgscanIsPaid(rows, now),
        michiIsPaid: computeMichiIsPaid(rows, now),
        tcgscanLevel: computeTcgscanLevel(rows, now),
        tcgscanIsYearly: computeTcgscanIsYearly(rows, now),
        products: rows.filter((r) => isActive(r, now)).map((r) => r.product),
        interval: rawInterval === 'month' || rawInterval === 'year' ? rawInterval : null,
        periodStart: (tierRow as { period_start?: string | null } | undefined)?.period_start ?? null,
        termAllocation:
          (tierRow as { term_print_allocation?: number | null } | undefined)
            ?.term_print_allocation ?? null,
      };
    } catch {
      // Leave the cache empty and say nothing. Waking the listeners here would send every mounted
      // hook straight back into this function, which on a persistent failure is an endless retry
      // loop against the server. The next natural remount or refresh() tries again.
      if (tierInflight?.uid === uid) tierInflight = null;
      return;
    }
    if (tierInflight?.uid === uid) tierInflight = null;
    // Everyone else mounted right now is still showing 'guest'; tell them the answer landed.
    for (const bump of tierListeners) bump();
  })();
  tierInflight = { uid, promise };
  return promise;
}

/** Subscribe/read pair for the shared cache — the store behind every mounted useTier. */
function subscribeTier(onChange: () => void): () => void {
  tierListeners.add(onChange);
  return () => {
    tierListeners.delete(onChange);
  };
}
function tierSnapshot(): TierState | null {
  return tierCache;
}

export function useTier(): UseTier {
  const { user, isSignedIn } = useAuth();
  // READ STRAIGHT FROM THE SHARED CACHE, so a remount for an identity already resolved knows the
  // tier on its very first render, with no window in which it reports 'guest'. An external store
  // rather than local state copied in by an effect: the copy is what created the window.
  const state = useSyncExternalStore(subscribeTier, tierSnapshot, tierSnapshot);
  const refresh = useCallback(() => refreshAllTiers(), []);

  useEffect(() => {
    // Only real accounts can hold paid tiers; guests never query (they're always 'guest').
    if (!supabase || !isSignedIn || !user) return;
    // Nothing to do when this identity is already resolved. `state` is a dependency so that a
    // refresh() — which clears the cache and wakes every subscriber — lands back here and refetches.
    if (tierCache?.uid === user.id) return;
    void loadTier(user.id);
  }, [isSignedIn, user, state]);

  const known = isSignedIn && !!user && state?.uid === user.id;
  const tier: Tier = known ? state!.tier : 'guest';

  return {
    tier,
    limits: limitsForTier(tier),
    hasFullPrint: known ? state!.hasFullPrint : false,
    hasAdvancedSearch: computeAdvancedSearch(tier),
    hasFindSimilar: computeFindSimilar(tier),
    isPaid: tier === 'pro' || tier === 'vip',
    hasTcgscanPro: known ? state!.hasTcgscanPro : false,
    tcgscanIsPaid: known ? state!.tcgscanIsPaid : false,
    michiIsPaid: known ? state!.michiIsPaid : false,
    tcgscanLevel: known ? state!.tcgscanLevel : null,
    tcgscanIsYearly: known ? state!.tcgscanIsYearly : false,
    products: known ? state!.products : [],
    interval: known ? state!.interval : null,
    periodStart: known ? state!.periodStart : null,
    termAllocation: known ? state!.termAllocation : null,
    loading: !!supabase && isSignedIn && !!user && !known,
    refresh,
  };
}

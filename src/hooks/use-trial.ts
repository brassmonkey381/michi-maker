/**
 * The signed-in user's free-PRO-trial standing, plus the downgrade "reclaim grace" window that
 * drives the over-cap warning (see docs/PRO-TRIALS.md).
 *
 * Resolves from the `pro_trials` ledger + the caller's entitlement rows (source included, which
 * `useTier` doesn't expose). One fetch per identity, keyed to the uid, same discipline as useTier.
 * Guests never query. The `start_pro_trial()` RPC is the real eligibility gate; the `state` here
 * only decides what CTA to render.
 */
import { useCallback, useEffect, useState } from 'react';

import { fetchEntitlementDetails, type EntitlementDetail } from '@/data/entitlementRepo';
import { fetchTrialLedger, startProTrial } from '@/data/trial';
import { useAuth } from '@/store/auth';

/** eligible → offer the trial · active → running (show countdown) · used → trialed already ·
 *  ineligible → ever held a paid tier (never eligible). */
export type TrialState = 'eligible' | 'active' | 'used' | 'ineligible';

const TIER_PRODUCTS = ['tier_pro', 'tier_vip'];
const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Resolved {
  uid: string;
  state: TrialState;
  /** Active trial's end (ISO) for the countdown; null unless state === 'active'. */
  expiresAt: string | null;
  /** Whole days left in an active trial (computed at fetch, never during render). */
  daysLeft: number | null;
  /** True when the user held a tier that has lapsed and none is active now (a downgrade). */
  isDowngraded: boolean;
  /** When the reclaim grace ends (ISO): latest lapsed tier expiry + 3 days; null if never held one. */
  graceEndsAt: string | null;
}

function resolve(uid: string, ledger: { hasTrialed: boolean; expiresAt: string | null }, rows: EntitlementDetail[], now: number): Resolved {
  const tierRows = rows.filter((r) => TIER_PRODUCTS.includes(r.product));
  const isActive = (r: EntitlementDetail) => r.expiresAt == null || Date.parse(r.expiresAt) > now;
  const activeTier = tierRows.filter(isActive);
  const activeTrial = activeTier.find((r) => r.product === 'tier_pro' && r.source === 'trial');
  const paidActive = activeTier.some((r) => r.source !== 'trial');
  const everHeldPaid = tierRows.some((r) => r.source !== 'trial');

  // Downgrade grace: latest LAPSED tier expiry + 3 days, only when nothing is active now.
  const lapsedEnds = tierRows
    .filter((r) => r.expiresAt != null && Date.parse(r.expiresAt) <= now)
    .map((r) => Date.parse(r.expiresAt as string));
  const isDowngraded = activeTier.length === 0 && lapsedEnds.length > 0;
  const graceEndsAt = lapsedEnds.length > 0 ? new Date(Math.max(...lapsedEnds) + GRACE_DAYS * DAY_MS).toISOString() : null;

  let state: TrialState;
  if (activeTrial && !paidActive) state = 'active';
  else if (everHeldPaid) state = 'ineligible';
  else if (ledger.hasTrialed) state = 'used';
  else state = 'eligible';

  const expiresAt = activeTrial?.expiresAt ?? null;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / DAY_MS)) : null;
  return { uid, state, expiresAt, daysLeft, isDowngraded, graceEndsAt };
}

export interface UseTrial {
  loading: boolean;
  state: TrialState;
  /** Active trial end (ISO); null unless running. */
  expiresAt: string | null;
  /** Whole days left in an active trial (rounded up); null unless running. */
  daysLeft: number | null;
  /** Had a tier, none active now — i.e. a downgrade the reclaim grace applies to. */
  isDowngraded: boolean;
  /** When the over-cap reclaim grace ends (ISO); null if not a downgrade. */
  graceEndsAt: string | null;
  /** Start the trial (RPC). Rejects with the server's message on refusal. */
  start: () => Promise<void>;
  starting: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTrial(): UseTrial {
  const { user, isSignedIn } = useAuth();
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [generation, setGeneration] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    // Guests never query. Stale `resolved` from a prior session is gated by the uid check below,
    // so there's no need to null it synchronously here (which would be a set-state-in-effect).
    if (!isSignedIn || !user) return;
    let live = true;
    Promise.all([fetchTrialLedger(), fetchEntitlementDetails().catch(() => [])]).then(
      ([ledger, rows]) => {
        if (live) setResolved(resolve(user.id, ledger, rows, Date.now()));
      },
    );
    return () => {
      live = false;
    };
  }, [isSignedIn, user, generation]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await startProTrial();
      refresh();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setStarting(false);
    }
  }, [refresh]);

  const known = isSignedIn && !!user && resolved?.uid === user.id;

  return {
    loading: isSignedIn && !!user && !known,
    state: known ? resolved!.state : 'ineligible',
    expiresAt: known ? resolved!.expiresAt : null,
    daysLeft: known ? resolved!.daysLeft : null,
    isDowngraded: known ? resolved!.isDowngraded : false,
    graceEndsAt: known ? resolved!.graceEndsAt : null,
    start,
    starting,
    error,
    refresh,
  };
}

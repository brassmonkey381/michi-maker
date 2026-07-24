/**
 * The user's included-print standing: which window applies, how much of it is spent, and where
 * they stand with the annual pool. Both surfaces that talk about included prints — the print
 * sheet (PrintPlaceholdersSheet) and the plan meters (PlanUsageSection) — resolve through here,
 * so the number in the button and the number in the meter can never disagree.
 *
 * Takes the tier facts as INPUT rather than calling useTier itself: both callers already hold a
 * useTier() result, and useTier queries per call site (no shared cache), so re-reading it here
 * would double the entitlement fetch on every print sheet open.
 *
 * Every clock read and window resolution happens inside the effect — never during render.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  countPrintsSince,
  fetchAnnualPoolUnlocked,
  printCreditsLeft,
  unlockAnnualPool,
  type RecordedPrint,
} from '@/data/printRepo';
import {
  resolvePoolOffer,
  resolvePrintWindow,
  type BillingInterval,
  type PoolOffer,
  type PrintWindow,
} from '@/data/printWindow';
import { useAuth } from '@/store/auth';

export interface PrintAllowanceInput {
  /** Only subscribers have an allocation — false short-circuits every query. */
  enabled: boolean;
  /** TierLimits.includedPrintsPerMonth. Infinity while metering is off. */
  includedPerMonth: number;
  interval: BillingInterval | null;
  /** ISO, from the active tier entitlement row. */
  periodStart: string | null;
  /** entitlements.term_print_allocation — the term's pool total, prorated for mid-term upgrades. */
  termAllocation?: number | null;
}

export interface PrintAllowance {
  /** null until the first resolve lands (callers should show a spinner, never a wrong number). */
  window: PrintWindow | null;
  /** Prints recorded in the current window; null while loading. */
  used: number | null;
  /** Remaining in the current window. Infinity when unmetered. */
  left: number;
  /** There is a finite allocation to count against (metering on + a real allocation). */
  metered: boolean;
  offer: PoolOffer;
  unlocking: boolean;
  /** Message from a failed unlock — surfaced inline, never swallowed. */
  error: string | null;
  /** Release the full year. Resolves true on success. Irreversible. */
  unlock: () => Promise<boolean>;
  /**
   * Record a just-spent credit without refetching (the sheet spends then closes). Pass the RPC's
   * authoritative result to snap the meter to the server's truth; omit it to bump optimistically.
   */
  noteSpent: (recorded?: RecordedPrint | null) => void;
  reload: () => void;
}

export function usePrintAllowance(input: PrintAllowanceInput): PrintAllowance {
  const { enabled, includedPerMonth, interval, periodStart, termAllocation } = input;
  // Needed to read print_credits_left, which is parameterised by user id (security-definer, but
  // the signature takes p_user_id). A subscriber is always signed in, so this is present when the
  // effect below runs; if it isn't we simply fall back to the client-side count.
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [window, setWindow] = useState<PrintWindow | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [offer, setOffer] = useState<PoolOffer>({ state: 'none' });
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    // Nothing to resolve for non-subscribers. Stale state from a previous identity is masked at
    // the return below rather than reset here — clearing it synchronously in the effect would
    // just cascade an extra render.
    if (!enabled) return;
    let live = true;
    const periodStartMs = periodStart ? Date.parse(periodStart) : null;
    const hasTerm = periodStartMs != null && !Number.isNaN(periodStartMs);

    (async () => {
      // The pool unlock decides the WINDOW, so it has to resolve first. A failed read degrades
      // to "not unlocked" (the normal month-at-a-time release) rather than bricking the meter.
      let poolUnlocked = false;
      if (interval === 'year' && periodStart) {
        poolUnlocked = await fetchAnnualPoolUnlocked(periodStart).catch(() => false);
      }
      if (!live) return;

      const w = resolvePrintWindow({
        includedPerMonth,
        interval,
        periodStartMs: hasTerm ? periodStartMs : null,
        poolUnlocked,
        termAllocation,
        nowMs: Date.now(),
      });
      if (!live) return;
      setWindow(w);

      // Window usage drives the meter. Prefer the SERVER's own remaining count (print_credits_left)
      // over counting client-side: it resolves the window with server time and is the exact figure
      // record_print_event enforces, so the meter's gate can't drift from the ledger across a clock
      // skew at a window boundary. Fall back to a client-side count (over the shared window) when
      // the RPC read fails or is unavailable — a metering read must never brick a paid plan.
      //
      // TERM usage is a separate count — a yearly subscriber who printed in month 1 and is now in
      // month 3 has an empty slice but has proven the feature, which is what the pool's "spend one
      // first" rule asks about.
      let windowCount: number;
      const serverLeft = userId ? await printCreditsLeft(userId).catch(() => null) : null;
      if (!live) return;
      if (serverLeft != null && Number.isFinite(w.allocation)) {
        // Derive used from the server's remaining count. Clamp because a staff/uncapped account
        // reports a sentinel far above the allocation.
        windowCount = Math.min(w.allocation, Math.max(0, w.allocation - serverLeft));
      } else {
        windowCount = await countPrintsSince(new Date(w.startMs).toISOString()).catch(() => 0);
        if (!live) return;
      }
      setUsed(windowCount);

      if (interval !== 'year' || !hasTerm) {
        setOffer({ state: 'none' });
        return;
      }
      const termCount =
        w.kind === 'year'
          ? windowCount // the pool window IS the term — no second query needed
          : await countPrintsSince(new Date(periodStartMs!).toISOString()).catch(() => 0);
      if (!live) return;
      setOffer(
        resolvePoolOffer({
          includedPerMonth,
          interval,
          periodStartMs,
          poolUnlocked,
          printsThisTerm: termCount,
          termAllocation,
        }),
      );
    })();

    return () => {
      live = false;
    };
  }, [enabled, includedPerMonth, interval, periodStart, termAllocation, userId, generation]);

  const unlock = useCallback(async () => {
    if (!periodStart || unlocking) return false;
    setUnlocking(true);
    setError(null);
    try {
      await unlockAnnualPool(periodStart);
      reload(); // re-resolve: the window widens to the whole term
      return true;
    } catch {
      // Eligibility is enforced by RLS, so a rejection lands here as a policy error. Say
      // something a human can act on rather than leaking the Postgres message.
      setError(
        'We couldn’t unlock your yearly prints just now. Refresh and try again, or contact support if it keeps happening.',
      );
      return false;
    } finally {
      setUnlocking(false);
    }
  }, [periodStart, unlocking, reload]);

  // Prefer the RPC's AUTHORITATIVE post-spend count (record_print_event returns used/left/allocation)
  // so the meter snaps to the server's truth; fall back to an optimistic +1 when the caller has no
  // server figure (a soft-failed record we still let through).
  const noteSpent = useCallback(
    (recorded?: RecordedPrint | null) => setUsed((u) => (recorded ? recorded.used : (u ?? 0) + 1)),
    [],
  );

  // Mask any state left over from a previous identity / plan while disabled, so a signed-out or
  // free user can never briefly read a stale subscriber allowance.
  const liveWindow = enabled ? window : null;
  const liveUsed = enabled ? used : null;
  const liveOffer: PoolOffer = enabled ? offer : { state: 'none' };
  const allocation = liveWindow?.allocation ?? includedPerMonth;
  const metered = enabled && Number.isFinite(allocation);
  const left = metered ? Math.max(0, allocation - (liveUsed ?? 0)) : Infinity;

  return {
    window: liveWindow,
    used: liveUsed,
    left,
    metered,
    offer: liveOffer,
    unlocking,
    error,
    unlock,
    noteSpent,
    reload,
  };
}

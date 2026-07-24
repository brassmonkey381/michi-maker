/**
 * Fill-sheet print usage — the `print_events` ledger (one row per successful full-binder PDF
 * download, client-reported; see supabase/migrations/20260716220000_print_events.sql), plus the
 * `print_pool_unlocks` table behind the annual print pool (20260719120000).
 *
 * PRO/VIP plans INCLUDE a print allocation (tiers.ts `includedPrintsPerMonth`). WHICH window
 * that allocation covers is decided by src/data/printWindow.ts — the billing term's current
 * monthly slice normally, or the whole year for a yearly subscriber who unlocked their pool.
 * Callers resolve the window first, then count against it.
 *
 * AUTHORITATIVE as of 20260724040000_authoritative_metering.sql: recording a spend and reading
 * the remaining balance now go through server RPCs (`record_print_event` / `print_credits_left`)
 * that resolve the window and check the allowance ATOMICALLY, and the INSERT policy carries the
 * same allowance predicate. The client no longer inserts the ledger row directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { requireSupabase } from '@/lib/supabase';

// The metering RPCs added in 20260724040000 aren't in the generated database.ts yet (those types
// regenerate once the migration is pulled into the linked DB). Until then, reach them through the
// generic (schema-agnostic) client — the same escape hatch data/trial.ts uses for its RPCs.
const rpcClient = () => requireSupabase() as unknown as SupabaseClient;

/** The server's authoritative counts after a recorded spend (from `record_print_event`). */
export interface RecordedPrint {
  /** Prints used in the current window INCLUDING this one. */
  used: number;
  /** The window's included allocation. */
  allocation: number;
  /** Remaining in the window after this spend. */
  left: number;
  /** ISO start of the window the spend counted against. */
  windowStart: string;
}

/**
 * The server refused the spend because the current window is exhausted — a MEANINGFUL "you're out
 * of credits" answer, not a glitch. Thrown (never swallowed) so the caller can show the
 * out-of-credits UI instead of the download. Network / any other failure stays soft (null) below.
 */
export class PrintCapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrintCapExceededError';
  }
}

/**
 * Record a successful full-binder PDF download through the authoritative RPC. It resolves the
 * user's window, checks the allowance, and inserts the ledger row ATOMICALLY under a per-user
 * advisory lock, so two tabs can't both spend the last credit.
 *
 * Two failure modes, deliberately kept apart because one is a paywall answer and the other is a
 * transient blip:
 *   - Window exhausted → the RPC raises SQLSTATE P0001 `tier_cap_exceeded:…`. Re-thrown as
 *     PrintCapExceededError so the sheet drops to the out-of-credits UI rather than downloading.
 *   - Network / auth / anything else → returns null (soft). A metering blip must never block a
 *     paying customer who has credits; under-counting is the accepted soft-fail direction (see
 *     the migration header). The old bare insert swallowed everything — we keep that softness
 *     ONLY for the non-cap case.
 *
 * Pass the binder + sheet count so the purchase-history "Included print used" rows keep that
 * detail (the RPC stores them on print_events; both are optional).
 */
export async function recordPrintEvent(
  meta?: { binderId?: string | null; sheets?: number | null },
): Promise<RecordedPrint | null> {
  const { data, error } = await rpcClient().rpc('record_print_event', {
    p_binder_id: meta?.binderId ?? null,
    p_sheets: meta?.sheets ?? null,
  });
  if (error) {
    if (error.code === 'P0001' || error.message?.startsWith('tier_cap_exceeded:')) {
      throw new PrintCapExceededError(error.message);
    }
    return null; // soft: never block a paid print on a network/other error
  }
  const r = data as { used: number; allocation: number; left: number; window_start: string };
  return { used: r.used, allocation: r.allocation, left: r.left, windowStart: r.window_start };
}

/**
 * The server's own count of included prints remaining in the caller's CURRENT window
 * (`print_credits_left`). Preferred over counting client-side for the meter: it resolves the
 * window with SERVER time and is the exact figure `record_print_event` enforces, so the meter's
 * gate can't drift from the ledger across a clock skew at a window boundary. Returns null on
 * failure so callers fall back to a client-side count rather than brick a paid plan.
 */
export async function printCreditsLeft(userId: string): Promise<number | null> {
  const { data, error } = await rpcClient().rpc('print_credits_left', { p_user_id: userId });
  if (error) return null;
  return typeof data === 'number' ? data : null;
}

/** One recorded credit spend, for the purchase-history page. */
export interface PrintEventRow {
  binderId: string | null;
  sheets: number | null;
  /** ISO timestamp. */
  createdAt: string;
}

/** The user's recorded print-credit spends, newest first (RLS scopes to owner). */
export async function fetchPrintEvents(): Promise<PrintEventRow[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('print_events')
    .select('binder_id, sheets, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    binderId: r.binder_id,
    sheets: r.sheets,
    createdAt: r.created_at,
  }));
}

/**
 * How many full-binder PDFs this user downloaded since `sinceIso` (RLS scopes to owner).
 * The caller supplies the window — calendar month, billing-term slice, or the whole annual
 * term — from `resolvePrintWindow`.
 */
export async function countPrintsSince(sinceIso: string): Promise<number> {
  const supabase = requireSupabase();
  const { count, error } = await supabase
    .from('print_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Has this user released the full year of included prints for the term starting `periodStartIso`?
 * Unlocks are per-term, so a renewal (new period_start) simply finds no row and resets to the
 * normal month-at-a-time release.
 */
export async function fetchAnnualPoolUnlocked(periodStartIso: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { count, error } = await supabase
    .from('print_pool_unlocks')
    .select('period_start', { count: 'exact', head: true })
    .eq('period_start', periodStartIso);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Release the whole term's included prints at once. IRREVERSIBLE — there is no matching "lock"
 * call because the table has no update/delete policies (owner decision 2026-07-19).
 *
 * Eligibility (active YEARLY michi subscription for exactly this term + at least one print
 * already recorded in it) is enforced by the INSERT policy, so a rejected unlock surfaces as an
 * RLS error rather than being trusted from the client.
 */
export async function unlockAnnualPool(periodStartIso: string): Promise<void> {
  const supabase = requireSupabase();
  // user_id defaults to auth.uid() server-side.
  const { error } = await supabase
    .from('print_pool_unlocks')
    .insert({ period_start: periodStartIso });
  if (error) throw error;
}

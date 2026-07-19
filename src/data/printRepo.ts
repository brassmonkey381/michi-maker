/**
 * Fill-sheet print usage — the `print_events` ledger (one row per successful full-binder PDF
 * download, client-reported; see supabase/migrations/20260716220000_print_events.sql), plus the
 * `print_pool_unlocks` table behind the annual print pool (20260719120000).
 *
 * PRO/VIP plans INCLUDE a print allocation (tiers.ts `includedPrintsPerMonth`). WHICH window
 * that allocation covers is decided by src/data/printWindow.ts — the billing term's current
 * monthly slice normally, or the whole year for a yearly subscriber who unlocked their pool.
 * Callers resolve the window first, then count against it. Advisory today — nothing is blocked
 * when the count passes the allocation until metering enforcement ships.
 */

import { requireSupabase } from '@/lib/supabase';

/** Record a successful full-binder PDF download. Fire-and-forget from the print sheet. */
export async function recordPrintEvent(binderId: string, sheets: number): Promise<void> {
  const supabase = requireSupabase();
  // user_id defaults to auth.uid() server-side, same pattern as saved_slices inserts.
  const { error } = await supabase
    .from('print_events')
    .insert({ binder_id: binderId, sheets });
  if (error) throw error;
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

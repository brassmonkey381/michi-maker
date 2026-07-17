/**
 * Fill-sheet print usage — the `print_events` ledger (one row per successful full-binder PDF
 * download, client-reported; see supabase/migrations/20260716220000_print_events.sql).
 *
 * PRO/VIP plans INCLUDE a monthly print allocation (tiers.ts `includedPrintsPerMonth`); the
 * plan/usage UI counts this calendar month's events against it. Advisory today — nothing is
 * blocked when the count passes the allocation until metering enforcement ships.
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

/** How many full-binder PDFs this user downloaded this calendar month (RLS scopes to owner). */
export async function countPrintsThisMonth(): Promise<number> {
  const supabase = requireSupabase();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count, error } = await supabase
    .from('print_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart);
  if (error) throw error;
  return count ?? 0;
}

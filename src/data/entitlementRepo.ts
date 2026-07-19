/**
 * Full entitlement rows for the CURRENT user (RLS owner-scoped) — dates included. `useTier`
 * only needs product + expires_at to resolve access; the subscription-details UI (Your plan)
 * also wants granted_at ("PRO member since") and source ("granted manually" while checkout is
 * closed), so it fetches through here.
 *
 * Defensive `select('*')` + per-field coalesce, same reasoning as use-tier.ts: a column that
 * hasn't reached the live DB yet must not 400 the whole query.
 */

import { requireSupabase } from '@/lib/supabase';
import type { BillingInterval } from '@/data/printWindow';

export interface EntitlementDetail {
  product: string;
  /** ISO timestamp the grant was first written. */
  grantedAt: string | null;
  /** ISO term end; null = lifetime. */
  expiresAt: string | null;
  /** 'manual' today; the payment provider's name once checkout is wired. */
  source: string | null;
  /** How the granting subscription is billed; null for one-time / manual grants. */
  interval: BillingInterval | null;
  /** ISO start of the CURRENT billing term — the anchor the print meter counts from. */
  periodStart: string | null;
  /** Included prints for the whole term (prorated at upgrade); null = full year at current rate. */
  termAllocation: number | null;
}

/** 'month' / 'year' only — anything else the DB holds is not a shape we sell. */
function readInterval(raw: unknown): BillingInterval | null {
  return raw === 'month' || raw === 'year' ? raw : null;
}

export async function fetchEntitlementDetails(): Promise<EntitlementDetail[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from('entitlements').select('*');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    product: r.product,
    grantedAt: (r as { granted_at?: string | null }).granted_at ?? null,
    expiresAt: (r as { expires_at?: string | null }).expires_at ?? null,
    source: (r as { source?: string | null }).source ?? null,
    interval: readInterval((r as { interval?: unknown }).interval),
    periodStart: (r as { period_start?: string | null }).period_start ?? null,
    termAllocation:
      (r as { term_print_allocation?: number | null }).term_print_allocation ?? null,
  }));
}

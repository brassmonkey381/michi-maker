/**
 * Client side of the free PRO trial + over-cap reclaim (see docs/PRO-TRIALS.md).
 *
 * The trial is a 14-day `tier_pro` entitlement row granted by the `start_pro_trial()` RPC — the
 * only writer (entitlements has no client insert policy). Eligibility is enforced server-side; the
 * reads here are just for CTA display. Reclaim/restore are the security-definer RPCs that archive
 * over-cap binders after a downgrade grace, or bring them back on upgrade.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireSupabase } from '@/lib/supabase';

// The trial/reclaim RPCs + the pro_trials table aren't in the generated database.ts yet — those
// types are regenerated once the migration is applied to the linked DB. Until then, reach the new
// surfaces through the generic (schema-agnostic) client, which accepts any table/function name.
const db = () => requireSupabase() as unknown as SupabaseClient;

/** What the `pro_trials` ledger says about this account (the "has trialed?" source of truth). */
export interface TrialLedger {
  hasTrialed: boolean;
  /** Trial term end (fixed at grant), ISO; null when never trialed. */
  expiresAt: string | null;
}

/** Read the caller's trial ledger row (RLS owner-scoped). Never throws — a failure reads as
 *  "no trial known", which only ever shows an eligible CTA the RPC would re-check anyway. */
export async function fetchTrialLedger(): Promise<TrialLedger> {
  try {
    const { data } = await db().from('pro_trials').select('expires_at').maybeSingle();
    const row = data as { expires_at?: string } | null;
    return { hasTrialed: !!row, expiresAt: row?.expires_at ?? null };
  } catch {
    return { hasTrialed: false, expiresAt: null };
  }
}

/** Start the 14-day PRO trial. Resolves to the trial's end (ISO). Throws the RPC's message on
 *  refusal (already used / not eligible / guest) so the CTA can surface it honestly. */
export async function startProTrial(): Promise<{ expiresAt: string }> {
  const { data, error } = await db().rpc('start_pro_trial');
  if (error) throw new Error(error.message);
  return { expiresAt: data as string };
}

/** Archive the caller's over-cap excess, keeping `keepIds`. Server enforces downgrade + grace +
 *  cap. Returns how many were archived. */
export async function reclaimOverCap(keepIds: string[]): Promise<number> {
  const { data, error } = await db().rpc('reclaim_over_cap', { keep_ids: keepIds });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/** Un-archive binders newest-first up to the headroom under `cap` (Infinity → a large int for
 *  VIP). Called after an upgrade; returns how many were restored. */
export async function restoreArchivedBinders(cap: number): Promise<number> {
  const limit = Number.isFinite(cap) ? cap : 1_000_000;
  const { data, error } = await db().rpc('restore_archived_binders', { cap: limit });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

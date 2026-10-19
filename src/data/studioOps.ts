/**
 * The three operational reads added to `/studio` on 2026-10-18: the money ledger, where sessions
 * end, and the health row. Each wraps one admin RPC from
 * supabase/migrations/20261018160000_studio_money_dropoffs_health.sql.
 *
 * Errors THROW. A panel that swallows an RPC error renders as "nothing happened", and that is
 * exactly how the user list sat empty for two weeks (see 20261018150000). The panels print the
 * message instead.
 */
import { supabase } from '@/lib/supabase';

// --- money -------------------------------------------------------------------------------------

export type LedgerKind = 'entitlement' | 'free_trial';
export type StudioApp = 'michi' | 'tcgscan';

export interface LedgerRow {
  kind: LedgerKind;
  app: StudioApp;
  userId: string;
  username: string | null;
  product: string;
  source: string | null;
  grantedAt: string;
  expiresAt: string | null;
  interval: string | null;
  unitAmountMinor: number | null;
  currency: string | null;
  cancelledAt: string | null;
}

export async function fetchMoneyLedger(): Promise<LedgerRow[]> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('admin_money_ledger');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    kind: r.kind as LedgerKind,
    app: r.app as StudioApp,
    userId: r.user_id,
    username: r.username,
    product: r.product,
    source: r.source,
    grantedAt: r.granted_at,
    expiresAt: r.expires_at,
    interval: r.interval,
    unitAmountMinor: r.unit_amount_minor,
    currency: r.currency,
    cancelledAt: r.cancelled_at,
  }));
}

// --- where sessions end ------------------------------------------------------------------------

export interface DropoffRow {
  lastEvent: string;
  lastRoute: string | null;
  sessions: number;
  medianEvents: number;
  lastAt: string;
}

export async function fetchDropoffs(app: StudioApp, days: number): Promise<DropoffRow[]> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('admin_dropoffs', { p_app: app, p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    lastEvent: r.last_event,
    lastRoute: r.last_route,
    sessions: Number(r.sessions) || 0,
    medianEvents: Number(r.median_events) || 0,
    lastAt: r.last_at,
  }));
}

// --- health ------------------------------------------------------------------------------------

export interface HealthRow {
  signal: string;
  at: string | null;
  detail: string;
}

export async function fetchHealth(): Promise<HealthRow[]> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('admin_health');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ signal: r.signal, at: r.at, detail: r.detail }));
}

/**
 * MIC-069 REFER A FRIEND, client side (owner 2026-11-25).
 *
 * The program: share your invite link (/r/<code>). When a friend who came through it starts the
 * free trial, you get a free print code. When they pay, you each get one more. No caps; referral
 * codes last a year from grant. Each code is a one-use Stripe promotion code for the binder PDF, entered at
 * checkout, and anyone can use it. A refund of the friend's payment turns off the unused codes that
 * payment earned; cancelling the trial takes back nothing.
 *
 * Everything that grants is on the server (supabase/migrations/20261126120000_referrals_print_credits.sql,
 * stripe-checkout, payments-webhook). This file only:
 *   - remembers the invite code a browser arrived with, so checkout can carry it;
 *   - reads the caller's invite page data and code;
 *   - (finishing any codes still being made is checkout.ts's syncPrintCodes: it is an edge call).
 *
 * The code is kept in localStorage, not in the analytics session: it has to survive the sign-up,
 * the Google round trip and a later visit, and the trial may start days after the first click.
 * Web only, like every purchase (native apps sell nothing).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { appOrigin } from '@/lib/appUrl';
import { requireSupabase } from '@/lib/supabase';

import { normalizeReferralCode, parseReferralSummary, type ReferralSummary } from './referralCore';

export { normalizeReferralCode, parseReferralSummary, printCodeReasonText, printCodeStatusText, referralCounts } from './referralCore';
export type { PrintCode, ReferralStatus, ReferralSummary } from './referralCore';

const rpcClient = () => requireSupabase() as unknown as SupabaseClient;

const STORAGE_KEY = 'michi.referralCode';

/** Remember the invite this browser arrived with. The FIRST invite wins, like the server's rule. */
export function rememberReferralCode(raw: unknown): boolean {
  const code = normalizeReferralCode(raw);
  if (!code || Platform.OS !== 'web' || typeof localStorage === 'undefined') return false;
  try {
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, code);
    return true;
  } catch {
    return false;
  }
}

/** The invite code to send with a checkout, if this browser has one. */
export function storedReferralCode(): string | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    return normalizeReferralCode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** The shareable invite link for a code. */
export function inviteUrl(code: string): string {
  return `${appOrigin()}/r/${code}`;
}

export async function fetchReferralSummary(): Promise<ReferralSummary> {
  const { data, error } = await rpcClient().rpc('my_referrals');
  if (error) throw new Error(error.message);
  return parseReferralSummary(data);
}

/** The caller's invite code, made on first ask. Real accounts only. */
export async function ensureReferralCode(): Promise<string> {
  const { data, error } = await rpcClient().rpc('my_referral_code');
  if (error) throw new Error(error.message);
  const code = normalizeReferralCode(data);
  if (!code) throw new Error('Could not make your invite link. Try again.');
  return code;
}

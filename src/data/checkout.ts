/**
 * Client side of the Stripe integration — thin calls into the `stripe-checkout` edge function
 * (see supabase/functions/stripe-checkout/index.ts + docs/PAYMENTS.md). Both return a
 * Stripe-hosted URL; on web we navigate the current tab there (Checkout and the Customer
 * Portal both redirect back to `returnUrl` when done). Native apps point at the web app for
 * purchases for now — same policy as PDF download.
 *
 * Fulfillment is webhook-driven: after Checkout redirects back with ?checkout=success, the
 * entitlement row lands within seconds — callers poll `useTier().refresh()` (see /plans).
 */
import { Platform } from 'react-native';

import { requireSupabase } from '@/lib/supabase';

async function invokeStripe(body: Record<string, string | boolean>): Promise<unknown> {
  const supabase = requireSupabase();
  // Pass the session token EXPLICITLY. functions.invoke's ambient header injection silently
  // falls back to the publishable API key when getSession() comes up empty, which the server
  // can only report as "not signed in" — resolving it here instead gives the user the real
  // story (stale session vs guest) before any network call.
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    throw new Error('Your sign-in session has expired. Sign in again, then retry.');
  }
  if (session.user.is_anonymous) {
    throw new Error('Sign in with a real account to purchase (guest sessions cannot buy).');
  }
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    // The function returns JSON error bodies; surface the message when we can read it.
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) message = ((await ctx.json()) as { error?: string }).error ?? message;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  return data;
}

async function fetchStripeUrl(body: Record<string, string | boolean>): Promise<string> {
  const url = ((await invokeStripe(body)) as { url?: string })?.url;
  if (!url) throw new Error('No checkout URL returned');
  return url;
}

/** One Stripe payment as /purchases shows it — a subscription invoice or a one-time checkout. */
export interface PurchasePayment {
  id: string;
  kind: 'subscription' | 'one_time';
  /** Unix seconds. */
  createdAt: number;
  /** Smallest currency unit (cents). */
  amount: number;
  currency: string;
  description: string;
  status: string;
  /** Hosted Stripe receipt/invoice page, when there is one. */
  receiptUrl: string | null;
  /** For one-time binder-PDF unlocks: which binder. */
  binderId: string | null;
}

/** Everything the user has paid, newest first (server reads Stripe for the mapped customer). */
export async function fetchPurchaseHistory(): Promise<PurchasePayment[]> {
  const data = (await invokeStripe({ action: 'history' })) as { payments?: PurchasePayment[] };
  return data.payments ?? [];
}

/** Where Stripe should send the user back to — the current page on web. */
function currentReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const here = new URL(window.location.href);
    here.searchParams.delete('checkout'); // never carry a stale result flag back around
    return here.toString();
  }
  return 'https://www.michi-maker.com/plans';
}

/** Launch Stripe Checkout for a catalog lookup_key (subscriptions or the one-time binder PDF).
 *  `bundle: true` asks for the cross-app bundle discount — the server verifies the caller
 *  actually owns the sibling Pro before applying the coupon (see docs/SYNERGY.md). */
export async function startCheckout(
  lookupKey: string,
  opts?: { binderId?: string; bundle?: boolean },
): Promise<void> {
  const url = await fetchStripeUrl({
    action: 'checkout',
    lookupKey,
    returnUrl: currentReturnUrl(),
    ...(opts?.binderId ? { binderId: opts.binderId } : {}),
    ...(opts?.bundle ? { bundle: true } : {}),
  });
  if (Platform.OS === 'web') window.location.assign(url);
}

/** What moving an existing subscription onto another plan costs, after proration. */
export interface PlanChangePreview {
  /**
   * The upgrade price in minor units, prorated by WHOLE MONTHS: (new per-month − old per-month)
   * × months left in the term. A full year left of PRO → VIP is $99.99 − $39.99 = $60.00; three
   * months left is a quarter of each, $15.00.
   *
   * Deliberately not Stripe's own figure, which prorates to the second and so returns $59.55 two
   * days into a year. Whole months match how included prints are prorated on an upgrade.
   */
  amountDue: number;
  currency: string;
  /**
   * Included prints across the WHOLE term after the change, prorated the same way as the price
   * (old rate for months served, new rate for months remaining). null when unknown — show no
   * print promise rather than a fresh-year number the ledger won't honour.
   */
  termPrints?: number | null;
  /** 'whole-months' normally; 'stripe-seconds' for cross-interval changes. Debug only. */
  basis: 'whole-months' | 'stripe-seconds';
  /** Stripe's second-accurate proration, for comparison. Never render this. */
  stripeProration: number;
  /** 0 means we failed to identify Stripe's proration lines — see the API-shape note server-side. */
  prorationLineCount: number;
  /** Whole previewed invoice, for debugging only — never render this. */
  nextInvoiceTotal: number;
  fromLookupKey: string | null;
  toLookupKey: string;
}

/**
 * Preview an upgrade's prorated cost. READ-ONLY — Stripe builds a throwaway invoice and stores
 * nothing, so this is safe to call just to render a price.
 *
 * Resolves to null whenever there is nothing to quote (no subscription yet, price missing from
 * this Stripe mode, preview call failed). Callers show the CTA without a price rather than an
 * error: a missing number is a smaller problem than a wrong one.
 */
export async function previewPlanChange(lookupKey: string): Promise<PlanChangePreview | null> {
  try {
    const data = (await invokeStripe({ action: 'preview_change', lookupKey })) as {
      preview?: PlanChangePreview | null;
    };
    return data?.preview ?? null;
  } catch {
    return null;
  }
}

/** Money for display: 5842 + 'usd' → "$58.42". Falls back to the raw code for odd currencies. */
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export interface PlanChangeResult {
  ok: true;
  /** Minor units actually charged. 0 when there was nothing to pay. */
  charged?: number;
  currency?: string;
  invoiceUrl?: string | null;
  alreadyOnPlan?: boolean;
}

/**
 * Move the user's existing subscription onto `lookupKey`, charging exactly the figure
 * `previewPlanChange` quoted. The server charges BEFORE switching, so a rejected payment leaves
 * the plan untouched and throws here with a message worth showing.
 *
 * Upgrades only — a downgrade nets a credit and is deliberately left to the billing portal.
 */
export async function changePlan(lookupKey: string): Promise<PlanChangeResult> {
  return (await invokeStripe({ action: 'change_plan', lookupKey })) as PlanChangeResult;
}

/** Open the Stripe Customer Portal (manage plan / cancel / payment method). */
export async function openBillingPortal(): Promise<void> {
  const url = await fetchStripeUrl({ action: 'portal', returnUrl: currentReturnUrl() });
  if (Platform.OS === 'web') window.location.assign(url);
}

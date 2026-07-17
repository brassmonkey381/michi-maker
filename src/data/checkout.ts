/**
 * Client side of the Stripe integration — thin calls into the `stripe-checkout` edge function
 * (see supabase/functions/stripe-checkout/index.ts + docs/PAYMENTS.md). Both return a
 * Stripe-hosted URL; on web we navigate the current tab there (Checkout and the Customer
 * Portal both redirect back to `returnUrl` when done). Native apps point at the web app for
 * purchases for now — same policy as PDF download.
 *
 * Fulfillment is webhook-driven: after Checkout redirects back with ?checkout=success, the
 * entitlement row lands within seconds — callers poll `useTier().refresh()` (see /subscriptions).
 */
import { Platform } from 'react-native';

import { requireSupabase } from '@/lib/supabase';

async function fetchStripeUrl(body: Record<string, string>): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke('stripe-checkout', { body });
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
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error('No checkout URL returned');
  return url;
}

/** Where Stripe should send the user back to — the current page on web. */
function currentReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const here = new URL(window.location.href);
    here.searchParams.delete('checkout'); // never carry a stale result flag back around
    return here.toString();
  }
  return 'https://www.michi-maker.com/subscriptions';
}

/** Launch Stripe Checkout for a catalog lookup_key (subscriptions or the one-time binder PDF). */
export async function startCheckout(lookupKey: string, opts?: { binderId?: string }): Promise<void> {
  const url = await fetchStripeUrl({
    action: 'checkout',
    lookupKey,
    returnUrl: currentReturnUrl(),
    ...(opts?.binderId ? { binderId: opts.binderId } : {}),
  });
  if (Platform.OS === 'web') window.location.assign(url);
}

/** Open the Stripe Customer Portal (manage plan / cancel / payment method). */
export async function openBillingPortal(): Promise<void> {
  const url = await fetchStripeUrl({ action: 'portal', returnUrl: currentReturnUrl() });
  if (Platform.OS === 'web') window.location.assign(url);
}

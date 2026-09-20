/**
 * revenuecat-webhook — Apple in-app purchases (via RevenueCat) → entitlements.
 *
 * The App Store twin of payments-webhook. TCGScan's iOS build sells the SAME two subscriptions
 * Stripe sells on the web (App Review 3.1.1 / 3.1.3(b): a tier bought elsewhere may only unlock in
 * the iOS app if it can also be bought there with In-App Purchase). RevenueCat validates the
 * receipt with Apple and posts an event here; this function writes the same row shape the Stripe
 * webhook writes, with `source: 'apple'`, so every reader is unchanged: the app's tcgscanLevel, the
 * server's tcgscan_tier(uid) and the trial win-back block all key on product + expires_at and on
 * `source <> 'trial'`, never on Stripe.
 *
 * AUTH. RevenueCat cannot send a Supabase JWT, so this deploys with verify_jwt OFF and the
 * Authorization header IS the auth: RevenueCat sends the exact value configured in its dashboard,
 * compared here in constant time against REVENUECAT_WEBHOOK_AUTH. A wrong or missing header is a
 * 401 and nothing is read.
 *
 * WHO. The app configures RevenueCat with the Supabase auth user id as the App User ID (and never
 * lets an anonymous user buy), so `app_user_id` IS `entitlements.user_id`. An event whose ids
 * include no uuid (a `$RCAnonymousID:`) is acknowledged and skipped: there is no account to grant.
 *
 * EXPIRY, mirroring payments-webhook:
 *   purchase / renewal / uncancel / product change → expiration + 3 days' grace (a late webhook
 *                                                    must not flap a paying subscriber to Free)
 *   cancellation (auto-renew off)                  → exactly the paid-through expiration
 *   cancellation by refund (CUSTOMER_SUPPORT)      → now
 *   billing issue                                  → Apple's own grace end when it gives one,
 *                                                    else the paid-through expiration
 *   expiration                                     → the expiration (already past)
 *   Lifetime purchase (`*_lifetime`)               → no expiry at all; only its own refund ends it
 *
 * SANDBOX EVENTS GRANT TOO, on purpose: App Review buys in the sandbox, and a reviewer who pays
 * and sees nothing unlock is a rejection. The cost is that a TestFlight tester can hold a tier.
 *
 * NEVER CLOBBER A LIVE STRIPE ROW. The ledger is keyed (user_id, product), so an Apple purchase of
 * a product the user already holds through Stripe would overwrite `source` and orphan the Stripe
 * subscription's bookkeeping. The app blocks that purchase up front ("managed on the web"); if
 * one arrives anyway it is logged and skipped, and the person keeps the access they already had.
 *
 * Idempotent: every write is an upsert on (user_id, product); RevenueCat's retries are harmless.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { secretKey } from '../_shared/keys.ts';

const service = () => createClient(Deno.env.get('SUPABASE_URL')!, secretKey());

const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** App Store product ids are the Stripe lookup_keys, so one naming scheme covers both stores. */
function tierProduct(productId: string | null | undefined): 'tcgscan_pro' | 'tcgscan_vip' | null {
  if (!productId) return null;
  if (productId.startsWith('tcgscan_vip')) return 'tcgscan_vip';
  if (productId.startsWith('tcgscan_pro')) return 'tcgscan_pro';
  return null;
}

/** `tcgscan_pro_lifetime`: a one-time purchase. Its ledger row has NO expiry, like any lifetime grant. */
const isLifetime = (productId: string | null | undefined) => !!productId && productId.endsWith('_lifetime');

function billingInterval(productId: string): 'month' | 'year' | null {
  if (productId.endsWith('_yearly')) return 'year';
  if (productId.endsWith('_monthly')) return 'month';
  return null;
}

const SIBLING: Record<string, string> = { tcgscan_pro: 'tcgscan_vip', tcgscan_vip: 'tcgscan_pro' };

interface RcEvent {
  type: string;
  id?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  new_product_id?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  cancel_reason?: string;
  environment?: string;
  store?: string;
}

/** Constant-time string compare, so the header check leaks nothing about the secret's prefix. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function userIdOf(ev: RcEvent): string | null {
  const ids = [ev.app_user_id, ev.original_app_user_id, ...(ev.aliases ?? [])];
  return ids.find((x): x is string => !!x && UUID.test(x)) ?? null;
}

/**
 * When access ends for this event: a time, 'never' for a Lifetime purchase, or null when the event
 * changes nothing in the ledger.
 */
function expiryFor(ev: RcEvent, now: number): number | 'never' | null {
  const paidThrough = ev.expiration_at_ms ?? null;
  if (isLifetime(ev.product_id)) {
    // Bought once, held for good; the only thing that ends it is a refund.
    if (ev.type === 'NON_RENEWING_PURCHASE' || ev.type === 'INITIAL_PURCHASE') return 'never';
    if (ev.type === 'CANCELLATION' && ev.cancel_reason === 'CUSTOMER_SUPPORT') return now;
    return null;
  }
  switch (ev.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'NON_RENEWING_PURCHASE':
    case 'SUBSCRIPTION_EXTENDED':
      return paidThrough ? paidThrough + GRACE_MS : null;
    case 'CANCELLATION':
      // A refund ends access now; turning auto-renew off keeps the term that was paid for.
      if (ev.cancel_reason === 'CUSTOMER_SUPPORT') return now;
      return paidThrough ?? now;
    case 'BILLING_ISSUE':
      return ev.grace_period_expiration_at_ms ?? paidThrough ?? now;
    case 'EXPIRATION':
      return Math.min(paidThrough ?? now, now);
    default:
      return null; // TEST, TRANSFER, SUBSCRIPTION_PAUSED, INVOICE_ISSUANCE, ...
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
  const got = req.headers.get('authorization') ?? '';
  if (!expected || !same(got, expected)) return new Response('unauthorized', { status: 401 });

  let ev: RcEvent;
  try {
    ev = ((await req.json()) as { event?: RcEvent }).event ?? ({} as RcEvent);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  if (!ev.type) return new Response('no event', { status: 400 });

  const now = Date.now();
  const expiresAtMs = expiryFor(ev, now);
  if (expiresAtMs === null) {
    // TRANSFER is the one to watch: the RevenueCat project is set to keep purchases with their
    // original App User ID, so it should never fire. If it does, a person restored on a second
    // account and the ledger has not followed; the log is how support finds out.
    console.log('revenuecat: no ledger change for', ev.type, ev.id ?? '');
    return new Response('ok', { status: 200 });
  }

  // A product change names the plan being LEFT in product_id and the one being taken in
  // new_product_id; every other event names its own product.
  const productId = ev.type === 'PRODUCT_CHANGE' ? (ev.new_product_id ?? ev.product_id) : ev.product_id;
  const product = tierProduct(productId);
  const userId = userIdOf(ev);
  if (!product || !productId || !userId) {
    console.log('revenuecat: skipping, unresolved user or product', ev.type, ev.id ?? '', productId ?? '');
    return new Response('ok', { status: 200 });
  }

  const db = service();
  const { data: existing } = await db
    .from('entitlements')
    .select('source, expires_at')
    .eq('user_id', userId)
    .eq('product', product)
    .maybeSingle();
  const stripeLive =
    existing?.source === 'stripe' && (!existing.expires_at || Date.parse(existing.expires_at) > now);
  if (stripeLive) {
    console.log('revenuecat: live stripe row kept, apple event not written', ev.type, ev.id ?? '', product);
    return new Response('ok', { status: 200 });
  }
  // A LIFETIME ROW IS NOT A SUBSCRIPTION'S TO END. Someone who subscribed and later bought Lifetime
  // still has the old subscription's cancellation and expiration events on the way; written, they
  // would put an end date on a purchase that has none. Only the Lifetime product's own refund may.
  if (existing?.source === 'apple' && existing.expires_at === null && !isLifetime(productId)) {
    console.log('revenuecat: lifetime row kept, subscription event not written', ev.type, ev.id ?? '', product);
    return new Response('ok', { status: 200 });
  }

  const { error } = await db.from('entitlements').upsert(
    {
      user_id: userId,
      product,
      source: 'apple',
      expires_at: expiresAtMs === 'never' ? null : new Date(expiresAtMs).toISOString(),
      interval: billingInterval(productId),
      period_start: ev.purchased_at_ms ? new Date(ev.purchased_at_ms).toISOString() : null,
      // The included-print pool is a michi-maker tier benefit; tcgscan tiers carry none.
      term_print_allocation: null,
    },
    { onConflict: 'user_id,product' },
  );
  if (error) {
    console.error('revenuecat: upsert failed', error.message);
    return new Response('write failed', { status: 500 }); // RevenueCat retries
  }

  // Plan switch hygiene, Apple rows only: PRO→VIP inside the subscription group must not leave
  // the other tier's Apple row alive. A Stripe row is Stripe's to end (its own webhook does).
  if (expiresAtMs === 'never' || expiresAtMs > now) {
    await db
      .from('entitlements')
      .update({ expires_at: new Date(now).toISOString() })
      .eq('user_id', userId)
      .eq('product', SIBLING[product])
      .eq('source', 'apple')
      .gt('expires_at', new Date(now).toISOString());
  }

  return new Response('ok', { status: 200 });
});

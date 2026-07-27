/**
 * delete-account — irreversibly deletes the CALLER's own account and data.
 *
 *  POST {} → { ok: true, cancelledSubscriptions: n }
 *
 * Exists because App Store Review Guideline 5.1.1(v) requires any app offering account creation
 * to let the user START deletion from inside the app. "Email support to delete" (what the privacy
 * page said) is acceptable on the web and is an automatic rejection on iOS. Serves BOTH apps: one
 * account and one entitlements ledger are shared, so there is one deletion path.
 *
 * ── Order matters, and the reason is money ────────────────────────────────────────────────────
 * Every user-scoped table in this project is ON DELETE CASCADE from auth.users (verified
 * 2026-07-27), so removing the auth user removes collections, binders, portfolio entries,
 * entitlements, trials, likes, and the billing_customers mapping. That last one is the trap:
 * payments-webhook resolves "which user is this subscription for" THROUGH billing_customers, so
 * deleting the user first would leave an ACTIVE Stripe subscription still charging a real card
 * with nothing left to resolve it to, and no way to reconcile it later.
 *
 * So Stripe is cancelled FIRST, and the account is only deleted once no active subscription
 * remains. If cancellation fails we abort and delete nothing: an account that still exists is
 * recoverable, a silently-billing orphan is not.
 *
 * Cancellation is IMMEDIATE (not at period end): the user is asking us to stop existing, so they
 * should not be charged again. No proration refund is issued — that stays a manual support
 * decision, and the app says so before the user confirms.
 *
 * `scan_feedback.owner_id` is ON DELETE SET NULL by design: the feedback survives, anonymised.
 * That is deliberate (it trains the scanner and is no longer personal data), not an oversight.
 *
 * Auth: JWT verification is ON. The user is resolved from the caller's own token and can only
 * ever delete THEMSELVES; no id is accepted from the request body. Anonymous (guest) sessions are
 * rejected: they own nothing server-side and have nothing to delete.
 *
 * Secrets: STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY (supabase secrets).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!serviceKey || !url) return json({ error: 'server_misconfigured' }, 500);

  // 1. Who is calling? Resolved from THEIR token — never from the body.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: 'unauthorized' }, 401);
  if (user.is_anonymous) return json({ error: 'guest_account' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 2. Cancel any live Stripe subscription BEFORE the cascade removes the mapping.
  let cancelled = 0;
  const { data: billing } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (billing?.stripe_customer_id) {
    if (!stripeKey) {
      // A mapped customer with no Stripe key configured means we cannot prove billing stopped.
      // Refuse rather than orphan a paying subscription.
      return json({ error: 'billing_unavailable' }, 503);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });
    try {
      // 'all' then filter: cancelled/incomplete_expired subscriptions need no action, but we must
      // not miss `past_due`/`unpaid`/`trialing`, which still bill or still hold a card.
      const subs = await stripe.subscriptions.list({
        customer: billing.stripe_customer_id,
        status: 'all',
        limit: 100,
      });
      const live = subs.data.filter((s) =>
        ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(s.status),
      );
      for (const sub of live) {
        await stripe.subscriptions.cancel(sub.id);
        cancelled += 1;
      }
    } catch (e) {
      console.error('[delete-account] stripe cancel failed', user.id, e);
      return json({ error: 'subscription_cancel_failed' }, 502);
    }
  }

  // 3. Delete the auth user. Every user-scoped table cascades from here.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    // Subscriptions are already cancelled, so the worst case here is an account that still exists
    // but no longer bills — safe, and retryable. Say so rather than reporting success.
    console.error('[delete-account] user delete failed', user.id, delErr);
    return json({ error: 'delete_failed', cancelledSubscriptions: cancelled }, 500);
  }

  console.log(`[delete-account] deleted ${user.id} (cancelled ${cancelled} subscription(s))`);
  return json({ ok: true, cancelledSubscriptions: cancelled });
});

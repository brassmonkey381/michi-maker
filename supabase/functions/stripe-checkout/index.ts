/**
 * stripe-checkout — creates Stripe-hosted surfaces for the signed-in user:
 *
 *  POST { action: 'checkout', lookupKey, returnUrl, binderId? } → { url }
 *    A Checkout Session for one of our catalog lookup_keys (michi_pro_monthly, michi_pro_yearly,
 *    michi_vip_monthly, michi_vip_yearly, michi_binder_pdf). Subscription vs one-time mode is
 *    derived from the price. Carries client_reference_id = the Supabase user id; subscriptions
 *    also get metadata so renewal webhooks can resolve the user without a DB lookup.
 *
 *  POST { action: 'portal', returnUrl } → { url }
 *    A Customer Portal session (manage / cancel / payment method) for the user's mapped Stripe
 *    customer (billing_customers, written by the payments-webhook on first checkout).
 *
 * Auth: default JWT verification is ON for this function; we additionally resolve the user via
 * the Supabase client and reject ANONYMOUS (guest) sessions — only real accounts can buy.
 * Secrets: STRIPE_SECRET_KEY (supabase secrets). Deployed per docs/PAYMENTS.md.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Catalog lookup keys this function will sell — anything else is rejected. */
const SELLABLE = new Set([
  'michi_pro_monthly',
  'michi_pro_yearly',
  'michi_vip_monthly',
  'michi_vip_yearly',
  'michi_binder_pdf',
]);

/** Origins checkout may return to (success/cancel URLs are validated against these). */
const ALLOWED_RETURN_ORIGINS = new Set([
  'https://www.michi-maker.com',
  'https://michi-maker.com',
  'http://localhost:8081',
]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/** Clamp a client-supplied return URL to an allowlisted origin (fall back to the site root). */
function safeReturnUrl(raw: unknown): string {
  try {
    const u = new URL(String(raw));
    if (ALLOWED_RETURN_ORIGINS.has(u.origin)) return u.toString();
  } catch {
    // fall through
  }
  return 'https://www.michi-maker.com/subscriptions';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) return json(500, { error: 'STRIPE_SECRET_KEY not configured' });
  const stripe = new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() });

  // Resolve the caller from their JWT. Anonymous (guest) sessions can't buy.
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return json(401, { error: 'not signed in' });
  if ((user as { is_anonymous?: boolean }).is_anonymous) {
    return json(403, { error: 'sign in with a real account to purchase' });
  }

  // Service client for the billing_customers mapping (no client write policies exist).
  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { action?: string; lookupKey?: string; returnUrl?: string; binderId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad json' });
  }
  const returnUrl = safeReturnUrl(body.returnUrl);

  // ── Customer Portal ─────────────────────────────────────────────────────
  if (body.action === 'portal') {
    const { data: mapping } = await service
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mapping) return json(404, { error: 'no billing history yet' });
    const session = await stripe.billingPortal.sessions.create({
      customer: mapping.stripe_customer_id,
      return_url: returnUrl,
    });
    return json(200, { url: session.url });
  }

  // ── Checkout ────────────────────────────────────────────────────────────
  if (body.action !== 'checkout') return json(400, { error: 'unknown action' });
  const lookupKey = String(body.lookupKey ?? '');
  if (!SELLABLE.has(lookupKey)) return json(400, { error: 'unknown product' });

  const prices = await stripe.prices.list({
    lookup_keys: [lookupKey],
    expand: ['data.product'],
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) return json(500, { error: 'price not found in this Stripe mode' });
  const product = price.product as Stripe.Product;
  const michiProduct = product.metadata?.michi_product ?? '';
  const mode: 'subscription' | 'payment' = price.recurring ? 'subscription' : 'payment';

  // One-time binder PDF needs the binder id — the webhook grants `pdf_binder:<id>`.
  const binderId = String(body.binderId ?? '');
  if (michiProduct === 'pdf_binder' && !binderId) return json(400, { error: 'binderId required' });

  // Reuse the mapped Stripe customer when one exists so purchases stack on one customer.
  const { data: mapping } = await service
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const success = new URL(returnUrl);
  success.searchParams.set('checkout', 'success');
  const cancel = new URL(returnUrl);
  cancel.searchParams.set('checkout', 'cancelled');

  const session = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.id,
    ...(mapping
      ? { customer: mapping.stripe_customer_id }
      : { customer_email: user.email ?? undefined }),
    ...(mode === 'subscription'
      ? {
          subscription_data: {
            metadata: { supabase_user_id: user.id, michi_product: michiProduct },
          },
        }
      : {}),
    metadata: {
      supabase_user_id: user.id,
      michi_product: michiProduct,
      ...(binderId ? { binder_id: binderId } : {}),
    },
    success_url: success.toString(),
    cancel_url: cancel.toString(),
    allow_promotion_codes: true,
  });

  return json(200, { url: session.url });
});

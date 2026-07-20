/**
 * stripe-checkout — creates Stripe-hosted surfaces for the signed-in user:
 *
 *  POST { action: 'checkout', lookupKey, returnUrl, binderId? } → { url }
 *    A Checkout Session for one of our catalog lookup_keys (michi_pro_monthly, michi_pro_yearly,
 *    michi_vip_monthly, michi_vip_yearly, michi_binder_pdf). Subscription vs one-time mode is
 *    derived from the price. Carries client_reference_id = the Supabase user id; subscriptions
 *    also get metadata so renewal webhooks can resolve the user without a DB lookup.
 *
 *  POST { action: 'preview_change', lookupKey } → { preview }
 *    READ-ONLY: what moving the user's existing subscription onto that price costs today, after
 *    proration. `preview: null` whenever there's nothing to quote. Persists nothing.
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

/** Catalog lookup keys this function will sell — anything else is rejected. Spans BOTH apps
 *  (they share this project + the entitlements ledger): michi sells the tcgscan keys in its
 *  bundle cross-sell and vice-versa. See docs/SYNERGY.md. */
const SELLABLE = new Set([
  'michi_pro_monthly',
  'michi_pro_yearly',
  'michi_vip_monthly',
  'michi_vip_yearly',
  'michi_binder_pdf',
  'tcgscan_pro_monthly',
  'tcgscan_pro_yearly',
]);

/** Origins checkout may return to (success/cancel URLs are validated against these).
 *  Includes the sibling app — tcgscan launches checkouts against this same function. */
const ALLOWED_RETURN_ORIGINS = new Set([
  'https://www.michi-maker.com',
  'https://michi-maker.com',
  'https://www.tcgscan.ai',
  'https://tcgscan.ai',
  // legacy tcgscan domain — kept while it still serves/redirects
  'https://www.idontgitit.com',
  'https://idontgitit.com',
  'http://localhost:8081',
]);

/** The sibling products whose ACTIVE ownership qualifies a lookup key for the bundle discount:
 *  own a michi tier → discounted TCGScan Pro; own TCGScan Pro → discounted michi tier. */
function bundleSiblingsFor(lookupKey: string): string[] | null {
  if (lookupKey.startsWith('tcgscan_pro')) return ['tier_pro', 'tier_vip'];
  if (lookupKey.startsWith('michi_pro') || lookupKey.startsWith('michi_vip')) return ['tcgscan_pro'];
  return null; // one-time products have no bundle
}

/** Whole months elapsed, clamped to a year. Mirrors payments-webhook + src/data/printWindow.ts. */
function monthsElapsed(startMs: number, nowMs: number): number {
  const s = new Date(startMs);
  const n = new Date(nowMs);
  let m = (n.getUTCFullYear() - s.getUTCFullYear()) * 12 + (n.getUTCMonth() - s.getUTCMonth());
  if (n.getUTCDate() < s.getUTCDate()) m -= 1;
  return Math.max(0, Math.min(12, m));
}

/** A price's cost per month in minor units. Yearly prices divide by 12. */
function perMonthMinor(price: Stripe.Price | null | undefined): number | null {
  const amount = price?.unit_amount;
  const interval = price?.recurring?.interval;
  if (typeof amount !== 'number' || !interval) return null;
  if (interval === 'year') return amount / 12;
  if (interval === 'month') return amount;
  return null;
}

/** current_period_start lives on the subscription in older API versions, on the item in newer. */
function periodStartSecondsOf(sub: Stripe.Subscription): number | null {
  const onSub = (sub as unknown as { current_period_start?: number }).current_period_start;
  if (typeof onSub === 'number') return onSub;
  const onItem = (sub.items?.data?.[0] as unknown as { current_period_start?: number })
    ?.current_period_start;
  if (typeof onItem === 'number') return onItem;
  return typeof sub.start_date === 'number' ? sub.start_date : null;
}

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
  // getUser needs the token PASSED EXPLICITLY — with no argument it looks for a client-side
  // session, which never exists in an edge function, and errors "Auth session missing".
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const {
    data: { user },
  } = await authClient.auth.getUser(token);
  if (!user) return json(401, { error: 'not signed in' });
  if ((user as { is_anonymous?: boolean }).is_anonymous) {
    return json(403, { error: 'sign in with a real account to purchase' });
  }

  // Service client for the billing_customers mapping (no client write policies exist).
  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: {
    action?: string;
    lookupKey?: string;
    returnUrl?: string;
    binderId?: string;
    bundle?: boolean;
  };
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
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: mapping.stripe_customer_id,
        return_url: returnUrl,
      });
      return json(200, { url: session.url });
    } catch (e) {
      // The overwhelmingly common cause is no portal CONFIGURATION in this Stripe mode — the
      // portal is dashboard-configured per mode, and without one every session create throws.
      // Say so explicitly; a bare 500 here sends people hunting through app code for a Stripe
      // dashboard setting. Plan changes need `subscription_update` enabled on that config.
      const message = (e as Error).message ?? 'portal session failed';
      console.error('portal session failed', message);
      return json(502, {
        error: `Stripe could not open the billing portal. If this Stripe mode has no Customer Portal configuration yet, create one (with subscription_update enabled for the PRO and VIP products) at Settings → Billing → Customer portal. Stripe said: ${message}`,
      });
    }
  }

  // ── Preview a plan change ───────────────────────────────────────────────
  // READ-ONLY. Returns what moving the user's existing subscription onto `lookupKey` would cost
  // them TODAY, so the upgrade CTA can quote a real prorated number instead of the vague promise
  // that they'll "only pay the difference". Stripe's create_preview builds a throwaway invoice
  // (its id is prefixed `upcoming_in`) and persists nothing.
  //
  // `preview: null` is a normal answer, not an error — no billing history, no michi subscription
  // to move, or the price is missing from this Stripe mode. Callers just omit the price line.
  if (body.action === 'preview_change') {
    const lookupKey = String(body.lookupKey ?? '');
    if (!SELLABLE.has(lookupKey)) return json(400, { error: 'unknown product' });

    const { data: mapping } = await service
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mapping) return json(200, { preview: null });

    const subs = await stripe.subscriptions.list({
      customer: mapping.stripe_customer_id,
      status: 'active',
      limit: 10,
    });
    const current = subs.data.find((s) => {
      const k = s.items?.data?.[0]?.price?.lookup_key ?? '';
      return k.startsWith('michi_pro') || k.startsWith('michi_vip');
    });
    const item = current?.items?.data?.[0];
    if (!current || !item) return json(200, { preview: null });

    const targets = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    const target = targets.data[0];
    if (!target) return json(200, { preview: null });
    // Already on it — nothing to preview.
    if (item.price?.id === target.id) return json(200, { preview: null });

    try {
      // createPreview replaced the older retrieveUpcoming; cast because the typing varies across
      // SDK minors and a preview that fails must degrade to "no price shown", never a 500.
      const preview = await (
        stripe.invoices as unknown as {
          createPreview: (args: unknown) => Promise<Stripe.Invoice>;
        }
      ).createPreview({
        customer: mapping.stripe_customer_id,
        subscription: current.id,
        subscription_details: {
          items: [{ id: item.id, price: target.id }],
          proration_behavior: 'create_prorations',
        },
      });
      // Stripe's own proration, summed from the lines flagged `proration` — a credit for unused
      // time on the old plan plus a charge for the new one. NOT `amount_due`: create_preview
      // returns the whole next UPCOMING invoice, so amount_due was the renewal ($99.99) plus the
      // proration ($59.55) = $159.54, which read as the upgrade price and was wildly wrong.
      //
      // The proration flag MOVED between API versions, exactly like invoice.subscription did:
      // it used to sit on the line and now hangs off parent.subscription_item_details. Checking
      // only the legacy shape matched nothing, summed to 0, and the CTA cheerfully announced
      // "nothing to pay" for a $60 upgrade. Check both.
      type PreviewLine = {
        proration?: boolean;
        amount?: number;
        parent?: { subscription_item_details?: { proration?: boolean } };
      };
      const lines =
        (preview as unknown as { lines?: { data?: PreviewLine[] } }).lines?.data ?? [];
      const isProration = (l: PreviewLine) =>
        l.proration === true || l.parent?.subscription_item_details?.proration === true;
      const prorationLines = lines.filter(isProration);
      const stripeProration = prorationLines.reduce((sum, l) => sum + (l.amount ?? 0), 0);

      // WE QUOTE BY WHOLE MONTHS, NOT BY SECOND (owner call). Stripe prorates down to the second,
      // so two days into a year it returns $59.55 where the plan is plainly "$60 — a year of VIP
      // minus a year of PRO". Whole months also match how the included-print allocation is
      // prorated (see payments-webhook termAllocationFor), so the money and the prints tell the
      // same story instead of disagreeing by a couple of days.
      //
      //   upgrade = (newPerMonth − oldPerMonth) × whole months left in the term
      //     12 months left: (999.9 − 333.25) × 12 = $60.00
      //      3 months left: (999.9 − 333.25) ×  3 = $15.00
      //
      // Only for a SAME-interval change, which is the real upgrade path (yearly → yearly). Across
      // intervals "months remaining" doesn't map — a monthly plan has at most one — so those fall
      // back to Stripe's figure rather than quoting something indefensible.
      const fromPerMonth = perMonthMinor(item.price);
      const toPerMonth = perMonthMinor(target);
      const sameInterval = item.price?.recurring?.interval === target.recurring?.interval;
      const periodStart = periodStartSecondsOf(current);
      let monthly: number | null = null;
      if (sameInterval && fromPerMonth != null && toPerMonth != null && periodStart) {
        const termMonths = target.recurring?.interval === 'year' ? 12 : 1;
        const left = termMonths - monthsElapsed(periodStart * 1000, Date.now());
        monthly = Math.round((toPerMonth - fromPerMonth) * Math.max(0, left));
      }

      const amountDue = monthly ?? stripeProration;
      return json(200, {
        preview: {
          // Never negative in the UI — a downgrade nets a credit, which we show as "nothing to
          // pay" rather than a negative price.
          amountDue: Math.max(0, amountDue),
          currency: preview.currency ?? 'usd',
          /** How the figure was reached, for debugging. Not rendered. */
          basis: monthly != null ? 'whole-months' : 'stripe-seconds',
          stripeProration,
          prorationLineCount: prorationLines.length,
          nextInvoiceTotal: preview.amount_due ?? 0,
          fromLookupKey: item.price?.lookup_key ?? null,
          toLookupKey: lookupKey,
        },
      });
    } catch (e) {
      console.log('plan-change preview failed', (e as Error).message);
      return json(200, { preview: null });
    }
  }

  // ── Purchase history ────────────────────────────────────────────────────
  // Everything the user has PAID Stripe, newest first: subscription invoices (initial +
  // renewals, with hosted receipt links) and one-time Checkout purchases. Feeds /purchases.
  if (body.action === 'history') {
    const { data: mapping } = await service
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mapping) return json(200, { payments: [] });
    const customer = mapping.stripe_customer_id;
    const [invoices, sessions] = await Promise.all([
      stripe.invoices.list({ customer, limit: 100 }),
      stripe.checkout.sessions.list({ customer, limit: 100 }),
    ]);
    const payments = [
      ...invoices.data
        .filter((i) => (i.amount_paid ?? 0) > 0 || i.status === 'paid')
        .map((i) => ({
          id: i.id,
          kind: 'subscription',
          createdAt: i.created,
          amount: i.amount_paid ?? 0,
          currency: i.currency ?? 'usd',
          description: i.lines?.data?.[0]?.description ?? 'Subscription payment',
          status: i.status ?? 'paid',
          receiptUrl: i.hosted_invoice_url ?? null,
          binderId: null as string | null,
        })),
      ...sessions.data
        .filter((s) => s.mode === 'payment' && s.payment_status === 'paid')
        .map((s) => ({
          id: s.id,
          kind: 'one_time',
          createdAt: s.created,
          amount: s.amount_total ?? 0,
          currency: s.currency ?? 'usd',
          description:
            s.metadata?.michi_product === 'pdf_binder'
              ? 'Full-binder fill-sheet PDF (one-time unlock)'
              : 'One-time purchase',
          status: 'paid',
          receiptUrl: null as string | null,
          binderId: s.metadata?.binder_id ?? null,
        })),
    ].sort((a, b) => b.createdAt - a.createdAt);
    return json(200, { payments });
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

  // ── Never sell a SECOND subscription to an existing subscriber ──────────────────────────
  //
  // Checkout in subscription mode always CREATES a subscription; it cannot upgrade one. If a PRO
  // subscriber reached here for VIP they would end up paying for both plans, and the entitlement
  // ledger would hide it: the webhook's sibling hygiene expires the PRO row, so the app shows a
  // clean VIP account while Stripe keeps billing PRO. The comparison sheet already routes
  // upgrades away from Checkout (planCta -> 'switch'); this is the backstop that makes the
  // double-charge impossible rather than merely unlikely.
  //
  // Changing plans needs either a Customer Portal configuration with subscription_update enabled,
  // or a subscriptions.update() call here that swaps the price with proration. Neither exists
  // yet, so refuse loudly instead of taking money for the wrong thing.
  if (mode === 'subscription' && mapping?.stripe_customer_id) {
    const existing = await stripe.subscriptions.list({
      customer: mapping.stripe_customer_id,
      status: 'active',
      limit: 10,
    });
    // Only MICHI tiers block each other. The cross-app tcgscan_pro is an independent
    // subscription and is expected to co-exist (see docs/SYNERGY.md).
    const holdsMichiTier = existing.data.some((s) => {
      const key = s.items?.data?.[0]?.price?.lookup_key ?? '';
      return key.startsWith('michi_pro') || key.startsWith('michi_vip');
    });
    if (holdsMichiTier && (michiProduct === 'tier_pro' || michiProduct === 'tier_vip')) {
      return json(409, {
        error:
          'You already have an active michi-maker plan. Changing plans isn’t open yet — it has to move your existing subscription rather than start a second one.',
      });
    }
  }

  // Cross-app BUNDLE discount — verified SERVER-SIDE (a client claiming bundle:true gets the
  // coupon only if it actually owns an active sibling Pro; see docs/SYNERGY.md). Stripe rejects
  // `discounts` together with `allow_promotion_codes`, so a bundle checkout gives up promo codes.
  let discounts: { coupon: string }[] | undefined;
  if (body.bundle === true) {
    const coupon = Deno.env.get('STRIPE_BUNDLE_COUPON');
    const siblings = bundleSiblingsFor(lookupKey);
    if (coupon && siblings) {
      const { data: rows } = await service
        .from('entitlements')
        .select('product, expires_at')
        .eq('user_id', user.id)
        .in('product', siblings);
      const now = Date.now();
      const qualifies = (rows ?? []).some(
        (r) => !r.expires_at || Date.parse(r.expires_at as string) > now,
      );
      if (qualifies) discounts = [{ coupon }];
    }
  }

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
    ...(discounts ? { discounts } : { allow_promotion_codes: true }),
  });

  return json(200, { url: session.url });
});

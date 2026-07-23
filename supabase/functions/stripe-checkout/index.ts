/**
 * stripe-checkout — creates Stripe-hosted surfaces for the signed-in user:
 *
 *  POST { action: 'checkout', lookupKey, returnUrl, binderId? } → { url }
 *    A Checkout Session for one of our catalog lookup_keys (michi_pro_monthly, michi_pro_yearly,
 *    michi_vip_monthly, michi_vip_yearly, michi_binder_pdf). Subscription vs one-time mode is
 *    derived from the price. Carries client_reference_id = the Supabase user id; subscriptions
 *    also get metadata so renewal webhooks can resolve the user without a DB lookup.
 *
 *  POST { action: 'change_plan', lookupKey } → { ok, charged, invoiceUrl }
 *    Moves the EXISTING subscription onto a new price and charges exactly the previewed
 *    whole-month figure (invoice item + proration_behavior 'none'). Charges BEFORE switching, so
 *    a declined card never yields a free upgrade. Upgrades only; downgrades go to the portal.
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
// THE money maths — one implementation, shared with the app and payments-webhook. Deno resolves
// this relative .ts at bundle time (verified: the deployed function boots, i.e. the import
// resolves). Extension is required by Deno's resolver. Never reimplement these here — a mid-term
// upgrade once quoted the right price while granting a fresh year of prints because copies drifted.
import {
  monthsElapsed,
  termPrintAllocation,
  upgradeQuoteMinor,
} from '../../../src/data/proration.ts';

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
  'tcgscan_vip_monthly',
  'tcgscan_vip_yearly',
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
 *  own any michi tier → discounted TCGScan tier; own any TCGScan tier → discounted michi tier.
 *  Level-agnostic on purpose — holding EITHER sibling tier earns the cross-app discount. */
function bundleSiblingsFor(lookupKey: string): string[] | null {
  if (lookupKey.startsWith('tcgscan_pro') || lookupKey.startsWith('tcgscan_vip')) {
    return ['tier_pro', 'tier_vip'];
  }
  if (lookupKey.startsWith('michi_pro') || lookupKey.startsWith('michi_vip')) {
    return ['tcgscan_pro', 'tcgscan_vip'];
  }
  return null; // one-time products have no bundle
}

/** michi lookup key → the entitlement product the shared print maths keys on. */
function tierProductFromLookupKey(lookupKey: string | null | undefined): string | null {
  if (!lookupKey) return null;
  if (lookupKey.startsWith('michi_vip')) return 'tier_vip';
  if (lookupKey.startsWith('michi_pro')) return 'tier_pro';
  return null;
}

/**
 * The upgrade price in minor units — a thin Stripe-shape adapter over the shared
 * `upgradeQuoteMinor`. BOTH the `preview_change` quote and the `change_plan` charge call this, so
 * the number shown is provably the number billed.
 */
function monthlyUpgradeMinor(
  fromPrice: Stripe.Price | null | undefined,
  toPrice: Stripe.Price | null | undefined,
  periodStartSec: number | null,
): number | null {
  return upgradeQuoteMinor({
    fromAmountMinor: fromPrice?.unit_amount,
    fromInterval: fromPrice?.recurring?.interval,
    toAmountMinor: toPrice?.unit_amount,
    toInterval: toPrice?.recurring?.interval,
    periodStartSec,
    nowMs: Date.now(),
  });
}

/**
 * Included prints for the whole term after a plan change — Stripe-shape adapter over the shared
 * `termPrintAllocation`, so the confirm dialog's print promise matches what the webhook writes to
 * the ledger. Requires the OUTGOING plan to be a michi tier (this is a change, not a fresh buy).
 */
function termPrintsAfterChange(
  fromKey: string | null | undefined,
  toKey: string | null | undefined,
  toInterval: string | null | undefined,
  periodStartSec: number | null,
): number | null {
  const fromProduct = tierProductFromLookupKey(fromKey);
  const toProduct = tierProductFromLookupKey(toKey);
  if (!fromProduct || !toProduct) return null;
  return termPrintAllocation(fromProduct, toProduct, toInterval, periodStartSec, Date.now());
}

/**
 * Which APP a tier lookup key belongs to. A bundle customer holds TWO separate subscriptions on
 * one Stripe customer (michi + tcgscan), so every plan-change lookup must be scoped to the family
 * of the requested key — otherwise changing a tcgscan plan would find and mutate the michi
 * subscription. Returns null for one-time products, which have no plan to change.
 */
type AppFamily = 'michi' | 'tcgscan';
function appFamilyOf(lookupKey: string): AppFamily | null {
  if (lookupKey.startsWith('michi_pro') || lookupKey.startsWith('michi_vip')) return 'michi';
  if (lookupKey.startsWith('tcgscan_pro') || lookupKey.startsWith('tcgscan_vip')) return 'tcgscan';
  return null;
}

/** The entitlement product a tier lookup key grants (mirrors the webhook's map). */
function tierProductFor(lookupKey: string): string | null {
  if (lookupKey.startsWith('michi_vip')) return 'tier_vip';
  if (lookupKey.startsWith('michi_pro')) return 'tier_pro';
  if (lookupKey.startsWith('tcgscan_vip')) return 'tcgscan_vip';
  if (lookupKey.startsWith('tcgscan_pro')) return 'tcgscan_pro';
  return null;
}

/** Human app name for customer-facing copy. */
const APP_LABEL: Record<AppFamily, string> = { michi: 'michi-maker', tcgscan: 'TCGScan' };

/** The caller's active subscription IN ONE APP FAMILY (PRO or VIP), or null. */
async function activeSubscriptionFor(
  stripe: Stripe,
  customerId: string,
  family: AppFamily,
): Promise<Stripe.Subscription | null> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 10 });
  return (
    subs.data.find((s) => {
      const k = s.items?.data?.[0]?.price?.lookup_key ?? '';
      return appFamilyOf(k) === family;
    }) ?? null
  );
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

    // Scope to the requested key's own app: a bundle customer has one subscription per app.
    const family = appFamilyOf(lookupKey);
    if (!family) return json(200, { preview: null });
    const current = await activeSubscriptionFor(stripe, mapping.stripe_customer_id, family);
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
      const monthly = monthlyUpgradeMinor(item.price, target, periodStartSecondsOf(current));
      const amountDue = monthly ?? stripeProration;
      return json(200, {
        preview: {
          // Never negative in the UI — a downgrade nets a credit, which we show as "nothing to
          // pay" rather than a negative price.
          amountDue: Math.max(0, amountDue),
          currency: preview.currency ?? 'usd',
          /** Included prints across the whole term after this change (prorated). Rendered. */
          termPrints: termPrintsAfterChange(
            item.price?.lookup_key,
            lookupKey,
            target.recurring?.interval ?? null,
            periodStartSecondsOf(current),
          ),
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

  // ── Change plan (server-driven, exact whole-month proration) ────────────
  //
  // Moves the EXISTING subscription onto a new price and charges precisely the figure the app
  // quoted. The Customer Portal can also switch plans, but it bills Stripe's second-accurate
  // proration ($59.55) rather than our whole-month price ($60.00) — so upgrades are driven here
  // instead, and the portal is left for cancellation and payment methods.
  //
  // How the exactness is achieved: `proration_behavior: 'none'` on the update, so Stripe adds no
  // proration of its own, plus one invoice item for the amount monthlyUpgradeMinor() returns —
  // the SAME function that produced the quote.
  //
  // ORDER MATTERS: charge first, switch second. If the card declines, the plan must not change;
  // the reverse order would hand out a free upgrade on every failed payment.
  if (body.action === 'change_plan') {
    const lookupKey = String(body.lookupKey ?? '');
    if (!SELLABLE.has(lookupKey)) return json(400, { error: 'unknown product' });
    // Tier products only (one-time purchases have no plan to change). Both apps are supported:
    // the change is scoped to the requested key's own family, so a bundle customer's michi and
    // tcgscan subscriptions never interfere with each other.
    const family = appFamilyOf(lookupKey);
    if (!family) return json(400, { error: 'this product has no plan to change' });

    const { data: mapping } = await service
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mapping) return json(404, { error: 'no subscription to change' });
    const customerId = mapping.stripe_customer_id;

    const current = await activeSubscriptionFor(stripe, customerId, family);
    const item = current?.items?.data?.[0];
    if (!current || !item) {
      return json(404, { error: `no active ${APP_LABEL[family]} plan to change` });
    }

    const targets = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    const target = targets.data[0];
    if (!target) return json(500, { error: 'price not found in this Stripe mode' });
    // Already there — treat as success so a double submit is harmless.
    if (item.price?.id === target.id) return json(200, { ok: true, alreadyOnPlan: true });

    const periodStartSec = periodStartSecondsOf(current);
    const amount = monthlyUpgradeMinor(item.price, target, periodStartSec);
    if (amount == null) {
      // Cross-interval (e.g. monthly → yearly) has no honest "months remaining" reading, so we
      // don't invent a price for it. The portal handles those with Stripe's own proration.
      return json(400, {
        error:
          'This plan change has to go through billing management. Open Manage billing and switch there.',
      });
    }
    if (amount < 0) {
      // A downgrade nets a credit. Refunds/credits are deliberately not automated here.
      return json(400, {
        error: 'Moving to a smaller plan is handled in billing management. Open Manage billing.',
      });
    }

    // Duplicate guard. No idempotency key: a legitimate retry after a declined card must be able
    // to try again, which a cached response would prevent. Instead we look for an invoice already
    // raised for THIS exact change and never bill it twice.
    const marker = `${current.id}:${target.id}:${periodStartSec ?? 0}`;
    const recent = await stripe.invoices.list({ customer: customerId, limit: 20 });
    const already = recent.data.find(
      (i) =>
        i.metadata?.michi_plan_change === marker && (i.status === 'paid' || i.status === 'open'),
    );

    let invoiceUrl: string | null = already?.hosted_invoice_url ?? null;
    if (amount > 0 && !already) {
      const months = Math.max(
        0,
        (target.recurring?.interval === 'year' ? 12 : 1) -
          monthsElapsed((periodStartSec ?? 0) * 1000, Date.now()),
      );
      // A standalone invoice charges the CUSTOMER's default payment method — which is routinely
      // unset even when the subscription has a card, because Checkout attaches the card to the
      // SUBSCRIPTION. That is exactly what broke the first live attempt: invoices.pay had nothing
      // to charge, so a correct $60.00 invoice was raised and immediately voided. Resolve the
      // method explicitly, preferring the card already paying for this subscription.
      let payMethod =
        typeof current.default_payment_method === 'string'
          ? current.default_payment_method
          : (current.default_payment_method?.id ?? null);
      if (!payMethod) {
        const cust = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
        const cpm = cust.invoice_settings?.default_payment_method;
        payMethod = typeof cpm === 'string' ? cpm : (cpm?.id ?? null);
      }
      if (!payMethod) {
        return json(402, {
          error:
            'We don’t have a saved payment method for this account. Add one in Manage billing, then try the upgrade again.',
        });
      }

      let invoiceId: string | undefined;
      try {
        // Customer-level pending item (no `subscription`), so the standalone invoice below sweeps
        // it rather than it waiting for the subscription's own next invoice.
        await stripe.invoiceItems.create({
          customer: customerId,
          amount,
          currency: target.currency,
          description: `Upgrade to ${target.nickname ?? lookupKey} — ${months} month${months === 1 ? '' : 's'} remaining in your term`,
          metadata: { michi_plan_change: marker, supabase_user_id: user.id },
        });
        const invoice = await stripe.invoices.create({
          customer: customerId,
          collection_method: 'charge_automatically',
          auto_advance: false,
          pending_invoice_items_behavior: 'include',
          default_payment_method: payMethod,
          description: `${APP_LABEL[family]} plan change (prorated for the rest of your term)`,
          metadata: { michi_plan_change: marker, supabase_user_id: user.id },
        });
        invoiceId = invoice.id;
        const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
        // Pass the method again — belt and braces if the invoice default didn't stick.
        const paid = await stripe.invoices.pay(finalized.id!, { payment_method: payMethod });
        if (paid.status !== 'paid') throw new Error(`invoice status ${paid.status}`);
        invoiceUrl = paid.hosted_invoice_url ?? null;
      } catch (e) {
        // Payment failed → VOID the invoice and leave the plan alone. Voiding also releases the
        // customer from the charge; the next attempt raises a fresh invoice.
        if (invoiceId) await stripe.invoices.voidInvoice(invoiceId).catch(() => {});
        const message = (e as Error).message ?? 'payment failed';
        console.error('plan change payment failed', marker, message);
        return json(402, {
          error: `We couldn’t take the payment for this upgrade, so your plan hasn’t changed. Check your payment method in Manage billing and try again. (${message})`,
        });
      }
    }

    // Paid (or nothing to pay) — now move the plan. proration_behavior 'none' because the invoice
    // above IS the proration. Passing the ITEM id replaces the price; omitting it would ADD a
    // second price and bill both.
    const updated = await stripe.subscriptions.update(current.id, {
      items: [{ id: item.id, price: target.id }],
      proration_behavior: 'none',
      metadata: {
        ...(current.metadata ?? {}),
        supabase_user_id: user.id,
        // The webhook's tier fallback reads this. Must be the TARGET product in the requested
        // app's own vocabulary (tier_* for michi, tcgscan_* for tcgscan), never assumed michi.
        michi_product: tierProductFor(lookupKey) ?? '',
      },
    });

    // The webhook will write the entitlement from customer.subscription.updated; the client polls
    // useTier().refresh() after this returns.
    return json(200, {
      ok: true,
      charged: amount,
      currency: target.currency,
      invoiceUrl,
      newLookupKey: updated.items?.data?.[0]?.price?.lookup_key ?? lookupKey,
    });
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
  // Changing plans has its own path now — `action: 'change_plan'` above, which swaps the price on
  // the existing subscription and bills the exact whole-month figure. Checkout must never be that
  // path, so this stays as the backstop that makes a duplicate subscription impossible.
  if (mode === 'subscription' && mapping?.stripe_customer_id) {
    const existing = await stripe.subscriptions.list({
      customer: mapping.stripe_customer_id,
      status: 'active',
      limit: 10,
    });
    // Block a SECOND subscription within the SAME app only. The two apps are independent
    // (a michi tier and a tcgscan tier co-exist by design — see docs/SYNERGY.md), but PRO↔VIP
    // within one app is a plan change, never a new subscription: a second one would bill both
    // while the webhook's sibling hygiene hides it (the ledger shows one clean tier).
    const existingKeys = existing.data.map((s) => s.items?.data?.[0]?.price?.lookup_key ?? '');
    const holdsMichiTier = existingKeys.some((k) => k.startsWith('michi_pro') || k.startsWith('michi_vip'));
    const holdsTcgscanTier = existingKeys.some((k) => k.startsWith('tcgscan_pro') || k.startsWith('tcgscan_vip'));
    const buyingMichiTier = michiProduct === 'tier_pro' || michiProduct === 'tier_vip';
    const buyingTcgscanTier = michiProduct === 'tcgscan_pro' || michiProduct === 'tcgscan_vip';
    if ((holdsMichiTier && buyingMichiTier) || (holdsTcgscanTier && buyingTcgscanTier)) {
      return json(409, {
        error:
          'You already have an active plan in this app. Changing plans isn’t open yet — it has to move your existing subscription rather than start a second one.',
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

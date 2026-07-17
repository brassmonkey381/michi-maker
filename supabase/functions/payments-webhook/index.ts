/**
 * payments-webhook — Stripe → entitlements. The ONLY writer of paid grants (service role;
 * the entitlements table has no client write policies, see docs/PAYMENTS.md).
 *
 * Signature-verified with STRIPE_WEBHOOK_SECRET (deployed with verify_jwt OFF — Stripe can't
 * send a Supabase JWT; the Stripe signature IS the auth). Idempotent by construction: every
 * write is an upsert keyed on (user_id, product), so Stripe's redeliveries are harmless.
 *
 * Events → effects:
 *  - checkout.session.completed (mode=payment):  grant `pdf_binder:<binderId>` (lifetime).
 *  - checkout.session.completed (mode=subscription): upsert the tier row from the subscription.
 *  - invoice.paid: renewal — re-upsert the tier row (pushes expires_at to the new period end).
 *  - customer.subscription.updated / deleted: recompute expires_at (cancel-at-period-end lapses
 *    exactly at period end; hard cancel/delete lapses now; active gets a 3-day dunning grace).
 *  Always: record the user ↔ Stripe-customer mapping in billing_customers (portal needs it).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const service = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** Our subscription price lookup_keys map onto the entitlement products. `tcgscan_pro` is the
 *  CROSS-APP subscription (sold by either app, read by both — see docs/SYNERGY.md); it is NOT a
 *  michi tier, so the PRO↔VIP sibling hygiene below must never touch it. */
function tierProductFromLookupKey(lookupKey: string | null | undefined): string | null {
  if (!lookupKey) return null;
  if (lookupKey.startsWith('michi_vip')) return 'tier_vip';
  if (lookupKey.startsWith('michi_pro')) return 'tier_pro';
  if (lookupKey.startsWith('tcgscan_pro')) return 'tcgscan_pro';
  return null;
}

/** current_period_end lives on the subscription in older API versions and on the item in newer ones. */
function periodEndSeconds(sub: Stripe.Subscription): number | null {
  const onSub = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof onSub === 'number') return onSub;
  const onItem = (sub.items?.data?.[0] as unknown as { current_period_end?: number })
    ?.current_period_end;
  return typeof onItem === 'number' ? onItem : null;
}

/** Upsert the user ↔ Stripe customer mapping (needed for Customer Portal sessions). */
async function recordCustomer(userId: string, customerId: string | null | undefined) {
  if (!customerId) return;
  await service()
    .from('billing_customers')
    .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' });
}

/** Resolve the Supabase user for a subscription: our metadata first, customer mapping second. */
async function userForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const { data } = await service()
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** The tier grant for a subscription's current state. Idempotent — safe on redelivery. */
async function upsertSubscriptionGrant(sub: Stripe.Subscription) {
  const userId = await userForSubscription(sub);
  const product = tierProductFromLookupKey(sub.items?.data?.[0]?.price?.lookup_key);
  if (!userId || !product) {
    console.log('skipping subscription — unresolved user or product', sub.id);
    return;
  }

  const periodEnd = periodEndSeconds(sub);
  let expiresAtMs: number;
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    // Hard-ended: lapse at the recorded end (or immediately).
    expiresAtMs = (sub.ended_at ?? sub.canceled_at ?? Math.floor(Date.now() / 1000)) * 1000;
  } else if (sub.cancel_at_period_end && periodEnd) {
    // User cancelled but the term is paid through — lapse exactly at period end.
    expiresAtMs = periodEnd * 1000;
  } else if (periodEnd) {
    // Active/renewing: period end + 3-day grace so Smart Retries dunning never gates a
    // paying user mid-recovery. Every invoice.paid pushes this forward.
    expiresAtMs = periodEnd * 1000 + 3 * 24 * 60 * 60 * 1000;
  } else {
    expiresAtMs = Date.now();
  }

  const db = service();
  await db.from('entitlements').upsert(
    {
      user_id: userId,
      product,
      source: 'stripe',
      expires_at: new Date(expiresAtMs).toISOString(),
    },
    { onConflict: 'user_id,product' },
  );

  // Plan switch hygiene: upgrading PRO→VIP (or down) must not leave the other Stripe-sourced
  // tier row alive past now. Manual/lifetime grants are never touched — and neither is the
  // cross-app `tcgscan_pro` (an independent subscription, not a michi tier).
  if (product === 'tier_pro' || product === 'tier_vip') {
    const sibling = product === 'tier_vip' ? 'tier_pro' : 'tier_vip';
    await db
      .from('entitlements')
      .update({ expires_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('product', sibling)
      .eq('source', 'stripe')
      .gt('expires_at', new Date().toISOString());
  }

  await recordCustomer(userId, typeof sub.customer === 'string' ? sub.customer : sub.customer?.id);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('webhook secret not configured', { status: 500 });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    console.error('signature verification failed', (e as Error).message);
    return new Response('bad signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
        if (!userId) break;
        await recordCustomer(
          userId,
          typeof session.customer === 'string' ? session.customer : session.customer?.id,
        );
        if (session.mode === 'payment') {
          // One-time full-binder PDF → lifetime per-binder grant. granted_at is bumped on every
          // purchase: the unlock is a SNAPSHOT license (the binder as it was when spent — see
          // src/data/pdfSnapshot.ts), and a newer granted_at than the recorded spend is what
          // re-arms printing after the binder was edited and bought again.
          if (session.metadata?.michi_product === 'pdf_binder' && session.metadata?.binder_id) {
            await service()
              .from('entitlements')
              .upsert(
                {
                  user_id: userId,
                  product: `pdf_binder:${session.metadata.binder_id}`,
                  source: 'stripe',
                  expires_at: null,
                  granted_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,product' },
              );
          }
        } else if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id,
          );
          await upsertSubscriptionGrant(sub);
        }
        break;
      }

      case 'invoice.paid': {
        // Renewals. The subscription id moved between API versions — check both shapes.
        const invoice = event.data.object as Stripe.Invoice;
        const legacy = (invoice as unknown as { subscription?: string | { id: string } })
          .subscription;
        const modern = (
          invoice as unknown as {
            parent?: { subscription_details?: { subscription?: string | { id: string } } };
          }
        ).parent?.subscription_details?.subscription;
        const ref = legacy ?? modern;
        const subId = typeof ref === 'string' ? ref : ref?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscriptionGrant(sub);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await upsertSubscriptionGrant(event.data.object as Stripe.Subscription);
        break;
      }

      default:
        // Unhandled event types are fine — we only subscribe to the ones above anyway.
        break;
    }
  } catch (e) {
    // 500 → Stripe retries with backoff; our writes are idempotent upserts so that's safe.
    console.error('webhook handler failed', event.type, (e as Error).message);
    return new Response('handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'content-type': 'application/json' },
  });
});

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
 *
 * Every tier row also carries `interval` ('month' | 'year') and `period_start` — the billing
 * term the included-print meter counts over, and the reason a yearly subscriber can be offered
 * the annual print pool (20260719120000_billing_interval_and_print_pool.sql).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
// THE print-allocation maths — shared with the app and stripe-checkout (verified: the deployed
// function boots, so Deno resolves this relative .ts). Only the DB lookup below is webhook-local;
// the arithmetic lives in one place so a mid-term upgrade can never grant a fresh year again.
import { PRINTS_PER_MONTH, termPrintAllocation } from '../../../src/data/proration.ts';

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

/** current_period_start, same two shapes. Falls back to the subscription's start_date. */
function periodStartSeconds(sub: Stripe.Subscription): number | null {
  const onSub = (sub as unknown as { current_period_start?: number }).current_period_start;
  if (typeof onSub === 'number') return onSub;
  const onItem = (sub.items?.data?.[0] as unknown as { current_period_start?: number })
    ?.current_period_start;
  if (typeof onItem === 'number') return onItem;
  return typeof sub.start_date === 'number' ? sub.start_date : null;
}

/**
 * Which billing interval was actually bought. Read from the PRICE (authoritative) rather than
 * the `_yearly` / `_monthly` lookup-key suffix, which is only a naming convention. We sell
 * month and year; anything else Stripe could report (day/week) is recorded as 'month' so the
 * print meter still slices on a monthly cadence rather than falling back to calendar months.
 */
function billingInterval(sub: Stripe.Subscription): 'month' | 'year' | null {
  const recurring = sub.items?.data?.[0]?.price?.recurring;
  if (!recurring?.interval) return null;
  return recurring.interval === 'year' ? 'year' : 'month';
}

/**
 * Included prints for the WHOLE term, which becomes the annual pool total. The DB lookup here is
 * webhook-specific — deciding whether this is a fresh term, a mid-term switch, or a redundant
 * event; the ARITHMETIC is delegated to the shared `termPrintAllocation` so the number written to
 * the ledger is the same one the app quotes and stripe-checkout charges against.
 *
 * You keep your OLD rate for months already served and get the NEW rate for months remaining:
 * upgrading to VIP 8 months into a PRO year yields 1×8 + 3×4 = 20, not a fresh 36. Without this a
 * late upgrade would buy a full year of prints for a few prorated dollars.
 *
 * Only meaningful for YEARLY terms (monthly plans have no pool). Returns null otherwise.
 */
async function termAllocationFor(
  userId: string,
  product: string,
  interval: 'month' | 'year' | null,
  periodStartIso: string | null,
  nowMs: number,
): Promise<number | null> {
  if (interval !== 'year' || !periodStartIso || PRINTS_PER_MONTH[product] === undefined) return null;
  const periodStartSec = Date.parse(periodStartIso) / 1000;

  const db = service();
  const { data: rows } = await db
    .from('entitlements')
    .select('product, period_start, expires_at, term_print_allocation')
    .eq('user_id', userId)
    .in('product', ['tier_pro', 'tier_vip']);

  // Compare INSTANTS, not strings. JS toISOString() says "2026-03-20T07:00:00.000Z" while
  // Postgres serializes the same moment as "2026-03-20T07:00:00+00:00" — string equality never
  // matched, so the sibling lookup below always missed and every mid-term upgrade fell through
  // to the fresh-subscription rate×12 (caught when a real 4-months-in upgrade granted 36, not 28).
  const periodStartMs = Date.parse(periodStartIso);
  const sameTerm = (r: { period_start?: string | null }) =>
    r.period_start != null && Date.parse(r.period_start) === periodStartMs;

  // Already computed for THIS term: keep it. `customer.subscription.updated` fires for plenty of
  // reasons that aren't plan changes (payment method, dunning), and recomputing on each would
  // walk the allocation down as monthsElapsed grows.
  const mine = (rows ?? []).find((r) => r.product === product && sameTerm(r));
  if (mine?.term_print_allocation != null) return mine.term_print_allocation;

  // A mid-term switch: the tier being replaced is still ACTIVE on the same term. `sibling.product`
  // → the outgoing rate; null (no sibling: fresh subscription or renewal) → the whole year.
  const sibling = (rows ?? []).find(
    (r) =>
      r.product !== product &&
      sameTerm(r) &&
      (!r.expires_at || Date.parse(r.expires_at as string) > nowMs),
  );
  return termPrintAllocation(sibling?.product ?? null, product, 'year', periodStartSec, nowMs);
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
  const periodStartSec = periodStartSeconds(sub);
  const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
  let expiresAtMs: number;
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    // Hard-ended: lapse at the recorded end (or immediately).
    expiresAtMs = (sub.ended_at ?? sub.canceled_at ?? Math.floor(Date.now() / 1000)) * 1000;
  } else if ((sub.status === 'past_due' || sub.status === 'unpaid') && periodStartSec) {
    // DUNNING: the renewal payment failed, but Stripe has already rolled the period — so
    // periodEnd is the end of a term nobody has paid for. The active branch below would grant
    // that whole year (caught live on the test-clock rig: a declined renewal produced a full
    // year of access + a fresh print allocation on an open invoice). Access is held at
    // PAID-THROUGH — the unpaid term's start, which is exactly where the old term ended — plus
    // the same grace, so a customer mid-recovery gets their 3 days and no more. invoice.paid on
    // recovery routes through the active branch and restores the full term.
    expiresAtMs = periodStartSec * 1000 + GRACE_MS;
  } else if (sub.cancel_at_period_end && periodEnd) {
    // User cancelled but the term is paid through — lapse exactly at period end.
    expiresAtMs = periodEnd * 1000;
  } else if (periodEnd) {
    // Active: period end + grace. (Dunning no longer reaches this branch — see past_due above.)
    expiresAtMs = periodEnd * 1000 + GRACE_MS;
  } else {
    expiresAtMs = Date.now();
  }

  // Term anchor + interval. `period_start` moves forward with `expires_at` on every renewal;
  // together they define the window the included-print meter counts over (src/data/printWindow.ts),
  // and `interval` is what makes the yearly-only annual print pool offerable at all.
  const periodStartIso = periodStartSec ? new Date(periodStartSec * 1000).toISOString() : null;
  const interval = billingInterval(sub);
  // MUST be computed BEFORE the upsert and BEFORE the sibling is expired below — it reads the
  // outgoing tier's still-active row to work out what the user already served this term.
  const termAllocation = await termAllocationFor(
    userId,
    product,
    interval,
    periodStartIso,
    Date.now(),
  );

  const db = service();
  await db.from('entitlements').upsert(
    {
      user_id: userId,
      product,
      source: 'stripe',
      expires_at: new Date(expiresAtMs).toISOString(),
      interval,
      period_start: periodStartIso,
      term_print_allocation: termAllocation,
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

  // Keep Stripe's own label honest. The Customer Portal swaps the PRICE but leaves subscription
  // metadata alone, so after a PRO→VIP upgrade the subscription still read michi_product=tier_pro.
  // Nothing resolves a tier from this — the price lookup_key is the source of truth — but stale
  // metadata misleads support and any reporting built on it later.
  //
  // Best-effort: a failure here must never fail the webhook. It fires one more
  // customer.subscription.updated, which finds the metadata already correct and stops.
  if (sub.metadata?.michi_product && sub.metadata.michi_product !== product) {
    await stripe.subscriptions
      .update(sub.id, { metadata: { ...sub.metadata, michi_product: product } })
      .catch((e) => console.log('metadata sync skipped', (e as Error).message));
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

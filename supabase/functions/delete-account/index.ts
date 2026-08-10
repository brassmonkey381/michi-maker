/**
 * delete-account — irreversibly deletes the CALLER's own account and data.
 *
 *  POST {} → { ok: true, cancelledSubscriptions: n, filesRemoved: n, storageError?: string }
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
 * Three columns are ON DELETE SET NULL rather than CASCADE, all deliberately: `scan_feedback.
 * owner_id` (the feedback survives, anonymised — it trains the scanner and is no longer personal
 * data), `content_reports.reporter_id` (a moderation report must outlive the reporter), and
 * `reserved_usernames.claimable_by` (the reservation stands, it just stops being claimable by a
 * specific person). Verified against pg_constraint 2026-07-28: nothing is RESTRICT or NO ACTION,
 * so the delete can never fail on a foreign key.
 *
 * ── Storage does NOT cascade ──────────────────────────────────────────────────────────────────
 * `storage.objects` has no foreign key to auth.users at all (checked 2026-07-28), so deleting the
 * account leaves every uploaded file behind — including `binder-art`, which is a PUBLIC bucket.
 * A deleted user's uploaded art staying publicly reachable is precisely the thing "delete my
 * account and my data" is supposed to prevent, so this function removes it explicitly.
 *
 * Objects are stored under a `<user-id>/` prefix, which is what makes this possible without
 * exposing the storage schema to PostgREST. `scan-feedback` is deliberately NOT purged, matching
 * the SET NULL above; those are photographs of cards, kept to train the scanner, under a prefix
 * that no longer resolves to any account.
 *
 * A storage failure does NOT block the deletion. Refusing to delete someone's account because a
 * file wouldn't unlink would be a worse failure than the orphan; the count and the error come back
 * in the response and go to the log so it can be cleaned up.
 *
 * Auth: JWT verification is ON. The user is resolved from the caller's own token and can only
 * ever delete THEMSELVES; no id is accepted from the request body. Anonymous (guest) sessions are
 * rejected: they own nothing server-side and have nothing to delete.
 *
 * Secrets: STRIPE_SECRET_KEY, SUPABASE_SECRET_KEY (falls back to the legacy
 *          SUPABASE_SERVICE_ROLE_KEY until the new key is set - see _shared/keys.ts).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@18.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { publishableKey, secretKey } from '../_shared/keys.ts';

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
  const url = Deno.env.get('SUPABASE_URL');
  // secretKey() throws when neither the new nor the legacy key is present. Caught here so a missing
  // key still answers the caller with the same clean 500 this endpoint has always returned, rather
  // than an unhandled rejection — this one is user-facing (account deletion).
  let serviceKey: string;
  try {
    serviceKey = secretKey();
  } catch {
    return json({ error: 'server_misconfigured' }, 500);
  }
  if (!url) return json({ error: 'server_misconfigured' }, 500);

  // 1. Who is calling? Resolved from THEIR token — never from the body.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, publishableKey(), {
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

  // 3. Remove uploaded files, which storage does not cascade (see the note above). Done BEFORE
  //    the user delete so a failure is retryable by simply pressing delete again.
  let filesRemoved = 0;
  let storageError: string | undefined;
  try {
    for (const bucket of ['binder-art', 'binder-pdfs']) {
      // list() pages at 100, and a silent truncation would leave files behind while reporting
      // success — so drain: take the first page, delete it, look again. No offset arithmetic,
      // because each removal shifts the listing under us; the prefix is empty when list() is.
      // The round cap is a runaway guard, not an expected limit (100 rounds = 10k files).
      for (let round = 0; round < 100; round++) {
        const { data: files, error } = await admin.storage
          .from(bucket)
          .list(user.id, { limit: 100 });
        if (error) throw error;
        if (!files?.length) break;
        const paths = files.map((f) => `${user.id}/${f.name}`);
        const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
        if (rmErr) throw rmErr;
        filesRemoved += paths.length;
      }
    }
  } catch (e) {
    storageError = e instanceof Error ? e.message : String(e);
    console.error('[delete-account] storage cleanup failed', user.id, e);
  }

  // 4. Delete the auth user. Every user-scoped table cascades from here.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    // Subscriptions are already cancelled, so the worst case here is an account that still exists
    // but no longer bills — safe, and retryable. Say so rather than reporting success.
    console.error('[delete-account] user delete failed', user.id, delErr);
    return json({ error: 'delete_failed', cancelledSubscriptions: cancelled, filesRemoved }, 500);
  }

  console.log(
    `[delete-account] deleted ${user.id} (cancelled ${cancelled} subscription(s), removed ${filesRemoved} file(s))`,
  );
  return json({ ok: true, cancelledSubscriptions: cancelled, filesRemoved, storageError });
});

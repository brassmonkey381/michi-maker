/**
 * PROVE THAT LIVE SUBSCRIPTIONS WORK, for about fifty cents.
 *
 * Billing has been live since 2026-07-22, but "the code is deployed" and "a real card produces a
 * real entitlement" are different claims, and only the second one matters. This walks the whole
 * live path against the test account and shows every stage, so a break can be pinned to a stage
 * instead of guessed at.
 *
 * THE FOUR MODES, in the order you run them:
 *
 *   check    (default, READ-ONLY) Where the test account stands right now: its Supabase user, its
 *            ledger rows, its Stripe customer, its subscriptions and its recent charges. Run it
 *            BEFORE you buy anything, so "it worked" is a comparison and not an impression.
 *   check    ...and again after paying. The grant should be there within seconds.
 *   cancel   Ends the subscription IMMEDIATELY (not at period end). This is the revocation test:
 *            customer.subscription.deleted fires, and the ledger row's expires_at should land in
 *            the past. Do this before the refund.
 *   refund   Refunds the charge in full. Money back, minus Stripe's processing fee, which is NOT
 *            returned on a refund and is the real cost of the exercise.
 *
 * WHY CANCEL AND REFUND ARE SEPARATE, and why the order matters: a refund does NOT end a
 * subscription here. payments-webhook's charge.refunded branch deliberately handles only FOUNDER
 * purchases (a lifetime row has no subscription to cancel, so nothing else would ever end it) and
 * breaks out for everything else. Refund a subscription without cancelling it and the entitlement
 * survives, the subscription renews next month, and you have tested nothing about revocation.
 *
 * NOTHING HERE IS SILENT. cancel and refund both refuse to run without --yes, and both print what
 * they are about to touch first. Secrets arrive as env vars from the .ps1 and are never printed.
 *
 * Run through state/verify-live-subscription.ps1.
 */
const MODE = (process.argv[2] ?? 'check').toLowerCase();
const CONFIRMED = process.argv.includes('--yes');

const PROJECT_REF = 'piikwvntldytjejxmcla';
const stripeKey = process.env.STRIPE_SECRET_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const testEmail = process.env.MICHI_TEST_EMAIL;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!['check', 'cancel', 'refund'].includes(MODE)) fail(`unknown mode "${MODE}" (check | cancel | refund)`);
if (!stripeKey) fail('STRIPE_SECRET_KEY is not set (the .ps1 wrapper loads it).');
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
if (!testEmail) fail('MICHI_TEST_EMAIL is not set (the .ps1 wrapper loads it).');

// A live key starts sk_live_; a test key starts sk_test_. Testing the LIVE path with a test key
// proves nothing, so say which one is in play rather than let the run look successful either way.
const LIVE = stripeKey.startsWith('sk_live_');
console.log(`Stripe mode: ${LIVE ? 'LIVE (real money)' : 'TEST (no real money)'}`);
if (!LIVE && MODE !== 'check') fail('refusing to cancel or refund with a test-mode key by mistake.');

async function stripe(path, { method = 'GET', form } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(form ? { body: new URLSearchParams(form).toString() } : {}),
  });
  const body = await res.json();
  if (!res.ok) fail(`stripe ${path} (${res.status}): ${body?.error?.message ?? 'unknown'}`);
  return body;
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const money = (minor, ccy) => `${(minor / 100).toFixed(2)} ${String(ccy ?? 'usd').toUpperCase()}`;
const when = (sec) => (sec ? new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19) : 'never');
const esc = (s) => String(s).replace(/'/g, "''");

// --- who the test account is ------------------------------------------------
console.log(`\nStep 1: resolving the test account`);
const users = await sql(`select id, email, created_at from auth.users where email = '${esc(testEmail)}' limit 1;`);
if (!users.length) fail('the test account has no Supabase user. Sign in as it once in the app first.');
const user = users[0];
console.log(`  user ${user.id}  (created ${String(user.created_at).slice(0, 10)})`);

// --- what the ledger says ---------------------------------------------------
console.log(`\nStep 2: the entitlement ledger for that user`);
const rows = await sql(`
  select product, source, interval, granted_at, expires_at, period_start, term_print_allocation
  from public.entitlements where user_id = '${user.id}' order by granted_at desc;
`);
if (!rows.length) {
  console.log('  (no rows: the account holds nothing)');
} else {
  for (const r of rows) {
    const live = r.expires_at === null || new Date(r.expires_at) > new Date();
    console.log(
      `  ${live ? 'ACTIVE ' : 'lapsed '} ${r.product} · ${r.source} · ${r.interval ?? 'no interval'}` +
        ` · granted ${String(r.granted_at).slice(0, 19)} · expires ${r.expires_at ? String(r.expires_at).slice(0, 19) : 'never'}`,
    );
  }
}

// --- the Stripe side --------------------------------------------------------
console.log(`\nStep 3: the Stripe customer`);
const mapped = await sql(`select stripe_customer_id from public.billing_customers where user_id = '${user.id}' limit 1;`);
let customerId = mapped[0]?.stripe_customer_id ?? null;
if (customerId) {
  console.log(`  billing_customers maps this user to ${customerId}`);
} else {
  const found = await stripe(`customers/search?query=${encodeURIComponent(`email:'${testEmail}'`)}&limit=1`);
  customerId = found.data?.[0]?.id ?? null;
  console.log(
    customerId
      ? `  no billing_customers row yet; found ${customerId} by email (the webhook writes the mapping on the first grant)`
      : '  no Stripe customer at all. Nothing has ever been bought on this account.',
  );
}

let subs = { data: [] };
let charges = { data: [] };
if (customerId) {
  console.log(`\nStep 4: subscriptions`);
  subs = await stripe(`subscriptions?customer=${customerId}&status=all&limit=10`);
  if (!subs.data.length) console.log('  (none)');
  for (const s of subs.data) {
    const item = s.items?.data?.[0];
    console.log(
      `  ${s.id} · ${s.status} · ${item?.price?.lookup_key ?? item?.price?.id} · ` +
        `${money(item?.price?.unit_amount, item?.price?.currency)}/${item?.price?.recurring?.interval ?? '?'} · ` +
        `ends ${when(s.ended_at ?? s.canceled_at)} · cancel_at_period_end=${!!s.cancel_at_period_end}`,
    );
  }

  console.log(`\nStep 5: recent charges`);
  charges = await stripe(`charges?customer=${customerId}&limit=5`);
  if (!charges.data.length) console.log('  (none)');
  for (const c of charges.data) {
    console.log(
      `  ${c.id} · ${money(c.amount, c.currency)} · ${c.status}` +
        `${c.refunded ? ' · FULLY REFUNDED' : c.amount_refunded ? ` · partly refunded ${money(c.amount_refunded, c.currency)}` : ''}` +
        ` · ${when(c.created)}`,
    );
  }
}

// --- the two actions --------------------------------------------------------
if (MODE === 'cancel') {
  const target = subs.data.find((s) => s.status === 'active' || s.status === 'trialing');
  if (!target) fail('no active subscription to cancel.');
  if (!CONFIRMED) {
    console.log(`\nWould cancel ${target.id} IMMEDIATELY (not at period end). Re-run with -Yes to do it.`);
    process.exit(0);
  }
  console.log(`\nStep 6: cancelling ${target.id} immediately`);
  const done = await stripe(`subscriptions/${target.id}`, { method: 'DELETE' });
  console.log(`  status is now ${done.status}, ended ${when(done.ended_at ?? done.canceled_at)}`);
  console.log('  customer.subscription.deleted has fired; re-run in `check` mode in a few seconds.');
  console.log('  EXPECT: the entitlement row keeps its product but expires_at moves into the past.');
}

if (MODE === 'refund') {
  const target = charges.data.find((c) => c.status === 'succeeded' && !c.refunded);
  if (!target) fail('no un-refunded succeeded charge to refund.');
  if (!CONFIRMED) {
    console.log(`\nWould refund ${target.id} in full (${money(target.amount, target.currency)}). Re-run with -Yes to do it.`);
    console.log("Stripe does NOT return its processing fee on a refund, so this still costs roughly 2.9% + 30c.");
    process.exit(0);
  }
  console.log(`\nStep 6: refunding ${target.id} in full`);
  const refund = await stripe('refunds', { method: 'POST', form: { charge: target.id } });
  console.log(`  refund ${refund.id} · ${refund.status} · ${money(refund.amount, refund.currency)}`);
  console.log('  NOTE: a refund does not end a subscription here. Cancel it too, if you have not.');
}

console.log('\nOK');

/**
 * The one-time binder PDF costs $1.99 (owner, 2026-09-21; it was $3.99).
 *
 * The app quotes BINDER_PDF_PRICE (src/data/subscriptions.ts). The CHARGE is whatever Stripe Price
 * the lookup key `michi_binder_pdf` points at, because stripe-checkout resolves prices by lookup
 * key. A Stripe Price cannot be edited, so a new one-time Price is created on the SAME product
 * with `transfer_lookup_key: true`, which moves the key onto it; checkout charges the new amount
 * from that moment. The old Price is left as it is: nothing renews on a one-time price, and past
 * purchases keep pointing at the object they were bought with.
 *
 * DRY RUN BY DEFAULT. Without APPLY=1 nothing is written: it reads the account and says what it
 * would do. Idempotent: a key already on a one-time USD price of 199 is "already right".
 * It says LIVE or TEST, from the key, before anything else. The key comes from the environment
 * (state/stripe-binder-pdf-price.ps1 loads it from tcgscan.secrets) and is never printed.
 */
const key = process.env.STRIPE_SECRET_KEY;
const APPLY = process.env.APPLY === '1';
const LOOKUP = 'michi_binder_pdf';
const AMOUNT = 199;
if (!key) {
  console.log('FAILED: STRIPE_SECRET_KEY is not set (exit code 2)');
  process.exit(2);
}

async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json?.error?.message ?? ''}`);
  return json;
}
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

try {
  console.log(`[1/3] This is a ${key.startsWith('sk_live') ? 'LIVE' : 'TEST'} key. ${APPLY ? 'APPLY: it will write.' : 'DRY RUN: nothing will be written.'}`);

  console.log(`[2/3] What "${LOOKUP}" points at now`);
  const found = await stripe('GET', 'prices', { 'lookup_keys[]': LOOKUP, 'expand[]': 'data.product', limit: '1' });
  const now = found.data[0];
  if (!now) {
    console.log(`FAILED: no price carries the lookup key "${LOOKUP}" (exit code 3). Nothing to move.`);
    process.exit(3);
  }
  console.log(`      ${money(now.unit_amount)} ${now.currency.toUpperCase()}, ${now.type}, product "${now.product.name}", price ${now.id}`);
  if (now.type !== 'one_time') {
    console.log('FAILED: that price is not one-time; refusing to touch it (exit code 4).');
    process.exit(4);
  }

  console.log(`[3/3] Make it ${money(AMOUNT)}`);
  if (now.unit_amount === AMOUNT && now.currency === 'usd') {
    console.log('      already right, nothing to do.');
  } else if (!APPLY) {
    console.log(`      WOULD create a one-time ${money(AMOUNT)} USD price on "${now.product.name}" and move "${LOOKUP}" onto it.`);
    console.log('      Run again with -Apply to do it.');
  } else {
    const made = await stripe('POST', 'prices', {
      product: now.product.id,
      currency: 'usd',
      unit_amount: String(AMOUNT),
      lookup_key: LOOKUP,
      transfer_lookup_key: 'true',
      nickname: 'michi-maker binder PDF (one time)',
    });
    console.log(`      created ${made.id} at ${money(made.unit_amount)}.`);
    const check = await stripe('GET', 'prices', { 'lookup_keys[]': LOOKUP, limit: '1' });
    const after = check.data[0];
    console.log(`      "${LOOKUP}" now points at ${after.id}, ${money(after.unit_amount)}.`);
    if (after.id !== made.id || after.unit_amount !== AMOUNT) {
      console.log('FAILED: the lookup key did not move to the new price (exit code 5).');
      process.exit(5);
    }
  }
  console.log('DONE.');
} catch (e) {
  console.log(`FAILED: ${e.message} (exit code 1)`);
  process.exit(1);
}

/**
 * Stripe prices for the 2026-09 tier rework (tcgscan-app docs/TIER-REWORK.md).
 *
 *   PRO, both apps      $5.99 a month, $49.99 a year     (lookup keys MOVE to the new prices)
 *   Founder, both apps  $119.99 once                      (new lookup keys)
 *   Bundle, web only    $8.99 a month, $74.99 a year      (new product, new lookup keys)
 *
 * HOW A PRICE CHANGES IN STRIPE. A Price is immutable: the amount cannot be edited. A new Price is
 * created on the same Product with `transfer_lookup_key: true`, which moves the lookup key off the
 * old Price onto the new one. Checkout resolves prices by lookup key, so it starts charging the new
 * amount at once; every EXISTING subscription keeps the Price object it was created with, so nobody
 * already paying is repriced. The old Price is left active on purpose (deactivating it would break
 * those subscriptions' renewals).
 *
 * DRY RUN BY DEFAULT. Without APPLY=1 nothing is written: the script reads the account and prints
 * exactly what it would create. It is idempotent: a lookup key already pointing at a price with the
 * target amount, currency and interval is reported as "already right" and skipped.
 *
 * It prints whether the key is a LIVE or a TEST key before doing anything. The key comes from the
 * environment (the .ps1 loads it from tcgscan.secrets) and is never printed.
 */
const key = process.env.STRIPE_SECRET_KEY;
const APPLY = process.env.APPLY === '1';
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
const priceByKey = async (lookupKey) =>
  (await stripe('GET', 'prices', { 'lookup_keys[]': lookupKey, 'expand[]': 'data.product', limit: '1' })).data[0] ?? null;

/** Recurring prices whose lookup key moves to a new amount on the SAME product. */
const REPRICE = [
  { key: 'tcgscan_pro_monthly', amount: 599, interval: 'month' },
  { key: 'tcgscan_pro_yearly', amount: 4999, interval: 'year' },
  { key: 'michi_pro_monthly', amount: 599, interval: 'month' },
  { key: 'michi_pro_yearly', amount: 4999, interval: 'year' },
];
/** One-time Founder prices, created on the product the app's PRO yearly price lives on. */
const FOUNDER = [
  { key: 'tcgscan_pro_founder', amount: 11999, onProductOf: 'tcgscan_pro_yearly', nickname: 'TCGScan Founder (lifetime PRO)' },
  { key: 'michi_pro_founder', amount: 11999, onProductOf: 'michi_pro_yearly', nickname: 'michi-maker Founder (lifetime PRO)' },
];
/** The web bundle: one new product, two recurring prices. */
const BUNDLE = {
  productName: 'TCGScan + michi-maker PRO',
  metadataKey: 'tier_rework_bundle',
  prices: [
    { key: 'bundle_pro_monthly', amount: 899, interval: 'month' },
    { key: 'bundle_pro_yearly', amount: 7499, interval: 'year' },
  ],
};

const isRight = (p, want) =>
  p && p.active && p.unit_amount === want.amount && p.currency === 'usd' &&
  (want.interval ? p.recurring?.interval === want.interval : !p.recurring);

let planned = 0;
let done = 0;

try {
  const acct = await stripe('GET', 'account');
  const live = key.startsWith('sk_live') || key.startsWith('rk_live');
  console.log(`Stripe account: ${acct.settings?.dashboard?.display_name ?? acct.id}   mode: ${live ? 'LIVE' : 'TEST'}   ${APPLY ? 'APPLYING' : 'DRY RUN (nothing is written)'}`);
  console.log('');

  console.log('[1/3] PRO prices (lookup keys move to the new amount; existing subscriptions keep theirs)');
  for (const want of REPRICE) {
    const cur = await priceByKey(want.key);
    if (!cur) {
      console.log(`      ${want.key.padEnd(24)} NOT FOUND: no price carries this lookup key. Skipped.`);
      continue;
    }
    if (isRight(cur, want)) {
      console.log(`      ${want.key.padEnd(24)} already right (${money(cur.unit_amount)} / ${cur.recurring.interval})`);
      continue;
    }
    planned += 1;
    console.log(`      ${want.key.padEnd(24)} ${money(cur.unit_amount)} / ${cur.recurring?.interval}  ->  ${money(want.amount)} / ${want.interval}   on product "${cur.product?.name ?? cur.product}"`);
    if (APPLY) {
      await stripe('POST', 'prices', {
        product: typeof cur.product === 'string' ? cur.product : cur.product.id,
        unit_amount: String(want.amount), currency: 'usd',
        'recurring[interval]': want.interval,
        lookup_key: want.key, transfer_lookup_key: 'true',
        'metadata[tier_rework]': '2026-09',
      });
      done += 1;
    }
  }

  console.log('[2/3] Founder prices (one-time)');
  for (const want of FOUNDER) {
    const cur = await priceByKey(want.key);
    if (isRight(cur, want)) {
      console.log(`      ${want.key.padEnd(24)} already right (${money(cur.unit_amount)} once)`);
      continue;
    }
    const anchor = await priceByKey(want.onProductOf);
    if (!anchor) {
      console.log(`      ${want.key.padEnd(24)} SKIPPED: could not find ${want.onProductOf} to learn the product.`);
      continue;
    }
    planned += 1;
    console.log(`      ${want.key.padEnd(24)} create ${money(want.amount)} once   on product "${anchor.product?.name ?? anchor.product}"`);
    if (APPLY) {
      await stripe('POST', 'prices', {
        product: typeof anchor.product === 'string' ? anchor.product : anchor.product.id,
        unit_amount: String(want.amount), currency: 'usd',
        lookup_key: want.key, transfer_lookup_key: 'true', nickname: want.nickname,
        'metadata[tier_rework]': '2026-09', 'metadata[founder]': 'true',
      });
      done += 1;
    }
  }

  console.log('[3/3] The web bundle');
  const existing = await Promise.all(BUNDLE.prices.map((p) => priceByKey(p.key)));
  let productId = existing.find(Boolean)?.product;
  productId = productId && typeof productId !== 'string' ? productId.id : productId;
  if (!productId) {
    const found = await stripe('GET', 'products/search', { query: `metadata['${BUNDLE.metadataKey}']:'true'`, limit: '1' }).catch(() => ({ data: [] }));
    productId = found.data[0]?.id;
  }
  if (!productId) {
    planned += 1;
    console.log(`      product                  create "${BUNDLE.productName}"`);
    if (APPLY) {
      const created = await stripe('POST', 'products', { name: BUNDLE.productName, [`metadata[${BUNDLE.metadataKey}]`]: 'true' });
      productId = created.id;
      done += 1;
    }
  } else {
    console.log(`      product                  exists (${productId})`);
  }
  for (let i = 0; i < BUNDLE.prices.length; i++) {
    const want = BUNDLE.prices[i];
    if (isRight(existing[i], want)) {
      console.log(`      ${want.key.padEnd(24)} already right (${money(want.amount)} / ${want.interval})`);
      continue;
    }
    planned += 1;
    console.log(`      ${want.key.padEnd(24)} create ${money(want.amount)} / ${want.interval}`);
    if (APPLY && productId) {
      await stripe('POST', 'prices', {
        product: productId, unit_amount: String(want.amount), currency: 'usd',
        'recurring[interval]': want.interval, lookup_key: want.key, transfer_lookup_key: 'true',
        'metadata[tier_rework]': '2026-09',
      });
      done += 1;
    }
  }

  console.log('');
  if (APPLY) console.log(`DONE. ${done} of ${planned} planned changes were written. VIP prices were left alone (VIP is simply no longer offered).`);
  else console.log(`DRY RUN complete: ${planned} change(s) would be made. Run again with -Apply to write them.`);
} catch (e) {
  console.log(`FAILED: ${String(e.message).slice(0, 500)} (exit code 3). ${APPLY ? `${done} change(s) had already been written; the script is safe to run again.` : ''}`);
  process.exit(3);
}

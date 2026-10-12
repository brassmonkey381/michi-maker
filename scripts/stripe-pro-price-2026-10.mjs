/**
 * michi-maker PRO price cut, 2026-10-11 (owner): $2.99 a month, $24.99 a year. A real list price,
 * not a coupon, so nothing expires and nothing is struck through.
 *
 *   michi_pro_monthly   $5.99  ->  $2.99
 *   michi_pro_yearly    $49.99 ->  $24.99
 *
 * TWO STEPS, both idempotent, dry-run by default (APPLY=1 writes):
 *
 *   [1/2] NEW PRICES. A Stripe Price is immutable, so a new Price is created on the same Product
 *         with `transfer_lookup_key: true`, which moves the lookup key onto it. Checkout resolves
 *         by lookup key, so it charges the new amount at once. The old Price stays active.
 *
 *   [2/2] EXISTING SUBSCRIBERS MOVE TOO (owner call 2026-10-11, unlike the September rework).
 *         Every active michi PRO subscription still on the old monthly/yearly Price is switched to
 *         the new Price with `proration_behavior: none`: nothing is charged or credited today, the
 *         billing date does not move, and the next invoice is at the new amount. Founder and bundle
 *         subscriptions are untouched; they are different prices.
 *
 * The key comes from the environment (the .ps1 loads it from tcgscan.secrets) and is never printed.
 * The mode (LIVE or TEST) is printed before anything is written.
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

const REPRICE = [
  { key: 'michi_pro_monthly', amount: 299, interval: 'month' },
  { key: 'michi_pro_yearly', amount: 2499, interval: 'year' },
];

const isRight = (p, want) =>
  p && p.active && p.unit_amount === want.amount && p.currency === 'usd' && p.recurring?.interval === want.interval;

let planned = 0;
let done = 0;

try {
  const acct = await stripe('GET', 'account');
  const live = key.startsWith('sk_live') || key.startsWith('rk_live');
  console.log(`Stripe account: ${acct.settings?.dashboard?.display_name ?? acct.id}   mode: ${live ? 'LIVE' : 'TEST'}   ${APPLY ? 'APPLYING' : 'DRY RUN (nothing is written)'}`);
  console.log('');

  console.log('[1/2] PRO prices (lookup keys move to the new amount)');
  // After this loop, newPrice[key] is the Price every subscriber should be on.
  const newPrice = {};
  for (const want of REPRICE) {
    const cur = await priceByKey(want.key);
    if (!cur) {
      console.log(`      ${want.key.padEnd(20)} NOT FOUND: no price carries this lookup key. Skipped.`);
      continue;
    }
    if (isRight(cur, want)) {
      console.log(`      ${want.key.padEnd(20)} already right (${money(cur.unit_amount)} / ${cur.recurring.interval})`);
      newPrice[want.key] = cur;
      continue;
    }
    planned += 1;
    console.log(`      ${want.key.padEnd(20)} ${money(cur.unit_amount)} / ${cur.recurring?.interval}  ->  ${money(want.amount)} / ${want.interval}   on product "${cur.product?.name ?? cur.product}"`);
    if (APPLY) {
      newPrice[want.key] = await stripe('POST', 'prices', {
        product: typeof cur.product === 'string' ? cur.product : cur.product.id,
        unit_amount: String(want.amount), currency: 'usd',
        'recurring[interval]': want.interval,
        lookup_key: want.key, transfer_lookup_key: 'true',
        'metadata[price_cut]': '2026-10',
      });
      done += 1;
    }
  }

  console.log('[2/2] Existing michi PRO subscribers move to the new price at their next renewal');
  // Every price that ever carried one of these keys on the same product, so a subscriber from
  // before September (on the $3.99 / $39.99 Price) is found too, not only the September one.
  const products = new Set(
    Object.values(newPrice).map((p) => (typeof p.product === 'string' ? p.product : p.product.id)),
  );
  for (const want of REPRICE) {
    const cur = await priceByKey(want.key);
    if (cur) products.add(typeof cur.product === 'string' ? cur.product : cur.product.id);
  }
  let moved = 0;
  let scanned = 0;
  for (const status of ['active', 'trialing', 'past_due']) {
    let starting_after;
    for (;;) {
      const page = await stripe('GET', 'subscriptions', {
        status, limit: '100', ...(starting_after ? { starting_after } : {}),
      });
      for (const sub of page.data) {
        scanned += 1;
        for (const item of sub.items.data) {
          const price = item.price;
          const product = typeof price.product === 'string' ? price.product : price.product.id;
          if (!products.has(product) || !price.recurring) {
            console.log(`      ${sub.id}  not michi PRO (${price.lookup_key ?? price.id}, ${money(price.unit_amount)}); left alone`);
            continue;
          }
          const wantKey = `michi_pro_${price.recurring.interval === 'year' ? 'yearly' : 'monthly'}`;
          const want = REPRICE.find((r) => r.key === wantKey);
          const target = newPrice[wantKey]; // undefined in a dry run before step 1 has been applied
          // Only a subscriber paying MORE than the new price moves. Founder is one-time (never a
          // subscription) and the bundle is another product, so neither reaches here.
          if (!want || (target && price.id === target.id) || price.unit_amount <= want.amount) continue;
          planned += 1;
          console.log(`      ${sub.id}  ${money(price.unit_amount)} / ${price.recurring.interval}  ->  ${money(want.amount)}   next renewal ${new Date(sub.current_period_end * 1000).toISOString().slice(0, 10)}`);
          if (APPLY && target) {
            await stripe('POST', `subscriptions/${sub.id}`, {
              'items[0][id]': item.id,
              'items[0][price]': target.id,
              proration_behavior: 'none',
              'metadata[price_cut]': '2026-10',
            });
            done += 1;
            moved += 1;
          }
        }
      }
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1].id;
    }
  }
  console.log(`      ${scanned} subscription(s) scanned${APPLY ? `, ${moved} moved` : ''}`);

  console.log('');
  if (APPLY) console.log(`DONE. ${done} of ${planned} planned change(s) were written. Run again to confirm everything reports "already right".`);
  else console.log(`DRY RUN complete: ${planned} change(s) would be made. Run again with -Apply to write them.`);
} catch (e) {
  console.log(`FAILED: ${String(e.message).slice(0, 500)} (exit code 3). ${APPLY ? `${done} change(s) had already been written; the script is safe to run again.` : ''}`);
  process.exit(3);
}

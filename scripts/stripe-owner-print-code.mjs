/**
 * A 100% off promotion code for the one-time binder PDF, usable only by one Stripe customer.
 * Prints are in no plan since 2026-09, so every account buys a binder's PDF at checkout; this code
 * zeroes that charge for the owner's own account. The webhook grants `pdf_binder:<id>` from the
 * completed session without checking the amount, so a $0 session unlocks the binder as usual.
 *
 * Usage: node scripts/stripe-owner-print-code.mjs <supabase user id> <CODE>
 * Needs STRIPE_SECRET_KEY in the environment (state/stripe-owner-print-code.ps1 loads it). Never printed.
 */
import { appSql, fail, step } from './lib/michi.mjs';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) fail('STRIPE_SECRET_KEY is not set');
const [userId, code] = process.argv.slice(2);
if (!userId || !code) fail('usage: <supabase user id> <CODE>');

async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'GET' ? undefined : body });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json?.error?.message ?? ''}`);
  return json;
}

step(1, `${key.startsWith('sk_live') ? 'LIVE' : 'TEST'} key; the account's Stripe customer`);
const rows = await appSql(`select stripe_customer_id from public.billing_customers where user_id = '${userId}';`);
if (rows.length !== 1) fail(`${rows.length} billing_customers rows for that user`);
const customer = rows[0].stripe_customer_id;
console.log(`  customer ${customer}`);

step(2, 'the binder PDF product');
const prices = await stripe('GET', 'prices', { 'lookup_keys[]': 'michi_binder_pdf', limit: '1' });
const price = prices.data[0];
if (!price) fail('no price with lookup key michi_binder_pdf');
console.log(`  product ${price.product}, ${price.unit_amount} ${price.currency}`);

step(3, `promotion code ${code}`);
const existing = await stripe('GET', 'promotion_codes', { code, limit: '1' });
if (existing.data[0]) {
  console.log(`  already exists (${existing.data[0].active ? 'active' : 'inactive'})`);
} else {
  // Reuse a coupon of this name if an earlier run left one behind.
  const coupons = await stripe('GET', 'coupons', { limit: '100' });
  let coupon = coupons.data.find((c) => c.name === 'Owner binder PDF' && c.percent_off === 100 && c.valid);
  if (!coupon) {
    coupon = await stripe('POST', 'coupons', {
      percent_off: '100', duration: 'forever', name: 'Owner binder PDF',
      'applies_to[products][]': price.product,
    });
  }
  // Current API versions take the coupon under `promotion`, not as a top-level `coupon`.
  const promo = await stripe('POST', 'promotion_codes', {
    'promotion[type]': 'coupon', 'promotion[coupon]': coupon.id, code, customer,
  });
  console.log(`  created ${promo.id} on coupon ${coupon.id}, restricted to customer ${customer}`);
}
console.log('DONE: at checkout, open "Add promotion code" and enter the code.');

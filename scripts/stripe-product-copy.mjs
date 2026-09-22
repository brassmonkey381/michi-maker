/**
 * The product copy Stripe Checkout shows at the moment of payment.
 *
 * WHY THIS MATTERS MORE THAN ORDINARY MARKETING COPY. A Stripe Product's `description` is rendered
 * on the Checkout page, beside the amount, as the last thing a buyer reads before paying. It had
 * gone stale in every product at once after the 2026-09 tier rework: TCGScan PRO still promised "12
 * collections, 1,000 cards each, 1,000 card scans a month", michi PRO still promised "12 binders, 40
 * pages each" and invited the buyer to "Move up to VIP any time" for a tier that no longer exists,
 * and the bundle had no description at all. Describing caps a customer will not be held to is a
 * consumer-protection problem, not a tidiness one.
 *
 * ONE DESCRIPTION HAS TO SERVE TWO PURCHASES. Founder (lifetime PRO) is a PRICE on the PRO product,
 * not a product of its own, so a Founder checkout renders the PRO product's description. That is why
 * none of the copy below names a billing period: no "a month", no "a year", no "per print". Each one
 * describes the TIER, which is true whether it is bought yearly, monthly, or once forever.
 *
 * DRY RUN BY DEFAULT. Without APPLY=1 it prints the before and after for every product and writes
 * nothing. It is idempotent: a description already matching is reported and skipped.
 *
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\stripe-product-copy.ps1"
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\stripe-product-copy.ps1" -Apply
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

/**
 * Keyed by product NAME rather than id, so this file is readable and reviewable as copy. The run
 * refuses a name it cannot find rather than guessing, because writing marketing copy onto the wrong
 * product is worse than writing none.
 *
 * Every line is checked against what the apps actually ship (tcgscan-app src/lib/subscriptions.ts
 * and michi-maker src/data/subscriptions.ts), which is the only defence against this drifting again.
 */
const COPY = {
  'TCGScan Pro':
    'PRO: unlimited collections and cards, binder scanning up to 16 cards in a single shot, ' +
    'full price history, full ROI with set and series analytics, and Advanced Search. ' +
    'Card scans are unlimited on every plan, including Free.',

  'michi-maker PRO':
    'PRO: unlimited binders, unlimited pages per binder, and unlimited Slice Studio artworks, ' +
    'plus Art Similarity Fill and Search, Advanced Color Fill and Search, Value Sort and Search, ' +
    'unlimited Theme Search results, and every binder customization including covers, stitchings, ' +
    'soundtracks and stickers.',

  'TCGScan + michi-maker PRO':
    'PRO in both apps from one subscription. TCGScan: unlimited collections and cards, binder ' +
    'scanning, full price history and ROI analytics. michi-maker: unlimited binders, pages and ' +
    'Slice Studio artworks, with every search and customization PRO unlocks.',

  'Full-binder fill-sheet PDF':
    'One binder, one time: a print-ready PDF of every page as cut-ready fill sheets, true to card size.',
};

/**
 * Retired from sale and deliberately NOT rewritten. michi-maker VIP is out of the SELLABLE set, so
 * nobody can reach its checkout; its product stays active only because one subscription still
 * renews against it. Rewriting the copy under a live subscriber's renewal changes what their invoice
 * describes, for no one's benefit.
 */
const LEAVE_ALONE = ['michi-maker VIP', 'TCGScan VIP'];

console.log('');
console.log(`  key mode: ${/^(sk|rk)_live/.test(key) ? 'LIVE' : 'TEST'}${APPLY ? '        APPLY=1, THIS WILL WRITE' : '        dry run, nothing will be written'}`);
console.log('');

const products = (await stripe('GET', 'products', { limit: '100' })).data;
const byName = new Map(products.map((p) => [p.name, p]));

const missing = Object.keys(COPY).filter((n) => !byName.has(n));
if (missing.length) {
  console.log(`FAILED: no product named ${missing.join(', ')}. Nothing was written. (exit code 1)`);
  process.exitCode = 1;
}

let changed = 0;
for (const [name, description] of (process.exitCode ? [] : Object.entries(COPY))) {
  const product = byName.get(name);
  if (product.description === description) {
    console.log(`  already right   ${name}`);
    continue;
  }
  changed += 1;
  console.log(`\n  ${name}  (${product.id})`);
  console.log(`    was: ${product.description ?? '(none)'}`);
  console.log(`    now: ${description}`);
  if (APPLY) {
    await stripe('POST', `products/${product.id}`, { description });
    console.log('    written');
  }
}

for (const name of LEAVE_ALONE) {
  if (byName.has(name)) console.log(`\n  left alone      ${name} (retired from sale; a live subscription still renews against it)`);
}

console.log('');
if (!changed) {
  console.log('Every description already matches. Nothing to do.');
} else if (!APPLY) {
  console.log(`DRY RUN: ${changed} description(s) would change. Re-run with -Apply to write them.`);
} else {
  // READ IT BACK. A 200 from Stripe means the request was accepted, not that the copy a buyer will
  // see is the copy we wrote.
  const after = (await stripe('GET', 'products', { limit: '100' })).data;
  const wrong = Object.entries(COPY).filter(([n, d]) => after.find((p) => p.name === n)?.description !== d);
  if (wrong.length) {
    console.log(`FAILED: ${wrong.map(([n]) => n).join(', ')} did not take. (exit code 1)`);
    process.exitCode = 1;
  } else {
    console.log(`DONE: ${changed} description(s) updated and read back.`);
  }
}
console.log('');

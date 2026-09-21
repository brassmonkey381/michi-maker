/**
 * Tidy the live Stripe catalog after the 2026-09 tier rework: retire VIP, archive the superseded
 * prices, and prove the new ones are right.
 *
 * WHY THERE IS ANYTHING TO TIDY. `stripe-tier-rework-prices.mjs` did its job correctly: a Price is
 * IMMUTABLE, so repricing means creating a new Price and moving the lookup key onto it with
 * `transfer_lookup_key`. It deliberately left the old Price active, because deactivating a price
 * that a live subscription renews against would break that renewal. Nothing ever came back to sweep
 * the ones that turned out to have no subscribers, so the dashboard still lists every price the
 * account has ever had.
 *
 * WHAT ARCHIVING DOES. `active: false` on a Price stops it being used for NEW purchases; existing
 * subscriptions are unaffected and keep renewing. Same for a Product. Both are reversible: set
 * `active: true` again. Nothing here deletes, because Stripe only permits deleting a Product with
 * no Prices attached, and every product here has prices.
 *
 * THE SAFETY RULE, AND IT IS COMPUTED, NOT CONFIGURED. Before archiving anything this reads every
 * subscription in the account and builds the set of price ids that are actually in use. A price in
 * that set is never touched, whatever any list here says. So a subscriber who appears between the
 * writing of this file and the running of it is still protected.
 *
 * DRY RUN BY DEFAULT. Without APPLY=1 nothing is written. Run it, read the plan, then run it again
 * with APPLY=1.
 *
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\stripe-catalog-cleanup.ps1"
 *   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\stripe-catalog-cleanup.ps1" -Apply
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

/** Page through a list endpoint. 100 is the max page size and this account is far below it, but a
 *  silently truncated list here would mean a price we never checked for subscribers. */
async function all(path, params = {}) {
  const out = [];
  let starting_after;
  do {
    const page = await stripe('GET', path, { ...params, limit: '100', ...(starting_after ? { starting_after } : {}) });
    out.push(...page.data);
    starting_after = page.has_more ? page.data[page.data.length - 1].id : null;
  } while (starting_after);
  return out;
}

const money = (c) => (c == null ? '     -' : `$${(c / 100).toFixed(2)}`);
const term = (p) => (p.recurring ? `/${p.recurring.interval}` : ' once');

/**
 * THE CATALOG WE INTEND TO SELL, from tcgscan-app docs/TIER-REWORK.md (owner, 2026-09-20).
 * A lookup key here must exist, be active, and carry exactly this amount and interval.
 */
const EXPECTED = [
  { key: 'tcgscan_pro_monthly', amount: 599, interval: 'month' },
  { key: 'tcgscan_pro_yearly', amount: 4999, interval: 'year' },
  { key: 'michi_pro_monthly', amount: 599, interval: 'month' },
  { key: 'michi_pro_yearly', amount: 4999, interval: 'year' },
  { key: 'tcgscan_pro_founder', amount: 11999, interval: null },
  { key: 'michi_pro_founder', amount: 11999, interval: null },
  { key: 'bundle_pro_monthly', amount: 899, interval: 'month' },
  { key: 'bundle_pro_yearly', amount: 7499, interval: 'year' },
];

/**
 * Keys that must EXIST and be active, but whose amount this script does not police.
 *
 * The print offer is explicitly outside the tier rework ("prints are in no plan, the print offer
 * needs a complete rework, tracked separately") and is being repriced by hand while this runs: the
 * $3.99 fill-sheet became $1.99 at 19:09Z on 2026-09-21, hours after this file first pinned 399.
 * Pinning an amount nobody has settled on turns a safety gate into an obstacle, and the thing that
 * actually matters for checkout is that the lookup key resolves to a live price at all.
 */
const TRACKED = [{ key: 'michi_binder_pdf', note: 'print offer, $1.99 for now (owner, 2026-09-21), repriced separately' }];

/** Lookup keys the rework retired. Their prices are archived unless a subscription holds one. */
const RETIRED_KEYS = ['tcgscan_vip_monthly', 'tcgscan_vip_yearly', 'michi_vip_monthly', 'michi_vip_yearly'];

/** Products to archive once every price on them is archived. */
const RETIRED_PRODUCTS = ['TCGScan VIP', 'michi-maker VIP'];

console.log('');
console.log(`  key mode: ${/^(sk|rk)_live/.test(key) ? 'LIVE' : 'TEST'}${APPLY ? '        APPLY=1, THIS WILL WRITE' : '        dry run, nothing will be written'}`);
console.log('');

// ── 1. read everything, including who is subscribed to what ──────────────────────────────────
console.log('[1/5] Reading the catalog and every subscription...');
const products = await all('products');
const prices = await all('prices');
const subs = await all('subscriptions', { status: 'all' });

/** Price ids a subscription references, in ANY status. Computed, never assumed. */
const inUse = new Map();
for (const sub of subs) {
  for (const item of sub.items?.data ?? []) {
    const id = item.price?.id;
    if (!id) continue;
    if (!inUse.has(id)) inUse.set(id, []);
    inUse.get(id).push(`${sub.id} (${sub.status})`);
  }
}
const live = subs.filter((s) => ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(s.status));
console.log(`      ${products.length} products, ${prices.length} prices, ${subs.length} subscriptions (${live.length} live)`);
console.log(`      ${inUse.size} price(s) are referenced by a subscription and will never be touched`);

// ── 2. is what we intend to sell actually right? ─────────────────────────────────────────────
console.log('[2/5] Checking the prices we intend to sell...');
const byKey = new Map(prices.filter((p) => p.lookup_key).map((p) => [p.lookup_key, p]));
const wrong = [];
for (const want of EXPECTED) {
  const got = byKey.get(want.key);
  if (!got) {
    wrong.push(`${want.key}: no price carries this lookup key`);
    continue;
  }
  const okAmount = got.unit_amount === want.amount;
  const okTerm = want.interval ? got.recurring?.interval === want.interval : !got.recurring;
  if (!got.active) wrong.push(`${want.key}: the price carrying it is archived`);
  else if (!okAmount || !okTerm) {
    wrong.push(`${want.key}: expected ${money(want.amount)}${want.interval ? `/${want.interval}` : ' once'}, found ${money(got.unit_amount)}${term(got)}`);
  } else {
    console.log(`      ok   ${want.key.padEnd(22)} ${money(got.unit_amount)}${term(got)}`);
  }
}
for (const t of TRACKED) {
  const got = byKey.get(t.key);
  if (!got) wrong.push(`${t.key}: no price carries this lookup key`);
  else if (!got.active) wrong.push(`${t.key}: the price carrying it is archived`);
  else console.log(`      ok   ${t.key.padEnd(22)} ${money(got.unit_amount)}${term(got)}   (amount not pinned: ${t.note})`);
}
if (wrong.length) {
  console.log('');
  for (const w of wrong) console.log(`      WRONG  ${w}`);
  console.log('');
  console.log('FAILED: the live catalog does not match TIER-REWORK.md. Fix that before archiving anything,');
  console.log('        with scripts/stripe-tier-rework-prices.mjs. Nothing was written. (exit code 1)');
  process.exit(1);
}

// ── 3. plan ──────────────────────────────────────────────────────────────────────────────────
console.log('[3/5] Planning what to archive...');
const keepIds = new Set([...EXPECTED, ...TRACKED].map((e) => byKey.get(e.key)?.id).filter(Boolean));
const productById = new Map(products.map((p) => [p.id, p]));

const toArchive = [];
const protectedPrices = [];

for (const p of prices) {
  if (!p.active) continue;
  if (keepIds.has(p.id)) continue;

  const product = productById.get(typeof p.product === 'string' ? p.product : p.product?.id);
  const isRetiredKey = p.lookup_key && RETIRED_KEYS.includes(p.lookup_key);
  // A superseded price is one with NO lookup key at all: the rework moved every key it still
  // wanted onto a new price, so a keyless active price is one nothing can reach any more.
  const isSuperseded = !p.lookup_key;

  if (!isRetiredKey && !isSuperseded) continue;

  if (inUse.has(p.id)) {
    protectedPrices.push({ price: p, product, why: inUse.get(p.id) });
    continue;
  }
  toArchive.push({
    price: p,
    product,
    reason: isRetiredKey ? `retired tier (${p.lookup_key})` : 'superseded, no lookup key, unreachable',
  });
}

console.log('');
if (!toArchive.length) console.log('      nothing to archive; the catalog is already tidy');
for (const t of toArchive) {
  console.log(`      archive price  ${money(t.price.unit_amount)}${term(t.price).padEnd(8)} ${String(t.product?.name ?? '?').padEnd(26)} ${t.reason}`);
}

// A product is archived only when every price on it is archived or about to be.
const archivingIds = new Set(toArchive.map((t) => t.price.id));
const productsToArchive = [];
for (const prod of products) {
  if (!prod.active) continue;
  if (!RETIRED_PRODUCTS.includes(prod.name)) continue;
  const mine = prices.filter((p) => (typeof p.product === 'string' ? p.product : p.product?.id) === prod.id);
  const stillLive = mine.filter((p) => p.active && !archivingIds.has(p.id));
  if (stillLive.length) {
    console.log(`      KEEP product   ${prod.name.padEnd(26)} ${stillLive.length} price(s) stay live, so the product stays visible`);
    continue;
  }
  productsToArchive.push(prod);
  console.log(`      archive product ${prod.name}`);
}

if (protectedPrices.length) {
  console.log('');
  console.log('      LEFT ALONE, because a subscription references them:');
  for (const p of protectedPrices) {
    console.log(`        ${money(p.price.unit_amount)}${term(p.price).padEnd(8)} ${String(p.product?.name ?? '?').padEnd(26)} ${p.why.join(', ')}`);
  }
}

console.log('');
console.log(`      ${toArchive.length} price(s) and ${productsToArchive.length} product(s) to archive. Archiving is reversible (active: true).`);

// ── 4. apply ─────────────────────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log('');
  console.log('[4/5] DRY RUN, nothing written. Re-run with -Apply to commit.');
  console.log('[5/5] skipped');
  console.log('');
  process.exit(0);
}

console.log('[4/5] Archiving...');
for (const t of toArchive) {
  await stripe('POST', `prices/${t.price.id}`, { active: 'false' });
  console.log(`      archived price   ${t.price.id}  ${money(t.price.unit_amount)}${term(t.price)}`);
}
for (const prod of productsToArchive) {
  await stripe('POST', `products/${prod.id}`, { active: 'false' });
  console.log(`      archived product ${prod.id}  ${prod.name}`);
}

// ── 5. read it back ──────────────────────────────────────────────────────────────────────────
console.log('[5/5] Reading the catalog back...');
const after = await all('prices');
const afterProducts = await all('products');
const stillActive = after.filter((p) => p.active);
console.log(`      ${afterProducts.filter((p) => p.active).length} active products, ${stillActive.length} active prices`);

let bad = 0;
for (const want of [...EXPECTED, ...TRACKED]) {
  const got = stillActive.find((p) => p.lookup_key === want.key);
  if (!got) {
    console.log(`      LOST  ${want.key} is no longer active`);
    bad += 1;
  }
}
for (const t of toArchive) {
  if (after.find((p) => p.id === t.price.id)?.active) {
    console.log(`      STILL ACTIVE  ${t.price.id}`);
    bad += 1;
  }
}
for (const [id, who] of inUse) {
  if (after.find((p) => p.id === id)?.active === false) {
    console.log(`      HARMED  ${id} carries ${who.join(', ')} and is now archived`);
    bad += 1;
  }
}

console.log('');
if (bad) {
  console.log(`FAILED: ${bad} problem(s) after the write. Re-activate with active=true on the ids above. (exit code 1)`);
  process.exit(1);
}
console.log('DONE. Every intended price is live, every retired one is archived, no subscription was touched.');
console.log('');

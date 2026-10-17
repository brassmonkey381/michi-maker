/**
 * Backfill the price on the pdf_binder grants written before the webhook stamped one.
 *
 * Every full-binder PDF has sold at one list price, $1.99 (owner, 2026-10-16). The webhook has
 * stamped price_lookup_key / unit_amount_minor / currency on each new sale since dc9881c; this
 * fills the rows from before that, and ONLY those: pdf_binder products, source stripe, price
 * still NULL. Re-runnable - a second run finds nothing to do.
 *
 * Run with SUPABASE_ACCESS_TOKEN in the environment (the analytics-studio .env has it):
 *   node scripts/backfill-pdf-binder-price.mjs
 */
const PROJECT_REF = 'piikwvntldytjejxmcla';
const PRICE_MINOR = 199;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set.');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

console.log('Step 1: rows to fill');
const before = await sql(`
  select count(*)::int as n from public.entitlements
  where product like 'pdf_binder:%' and source = 'stripe' and unit_amount_minor is null;
`);
console.log(`  ${before[0].n} pdf_binder row(s) without a price`);

console.log('Step 2: fill');
const done = await sql(`
  update public.entitlements
  set price_lookup_key = coalesce(price_lookup_key, 'pdf_binder'),
      unit_amount_minor = ${PRICE_MINOR},
      currency = 'usd'
  where product like 'pdf_binder:%' and source = 'stripe' and unit_amount_minor is null
  returning user_id;
`);
console.log(`  ${done.length} row(s) set to $${(PRICE_MINOR / 100).toFixed(2)} usd`);

console.log('Step 3: verify');
const after = await sql(`
  select count(*)::int as n from public.entitlements
  where product like 'pdf_binder:%' and source = 'stripe' and unit_amount_minor is null;
`);
if (after[0].n !== 0) fail(`${after[0].n} pdf_binder row(s) still unpriced`);
console.log('OK: every pdf_binder sale now carries its price');

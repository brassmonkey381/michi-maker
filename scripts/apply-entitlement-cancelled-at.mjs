/**
 * Apply supabase/migrations/20261014120000_entitlement_cancelled_at.sql and prove it.
 *
 * The column records whether a subscription will renew (NULL = it will). Both webhooks stamp it;
 * analytics-studio reads it so the morning email stops promising a "first charge" to someone who
 * has already turned renewal off.
 *
 *   1. Apply. Re-runnable: add column if not exists.
 *   2. The column is there, timestamptz, nullable.
 *   3. Nothing else about the table changed: the eleven columns that were there still are.
 *
 * No row is written. Run through state/apply-entitlement-cancelled-at.ps1, which deploys the two
 * webhooks after this succeeds.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261014120000_entitlement_cancelled_at.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

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

const step = (n, what) => console.log(`Step ${n}: ${what}`);

step(1, 'applying the migration');
await sql(readFileSync(MIGRATION, 'utf8'));
console.log('  applied');

step(2, 'checking the column');
const cols = await sql(`
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'entitlements'
  order by column_name;
`);
const col = cols.find((c) => c.column_name === 'cancelled_at');
if (!col) fail(`cancelled_at is missing (got: ${cols.map((c) => c.column_name).join(', ')})`);
if (col.data_type !== 'timestamp with time zone') fail(`cancelled_at is ${col.data_type}, expected timestamptz`);
if (col.is_nullable !== 'YES') fail('cancelled_at must be nullable: NULL is how "will renew" is spelled');
console.log('  cancelled_at timestamptz, nullable');

step(3, 'checking nothing else moved');
const want = [
  'currency', 'expires_at', 'granted_at', 'interval', 'period_start', 'price_lookup_key',
  'product', 'source', 'term_print_allocation', 'unit_amount_minor', 'user_id',
];
const got = cols.map((c) => c.column_name);
for (const c of want) if (!got.includes(c)) fail(`column ${c} is missing`);
console.log(`  ${got.length} columns; the ${want.length} that were there still are`);

const [{ n }] = await sql(`select count(*)::int as n from public.entitlements where cancelled_at is not null;`);
console.log(`  ${n} row(s) marked cancelled so far (expected 0 until a webhook fires)`);
console.log('OK: migration applied and verified');

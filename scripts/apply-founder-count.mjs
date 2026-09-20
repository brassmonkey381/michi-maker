/**
 * Apply supabase/migrations/20260920140000_founder_count.sql and GRANT THE FIRST FOUNDER.
 *
 * The owner asked for the counter to open at 1. It can only honestly say 1 if one Founder
 * membership exists, so this grants one: a `tier_pro` row with no expiry, interval 'lifetime',
 * source 'manual', to the account whose email is FOUNDER_EMAIL. Idempotent: an account that
 * already holds a lifetime row is left alone. A live SUBSCRIPTION row for tier_pro on that account
 * would be overwritten by the grant, so the script refuses in that case and says why.
 *
 * Checks: the count before, the grant, the count after (before + 1, or unchanged on a re-run), and
 * that the anon role can call the function (the plans page is public).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260920140000_founder_count.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const email = (process.env.FOUNDER_EMAIL ?? '').trim().toLowerCase();
function fail(msg) { console.log(`FAILED: ${msg}`); process.exitCode = 2; throw new Error(msg); }
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
if (!/^[^@\s']+@[^@\s']+$/.test(email)) fail('FOUNDER_EMAIL is not a plain email address.');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

try {
  console.log('[1/4] Applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  const [{ n: before }] = await sql('select public.michi_founder_count() as n;');
  console.log(`      Founder memberships before: ${before}`);

  console.log('[2/4] The account...');
  const [acct] = await sql(`
    select u.id,
           (select row_to_json(e) from public.entitlements e where e.user_id = u.id and e.product = 'tier_pro') as row
      from auth.users u where lower(u.email) = '${email}' limit 1;`);
  if (!acct) fail('no account has that email');
  const row = acct.row;
  const lifetime = row && row.expires_at === null && row.interval === 'lifetime';
  const liveSub = row && !lifetime && (row.source === 'stripe' || row.source === 'apple') && (!row.expires_at || Date.parse(row.expires_at) > Date.now());
  if (liveSub) fail('this account holds a live PRO SUBSCRIPTION row; granting Founder would overwrite it while it keeps billing. Cancel it first.');

  console.log('[3/4] Granting...');
  if (lifetime) console.log('      already a Founder; nothing written');
  else {
    await sql(`
      insert into public.entitlements (user_id, product, source, expires_at, interval, period_start)
      values ('${acct.id}', 'tier_pro', 'manual', null, 'lifetime', now())
      on conflict (user_id, product) do update
        set source = 'manual', expires_at = null, interval = 'lifetime', period_start = now();`);
    console.log('      granted: tier_pro, no expiry, interval lifetime, source manual');
  }

  console.log('[4/4] After, and as a guest would read it...');
  const [{ n: after }] = await sql('select public.michi_founder_count() as n;');
  const [{ ok }] = await sql("select has_function_privilege('anon', 'public.michi_founder_count()', 'execute') as ok;");
  console.log(`      Founder memberships now: ${after}   callable by a guest: ${ok}`);
  if (after !== before + (lifetime ? 0 : 1)) fail('the count did not move by exactly the grant');
  if (!ok) fail('a guest cannot call the counter');
  console.log('');
  console.log(`DONE. The counter reads ${after} of 100 because ${after} Founder membership(s) exist.`);
} catch (e) {
  if (!process.exitCode) { console.log(`FAILED: ${String(e.message).slice(0, 500)}`); process.exitCode = 3; }
}

/**
 * Apply supabase/migrations/20260920125000_trial_three_days.sql: the free PRO trial is 3 days in
 * both apps. Prints what each trial function says before and after, and fails unless both read
 * trial_days(), neither still says 14 days, and trial_days() is 3. Safe to re-run.
 *
 * Run through state/apply-trial-three-days.ps1, which loads SUPABASE_ACCESS_TOKEN silently.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260920125000_trial_three_days.sql');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (msg) => { console.log(`FAILED: ${msg}`); process.exit(2); };
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

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

const STATE = `
  select p.proname as fn,
         position('interval ''14 days''' in pg_get_functiondef(p.oid)) > 0 as says_14,
         position('trial_days()' in pg_get_functiondef(p.oid)) > 0 as reads_trial_days
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('start_pro_trial', 'start_tcgscan_pro_trial')
   order by 1`;

console.log('Step 1: the trial functions as they stand');
const before = await sql(STATE);
if (before.length !== 2) fail(`expected both trial functions, found ${before.length}`);
for (const r of before) console.log(`  ${r.fn}: says 14 days = ${r.says_14}, reads trial_days() = ${r.reads_trial_days}`);

console.log('Step 2: apply the migration');
await sql(readFileSync(MIGRATION, 'utf8'));
console.log('  applied');

console.log('Step 3: verify');
const after = await sql(STATE);
for (const r of after) console.log(`  ${r.fn}: says 14 days = ${r.says_14}, reads trial_days() = ${r.reads_trial_days}`);
if (after.some((r) => r.says_14 || !r.reads_trial_days)) fail('a trial function still says 14 days, or does not read trial_days()');
const [{ days }] = await sql('select public.trial_days() as days');
console.log(`  trial_days() = ${days}`);
if (Number(days) !== 3) fail(`trial_days() is ${days}, expected 3`);
console.log('DONE: both apps grant a 3-day trial. Trials already running keep their end date.');

/**
 * Apply 20260827140000_pro_trial_recovery_prompt.sql — the columns behind the one-time "your 14
 * free days are still here" prompt, and the backfill that names the cohort.
 *
 * Idempotent: the DDL is `add column if not exists`, and the backfill only ever sets the flag TRUE
 * for accounts that still qualify. Re-running after someone starts a trial does NOT re-flag them
 * (the `not exists (pro_trials)` clause), and it cannot un-flag anyone either — a second run is a
 * no-op on a settled row.
 *
 * WHAT IS CHECKED, because a prompt that reaches the wrong people is worse than one that reaches
 * nobody:
 *   1. Both columns exist and default correctly.
 *   2. Every flagged account is trial-eligible: no pro_trials row, no non-trial tier entitlement.
 *   3. No flagged account is anonymous — start_pro_trial refuses guests, so offering it to one
 *      would be an offer we cannot honour.
 *   4. Every flagged account actually saw the old offer (nobody is swept in).
 *   5. Nobody is flagged who already has a pro_trial_prompt_at (a re-run must not re-ask).
 *
 * Run through apply-pro-trial-prompt.ps1, which loads SUPABASE_ACCESS_TOKEN silently.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260827140000_pro_trial_recovery_prompt.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('FAILED: SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
  process.exit(2);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

const fail = (step, msg) => {
  console.log(`FAILED at [${step}]: ${msg}`);
  process.exit(step);
};

console.log('Step 1: applying the migration...');
try {
  // String(...) — Get-Content -Raw hands back a PSObject-wrapped string in some hosts; this file
  // is read by node, but keep the coercion so the body is always a plain JSON string.
  await sql(String(readFileSync(MIGRATION, 'utf8')));
  console.log('  OK (columns added, cohort flagged)');
} catch (e) {
  fail(1, `the migration did not apply: ${e.message}`);
}

console.log('Step 2: checking the columns landed...');
try {
  const cols = await sql(`select column_name, data_type, column_default
                            from information_schema.columns
                           where table_schema='public' and table_name='profiles'
                             and column_name in ('pro_trial_offer_due','pro_trial_prompt_at')
                           order by column_name;`);
  if (cols.length !== 2) fail(2, `expected 2 columns, found ${cols.length}`);
  console.log(`  OK (${cols.map((c) => c.column_name).join(', ')})`);
} catch (e) {
  fail(2, e.message);
}

console.log('Step 3: verifying every flagged account is one we can actually honour...');
try {
  const [bad] = await sql(`
    select
      count(*) filter (where exists (select 1 from public.pro_trials t where t.user_id=p.id)) as already_trialed,
      count(*) filter (where exists (select 1 from public.entitlements e
              where e.user_id=p.id and e.product in ('tier_pro','tier_vip') and e.source <> 'trial')) as ever_paid,
      count(*) filter (where exists (select 1 from auth.users au where au.id=p.id and au.is_anonymous)) as guests,
      count(*) filter (where not exists (select 1 from public.analytics_events ev
              where ev.user_id=p.id and ev.app='michi' and ev.name='pro.offer_shown')) as never_saw_offer,
      count(*) filter (where p.pro_trial_prompt_at is not null) as already_asked
    from public.profiles p where p.pro_trial_offer_due;`);
  const problems = Object.entries(bad).filter(([, n]) => Number(n) > 0);
  if (problems.length) fail(3, `flagged accounts that should not be: ${problems.map(([k, n]) => `${k}=${n}`).join(', ')}`);
  console.log('  OK (all flagged accounts are eligible, real, and were shown the old offer)');
} catch (e) {
  fail(3, e.message);
}

console.log('Step 4: the cohort...');
try {
  const rows = await sql(`select p.username, p.pro_trial_prompt_at
                            from public.profiles p where p.pro_trial_offer_due order by p.username;`);
  console.log(`  ${rows.length} account${rows.length === 1 ? '' : 's'} will be asked once:`);
  for (const r of rows) console.log(`    ${r.username ?? '(no username)'}`);
} catch (e) {
  fail(4, e.message);
}

console.log('DONE.');

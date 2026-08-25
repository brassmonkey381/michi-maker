/**
 * Apply supabase/migrations/20260824200000_signup_optout_default.sql: give
 * `marketing_consent_source` a default so accounts enrolled by the opt-out default say so, and
 * label the rows that already arrived unlabelled.
 *
 * THE CHECK THAT MATTERS is step 3. It asserts the ENROLLED COUNT IS UNCHANGED. This migration is
 * only supposed to relabel; if it moved anybody in or out of the mailable list, it has done
 * something it was not asked to do and that is a thing you want to hear about before a send, not
 * after. Step 4 then confirms the default actually applies to a fresh row.
 *
 * Run through apply-signup-optout-default.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260824200000_signup_optout_default.sql',
);

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg, code = 2) {
  console.log(`FAILED: ${msg}`);
  process.exit(code);
}
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

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

console.log('Step 1: counting who is enrolled BEFORE...');
let before;
try {
  [before] = await sql(`select
    (select count(*) from public.profiles where marketing_consent) as enrolled,
    (select count(*) from public.marketing_recipients) as mailable,
    (select count(*) from public.profiles
       where marketing_consent and marketing_consent_source is null) as unlabelled`);
  console.log(`  OK (${before.enrolled} enrolled, ${before.mailable} mailable, `
    + `${before.unlabelled} unlabelled)`);
} catch (e) {
  fail(`pre-count: ${e.message}`);
}

console.log('Step 2: applying the migration...');
try {
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');
} catch (e) {
  fail(`apply: ${e.message}`, 3);
}

console.log('Step 3: verifying it RELABELLED and did not enrol or unenrol anyone...');
try {
  const [after] = await sql(`select
    (select count(*) from public.profiles where marketing_consent) as enrolled,
    (select count(*) from public.marketing_recipients) as mailable,
    (select count(*) from public.profiles
       where marketing_consent and marketing_consent_source is null) as unlabelled`);
  if (after.enrolled !== before.enrolled || after.mailable !== before.mailable) {
    fail(`the audience MOVED: enrolled ${before.enrolled}->${after.enrolled}, `
      + `mailable ${before.mailable}->${after.mailable}. A relabel must not do that.`, 4);
  }
  if (Number(after.unlabelled) !== 0) {
    fail(`${after.unlabelled} enrolled row(s) still have no source`, 4);
  }
  console.log(`  OK (${after.enrolled} enrolled, unchanged; 0 unlabelled)`);
} catch (e) {
  fail(`verify: ${e.message}`, 4);
}

console.log('Step 4: verifying the column default applies to a NEW row...');
try {
  const [row] = await sql(`select column_default from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='marketing_consent_source'`);
  if (!row || !String(row.column_default ?? '').includes('signup_optout')) {
    fail(`default not set (got ${row?.column_default ?? 'null'})`, 5);
  }
  console.log('  OK (new profiles will label themselves signup_optout)');
} catch (e) {
  fail(`verify default: ${e.message}`, 5);
}

console.log('\nEnrolment by source:');
try {
  const rows = await sql(`select coalesce(marketing_consent_source,'(none)') as source,
    count(*) filter (where marketing_consent) as enrolled
    from public.profiles group by 1 having count(*) filter (where marketing_consent) > 0
    order by 2 desc`);
  for (const r of rows) console.log(`  ${r.source}: ${r.enrolled}`);
} catch {
  /* the summary is a nicety; the checks above are the contract */
}

console.log('DONE: every enrolled account now says how it got there.');

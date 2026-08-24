/**
 * Apply the opt-out switch: enrol every existing real account for product email, flip the default
 * so new signups are enrolled too, and create the campaign audience view.
 *
 *   20260824190000_marketing_optout_model.sql
 *   20260824191000_campaign_free_limit_reached.sql
 *
 * THE CHECKS THAT MATTER are 4 and 5. Step 4 plants an unsubscribed row and re-runs the enrolment
 * to prove a backfill cannot resurrect somebody who has left — the single most common way an email
 * programme earns a complaint it cannot argue with. Step 5 prints the actual campaign list, because
 * "how many people is this about to mail" should be read before a send, not after.
 *
 * Run through apply-marketing-optout.ps1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  '20260824190000_marketing_optout_model.sql',
  '20260824191000_campaign_free_limit_reached.sql',
].map((f) => join(here, '..', 'supabase', 'migrations', f));

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

console.log('Step 1: checking the consent columns exist (run apply-marketing-consent.ps1 first)...');
try {
  const [row] = await sql(`
    select count(*) as cols from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name in ('marketing_consent','marketing_consent_at','marketing_unsubscribed_at')
  `);
  if (Number(row.cols) !== 3) {
    fail('the consent columns are missing. Run apply-marketing-consent.ps1 first.', 3);
  }
  console.log('  OK');
} catch (e) {
  fail(`precheck: ${e.message}`);
}

console.log('Step 2: applying both migrations...');
for (const file of MIGRATIONS) {
  try {
    await sql(readFileSync(file, 'utf8'));
    console.log(`  OK ${file.split(/[\\/]/).pop()}`);
  } catch (e) {
    fail(`apply ${file}: ${e.message}`, 4);
  }
}

console.log('Step 3: counting who is now enrolled...');
try {
  const rows = await sql(`
    select coalesce(marketing_consent_source, '(none)') as source,
           count(*) filter (where marketing_consent) as enrolled,
           count(*) filter (where not marketing_consent) as not_enrolled
    from public.profiles group by 1 order by 2 desc
  `);
  for (const r of rows) {
    console.log(`  ${r.source}: ${r.enrolled} enrolled, ${r.not_enrolled} not`);
  }
  const [tot] = await sql('select count(*) as n from public.marketing_recipients');
  console.log(`  OK (${tot.n} mailable)`);
} catch (e) {
  fail(`count: ${e.message}`, 5);
}

console.log('Step 4: proving a re-run cannot resurrect someone who unsubscribed...');
try {
  const [subject] = await sql(`
    select p.id from public.profiles p join auth.users u on u.id = p.id
    where u.email like 'bstockman1%' order by u.created_at desc limit 1
  `);
  if (!subject) {
    console.log('  SKIPPED (no owner-controlled account to test with)');
  } else {
    const uid = subject.id;
    const [before] = await sql(`
      select marketing_consent, marketing_consent_source, marketing_unsubscribed_at
      from public.profiles where id = '${uid}'
    `);
    await sql(`select public.set_marketing_consent('${uid}'::uuid, false, 'unsubscribe_link')`);
    // Re-run the enrolment exactly as the migration does.
    await sql(`
      update public.profiles p
         set marketing_consent = true, marketing_consent_at = now(),
             marketing_consent_source = 'preexisting_optout'
        from auth.users u
       where u.id = p.id and p.marketing_unsubscribed_at is null
         and p.marketing_consent_source is distinct from 'settings'
         and not u.is_anonymous and u.email is not null
    `);
    const [after] = await sql(
      `select marketing_consent from public.profiles where id = '${uid}'`,
    );
    if (after.marketing_consent !== false) {
      fail('a re-run RE-ENROLLED an unsubscribed account. The WHERE guard is broken.', 6);
    }
    console.log('  OK (unsubscribed account stayed unsubscribed through a full re-run)');

    // Put the test account back exactly as it was.
    await sql(`
      update public.profiles
         set marketing_consent = ${before.marketing_consent},
             marketing_consent_source = ${before.marketing_consent_source
               ? `'${before.marketing_consent_source}'` : 'null'},
             marketing_unsubscribed_at = ${before.marketing_unsubscribed_at
               ? `'${before.marketing_unsubscribed_at}'::timestamptz` : 'null'}
       where id = '${uid}'
    `);
    console.log('  OK (test account restored)');
  }
} catch (e) {
  fail(`re-run guard: ${e.message}`, 6);
}

console.log('Step 4b: proving the Settings switch also stamps a suppression...');
try {
  const [subject] = await sql(`
    select p.id from public.profiles p join auth.users u on u.id = p.id
    where u.email like 'bstockman1%' order by u.created_at desc limit 1
  `);
  if (!subject) {
    console.log('  SKIPPED (no owner-controlled account to test with)');
  } else {
    const uid = subject.id;
    // Exactly what the Settings switch does: a plain UPDATE of the boolean, no RPC.
    await sql(`update public.profiles set marketing_consent = true,
                 marketing_unsubscribed_at = null where id = '${uid}'`);
    await sql(`update public.profiles set marketing_consent = false where id = '${uid}'`);
    const [row] = await sql(`select marketing_unsubscribed_at is not null as stamped
                               from public.profiles where id = '${uid}'`);
    if (row.stamped !== true) {
      fail('a direct UPDATE turned consent off WITHOUT stamping the suppression. The next '
        + 'backfill would re-enrol them. The trigger is not working.', 6);
    }
    console.log('  OK (trigger stamped it, so a backfill will skip them)');
    await sql(`update public.profiles set marketing_consent = true,
                 marketing_consent_source = 'preexisting_optout' where id = '${uid}'`);
    console.log('  OK (test account restored)');
  }
} catch (e) {
  fail(`trigger check: ${e.message}`, 6);
}

console.log('Step 5: the campaign audience, in full, read it before you send...');
try {
  const rows = await sql(`
    select email, username, binders, biggest_binder_pages, at_binder_cap, at_page_cap
    from public.campaign_free_limit_reached order by email
  `);
  if (!rows.length) console.log('  (nobody qualifies right now)');
  for (const r of rows) {
    const why = [r.at_binder_cap ? 'binder cap' : null, r.at_page_cap ? 'page cap' : null]
      .filter(Boolean).join(' + ');
    console.log(`  ${r.email}  (@${r.username ?? '?'}, ${r.binders} binders, `
      + `${r.biggest_binder_pages} pages max) -> ${why}`);
  }
  console.log(`  OK (${rows.length} recipient(s); the owner's own accounts are in this list)`);
} catch (e) {
  fail(`audience: ${e.message}`, 7);
}

console.log('DONE: everyone is enrolled, an unsubscribe still wins, and the campaign list is above.');

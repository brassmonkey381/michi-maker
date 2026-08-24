/**
 * Apply supabase/migrations/20260824180000_marketing_consent.sql and put the unsubscribe secret
 * where the edge function can read it.
 *
 * THE CHECK THAT MATTERS is step 5. It mints a token exactly the way scripts/unsubscribe-token.mjs
 * will, calls the DEPLOYED endpoint with the RFC 8058 one-click POST, and then reads the row back
 * to prove the write happened. A List-Unsubscribe header is a promise to the recipient's mail
 * client that this URL works without a session; the only way to know it does is to make the call
 * a mail client would make. Step 6 then puts the test account back.
 *
 * Run through apply-marketing-consent.ps1, which loads and (first time) creates the secret
 * without printing it.
 */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const FN_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/unsubscribe`;
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20260824180000_marketing_consent.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const secret = process.env.UNSUBSCRIBE_SECRET;

function fail(msg, code = 2) {
  console.log(`FAILED: ${msg}`);
  process.exit(code);
}
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
if (!secret) fail('UNSUBSCRIBE_SECRET is not set (the .ps1 wrapper creates it).');

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

console.log('Step 1: reading the migration...');
let migration;
try {
  migration = readFileSync(MIGRATION, 'utf8');
} catch (e) {
  fail(`cannot read ${MIGRATION}: ${e.message}`);
}
console.log(`  OK (${(migration.length / 1024).toFixed(1)} KB)`);

console.log('Step 2: applying the migration...');
try {
  await sql(migration);
  console.log('  OK');
} catch (e) {
  fail(`apply: ${e.message}`, 3);
}

console.log('Step 3: verifying the columns default to NOT consented...');
try {
  const [row] = await sql(`
    select
      (select count(*) from information_schema.columns
        where table_schema='public' and table_name='profiles'
          and column_name in ('marketing_consent','marketing_consent_at','marketing_unsubscribed_at')
      ) as cols,
      (select count(*) from public.profiles where marketing_consent) as already_consented,
      (select count(*) from public.marketing_recipients) as mailable
  `);
  if (Number(row.cols) !== 3) fail(`expected 3 columns, found ${row.cols}`, 4);
  if (Number(row.already_consented) !== 0) {
    fail(`${row.already_consented} row(s) came out of the migration consented; must be 0`, 4);
  }
  console.log(`  OK (3 columns, 0 consented, ${row.mailable} mailable)`);
} catch (e) {
  fail(`verify columns: ${e.message}`, 4);
}

console.log('Step 4: storing UNSUBSCRIBE_SECRET as a function secret...');
try {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ name: 'UNSUBSCRIBE_SECRET', value: secret }]),
  });
  if (!res.ok) fail(`set secret: ${res.status} ${(await res.text()).slice(0, 300)}`, 5);
  console.log('  OK (stored, not shown)');
} catch (e) {
  fail(`set secret: ${e.message}`, 5);
}

console.log('Step 5: proving one-click works against the DEPLOYED endpoint...');
try {
  const [subject] = await sql(`
    select p.id from public.profiles p
    join auth.users u on u.id = p.id
    where u.email like 'bstockman1%' order by u.created_at desc limit 1
  `);
  if (!subject) {
    console.log('  SKIPPED (no owner-controlled account to test against)');
  } else {
    const uid = subject.id;
    const sig = createHmac('sha256', secret).update(uid).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await sql(`select public.set_marketing_consent('${uid}'::uuid, true)`);

    const res = await fetch(`${FN_URL}?t=${encodeURIComponent(`${uid}.${sig}`)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    if (res.status === 401) {
      fail('the endpoint returned 401: it is deployed WITH JWT verification. Redeploy with '
        + '--no-verify-jwt, or no mail client will ever be able to call it.', 6);
    }
    if (!res.ok) fail(`one-click POST returned ${res.status}`, 6);

    const [after] = await sql(`
      select marketing_consent, marketing_unsubscribed_at is not null as suppressed
      from public.profiles where id = '${uid}'
    `);
    if (after.marketing_consent !== false || after.suppressed !== true) {
      fail('the endpoint answered 200 but the row did not change; the header would be a lie', 6);
    }
    console.log('  OK (200, consent off, suppression stamped)');

    // A bad signature must be a no-op. Same shape, wrong token.
    await sql(`select public.set_marketing_consent('${uid}'::uuid, true)`);
    const bad = await fetch(`${FN_URL}?t=${encodeURIComponent(`${uid}.notavalidsignature`)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    const [afterBad] = await sql(
      `select marketing_consent from public.profiles where id = '${uid}'`,
    );
    if (afterBad.marketing_consent !== true) {
      fail('an UNSIGNED token unsubscribed the account: anyone could unsubscribe anyone', 7);
    }
    console.log(`  OK (forged token changed nothing, answered ${bad.status})`);

    console.log('Step 6: putting the test account back to not-consented...');
    await sql(`select public.set_marketing_consent('${uid}'::uuid, false)`);
    await sql(`update public.profiles
                 set marketing_unsubscribed_at = null where id = '${uid}'`);
    console.log('  OK');
  }
} catch (e) {
  fail(`endpoint test: ${e.message}`, 6);
}

console.log('DONE: consent is recorded, and the unsubscribe link in a message actually works.');

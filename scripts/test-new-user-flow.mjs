/**
 * End-to-end test of the NEW USER sharing flow, against the live backend.
 *
 * WHY THIS EXISTS. The sharing model (2026-08-26) spans a pure rule, three client surfaces and
 * five server guards, and the parts that can hurt someone are all server-side: a binder that
 * defaults public when it should not, a takedown an owner can reverse, a strikes ledger anyone
 * can poison. Unit tests pin the rule; this pins the SYSTEM, by driving a throwaway account
 * through the real API with the real RLS in force.
 *
 * WHAT IT IS NOT: a UI test. It asserts the state the UI reads (is the prompt due, is the binder
 * public) rather than that a modal appeared. Pair it with scripts/test-new-user-ui.mjs.
 *
 * The account is created through the Auth admin API, used, and DELETED at the end, including on
 * failure. Re-runnable: each run makes its own user, and a leftover from a crashed run is swept
 * by the prefix match in cleanup().
 *
 * Run through test-new-user-flow.ps1 (loads the secrets silently, never echoes them).
 */
import { readFileSync } from 'node:fs';

const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
const ENV = 'C:/Users/Brian/source/repos/tcgscan/michi-maker/.env';
const EMAIL_PREFIX = 'michi-flowtest-';

/** Parse KEY=VALUE files by splitting on the FIRST '=', so base64-ish values survive intact. */
function loadKV(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const secrets = loadKV(SECRETS);
const env = loadKV(ENV);
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = secrets.APP_SECRET_KEY;
const MGMT = secrets.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = URL_BASE?.match(/https:\/\/([^.]+)\./)?.[1];

let failures = 0;
let testUserId = null;

const ok = (name) => console.log(`  PASS  ${name}`);
function bad(name, detail) {
  failures += 1;
  console.log(`  FAIL  ${name}`);
  if (detail) console.log(`        ${String(detail).slice(0, 300)}`);
}
function check(name, cond, detail) {
  if (cond) ok(name);
  else bad(name, detail);
}

async function api(path, { method = 'GET', token, body, headers = {}, key = ANON } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, ok: res.ok, json, text };
}

/** SQL through the management API: the postgres role, so it bypasses RLS (our stand-in admin). */
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : [];
}

const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;

/** The shipped cadence rule, restated so the harness asserts the same thing the app computes. */
function rightsPromptDue(p, now = Date.now()) {
  if (!p) return false;
  if (p.rights_attested_at) return false;
  if (!p.rights_prompt_at) return true;
  const last = Date.parse(p.rights_prompt_at);
  return Number.isNaN(last) || now - last >= 7 * DAY;
}

async function cleanup() {
  // Sweep this run's user AND any orphan from a crashed run.
  try {
    const rows = await sql(
      `select id from auth.users where email like '${EMAIL_PREFIX}%';`,
    );
    for (const r of rows) {
      await api(`/auth/v1/admin/users/${r.id}`, { method: 'DELETE', key: SERVICE });
    }
    if (rows.length) console.log(`\nCleaned up ${rows.length} test account(s).`);
  } catch (e) {
    console.log('\nCleanup warning:', String(e.message).slice(0, 200));
  }
}

async function main() {
  if (!URL_BASE || !ANON || !SERVICE || !MGMT) {
    console.log('FAILED: missing url/keys (check .env and tcgscan.secrets)');
    process.exit(2);
  }

  console.log('Step 0: sweeping any leftover test accounts...');
  await cleanup();

  // --- create the throwaway account -----------------------------------------
  console.log('\nStep 1: create a fresh account (admin API, example.com is undeliverable)');
  const email = `${EMAIL_PREFIX}${Date.now()}@example.com`;
  const password = `t_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const made = await api('/auth/v1/admin/users', {
    method: 'POST', key: SERVICE,
    body: { email, password, email_confirm: true },
  });
  if (!made.ok) { bad('create account', made.text); return; }
  testUserId = made.json.id;
  ok(`account created (${testUserId.slice(0, 8)})`);

  const signIn = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password },
  });
  if (!signIn.ok) { bad('sign in', signIn.text); return; }
  const jwt = signIn.json.access_token;
  ok('signed in, session acquired');

  const readProfile = async () => {
    const r = await api(`/rest/v1/profiles?id=eq.${testUserId}&select=*`, { token: jwt });
    return r.json?.[0] ?? null;
  };

  // --- the new-user state ----------------------------------------------------
  console.log('\nStep 2: the state a brand new account starts in');
  let profile = await readProfile();
  check('profile row auto-created by handle_new_user', !!profile, JSON.stringify(profile));
  check('rights_attested_at starts null', profile?.rights_attested_at === null);
  check('rights_prompt_at starts null', profile?.rights_prompt_at === null);
  check('profile is public by default', profile?.is_public === true);
  check('PROMPT IS DUE on the first binder', rightsPromptDue(profile) === true);

  // --- binder before attestation --------------------------------------------
  console.log('\nStep 3: a binder made BEFORE accepting the attestation');
  const mk = async (title, isPublic) => {
    const r = await api('/rest/v1/binders', {
      method: 'POST', token: jwt,
      headers: { Prefer: 'return=representation' },
      body: { title, layout_style: 'freeform', is_public: isPublic },
    });
    return r.json?.[0] ?? null;
  };
  // The client computes the default; the harness asserts the rule it must compute (false here).
  const attestedAt = profile?.rights_attested_at ?? null;
  const defaultPublicBefore = !!attestedAt;
  check('default-public rule says PRIVATE before attestation', defaultPublicBefore === false);
  const b1 = await mk('flowtest before', defaultPublicBefore);
  check('binder created', !!b1, JSON.stringify(b1));
  check('binder is PRIVATE', b1?.is_public === false);
  check('binder is not taken down', b1?.removed_at === null);

  // --- the prompt cadence ----------------------------------------------------
  console.log('\nStep 4: the prompt cadence (shown once, then every 7 days)');
  await api(`/rest/v1/profiles?id=eq.${testUserId}`, {
    method: 'PATCH', token: jwt, body: { rights_prompt_at: new Date().toISOString() },
  });
  profile = await readProfile();
  check('showing the prompt records rights_prompt_at', !!profile?.rights_prompt_at);
  check('NOT due again immediately (no spam)', rightsPromptDue(profile) === false);
  check('NOT due at 3 days', rightsPromptDue({ ...profile, rights_prompt_at: isoAgo(3 * DAY) }) === false);
  check('NOT due at 6 days 23h', rightsPromptDue({ ...profile, rights_prompt_at: isoAgo(7 * DAY - 3600e3) }) === false);
  check('DUE again at 7 days + 1m', rightsPromptDue({ ...profile, rights_prompt_at: isoAgo(7 * DAY + 60e3) }) === true);

  // --- accepting -------------------------------------------------------------
  console.log('\nStep 5: accepting the attestation');
  await api(`/rest/v1/profiles?id=eq.${testUserId}`, {
    method: 'PATCH', token: jwt, body: { rights_attested_at: new Date().toISOString() },
  });
  profile = await readProfile();
  check('rights_attested_at persisted on the account', !!profile?.rights_attested_at);
  check('NEVER prompted again once accepted', rightsPromptDue(profile) === false);
  check('...even with a stale prompt stamp', rightsPromptDue({ ...profile, rights_prompt_at: isoAgo(90 * DAY) }) === false);

  console.log('\nStep 6: a binder made AFTER accepting');
  const defaultPublicAfter = !!profile?.rights_attested_at;
  check('default-public rule says PUBLIC after attestation', defaultPublicAfter === true);
  const b2 = await mk('flowtest after', defaultPublicAfter);
  check('binder is PUBLIC on creation', b2?.is_public === true);
  check('earlier binder was NOT retroactively published', (await api(
    `/rest/v1/binders?id=eq.${b1.id}&select=is_public`, { token: jwt },
  )).json?.[0]?.is_public === false);

  // --- what a stranger sees --------------------------------------------------
  console.log('\nStep 7: what a signed-out visitor can see');
  const anonSees = async (path) => (await api(path)).json;
  const pubBinder = await anonSees(`/rest/v1/binders?id=eq.${b2.id}&select=id,title`);
  check('anon CAN read the public binder', Array.isArray(pubBinder) && pubBinder.length === 1, JSON.stringify(pubBinder));
  const privBinder = await anonSees(`/rest/v1/binders?id=eq.${b1.id}&select=id`);
  check('anon CANNOT read the private binder', Array.isArray(privBinder) && privBinder.length === 0);
  const pubProfile = await anonSees(`/rest/v1/profiles?id=eq.${testUserId}&select=id,username,bio,avatar_url`);
  check('anon CAN read a public profile (public columns)', Array.isArray(pubProfile) && pubProfile.length === 1, JSON.stringify(pubProfile));
  const marketing = await api(`/rest/v1/profiles?id=eq.${testUserId}&select=marketing_consent`);
  check('anon CANNOT read marketing columns', marketing.status >= 400, `status ${marketing.status}`);

  console.log('\nStep 8: a PRIVATE profile is actually private');
  await api(`/rest/v1/profiles?id=eq.${testUserId}`, { method: 'PATCH', token: jwt, body: { is_public: false } });
  const hidden = await anonSees(`/rest/v1/profiles?id=eq.${testUserId}&select=id`);
  check('anon CANNOT read a private profile', Array.isArray(hidden) && hidden.length === 0);
  const hiddenBinder = await anonSees(`/rest/v1/binders?id=eq.${b2.id}&select=id`);
  check('a private profile hides its public binders too', Array.isArray(hiddenBinder) && hiddenBinder.length === 0);
  const ownStill = await api(`/rest/v1/profiles?id=eq.${testUserId}&select=id`, { token: jwt });
  check('the OWNER still reads their own private profile', ownStill.json?.length === 1);
  await api(`/rest/v1/profiles?id=eq.${testUserId}`, { method: 'PATCH', token: jwt, body: { is_public: true } });

  // --- the guards ------------------------------------------------------------
  console.log('\nStep 9: the moderation guards hold against the owner');
  await sql(`update public.binders set removed_at = now() where id = '${b2.id}';`);
  const gone = await anonSees(`/rest/v1/binders?id=eq.${b2.id}&select=id`);
  check('a taken-down binder disappears from public reads', Array.isArray(gone) && gone.length === 0);
  const unremove = await api(`/rest/v1/binders?id=eq.${b2.id}`, {
    method: 'PATCH', token: jwt, body: { removed_at: null },
  });
  check('the OWNER CANNOT reverse a takedown', unremove.status >= 400, `status ${unremove.status}`);
  const stillGone = (await sql(`select removed_at is not null as still from public.binders where id='${b2.id}';`))[0];
  check('...and removed_at really did not move', stillGone?.still === true);
  const renameOk = await api(`/rest/v1/binders?id=eq.${b2.id}`, {
    method: 'PATCH', token: jwt, body: { title: 'flowtest renamed' },
  });
  check('the owner CAN still edit their own binder otherwise', renameOk.status < 400, `status ${renameOk.status}`);
  await sql(`update public.binders set removed_at = null where id = '${b2.id}';`);

  console.log('\nStep 10: reporting works, and the strikes ledger cannot be poisoned');
  // NO `Prefer: return=representation` anywhere here. A representation makes PostgREST do
  // INSERT ... RETURNING, and a reporter has no SELECT policy on content_reports (only admins
  // read them), so the read-back is refused and every insert looks like it failed. That is what
  // the app does too (reportRepo inserts and ignores the row), and it is why the rows below are
  // verified through the management SQL instead: a negative assertion that cannot tell "refused
  // by the check I wrote" from "refused by something else" proves nothing.
  const reportsFor = async (binderId) => sql(
    `select status, subject_owner_id, notified_at from public.content_reports
       where binder_id = '${binderId}' order by created_at desc;`,
  );

  const honest = await api('/rest/v1/content_reports', {
    method: 'POST', token: jwt,
    body: { binder_id: b1.id, reason: 'copyright', details: 'flowtest' },
  });
  check('an honest report files fine', honest.status < 400, `status ${honest.status} ${honest.text.slice(0, 120)}`);
  const filed = await reportsFor(b1.id);
  check('...the row landed', filed.length === 1, JSON.stringify(filed));
  check('...the subject owner is snapshotted', filed[0]?.subject_owner_id === testUserId);
  check('...it is OPEN, not pre-resolved', filed[0]?.status === 'open');
  check('...and un-notified, so the alert job will announce it', filed[0]?.notified_at === null);

  const forged = await api('/rest/v1/content_reports', {
    method: 'POST', token: jwt,
    body: { binder_id: b1.id, reason: 'copyright', status: 'actioned' },
  });
  check('a pre-actioned report is REFUSED', forged.status >= 400, `status ${forged.status}`);
  check('...and really did not land', (await reportsFor(b1.id)).length === 1);

  const preNotified = await api('/rest/v1/content_reports', {
    method: 'POST', token: jwt,
    body: { binder_id: b1.id, reason: 'other', notified_at: new Date().toISOString() },
  });
  check('a pre-notified report (would dodge the alert) is REFUSED', preNotified.status >= 400, `status ${preNotified.status}`);

  const noTarget = await api('/rest/v1/content_reports', {
    method: 'POST', token: jwt, body: { reason: 'other' },
  });
  check('a report about nothing is REFUSED', noTarget.status >= 400, `status ${noTarget.status}`);

  const bothTargets = await api('/rest/v1/content_reports', {
    method: 'POST', token: jwt,
    body: { binder_id: b1.id, profile_id: testUserId, reason: 'other' },
  });
  check('a report naming BOTH a binder and a profile is REFUSED', bothTargets.status >= 400, `status ${bothTargets.status}`);

  const spoof = await api('/rest/v1/content_reports', {
    method: 'POST', token: jwt,
    body: {
      profile_id: testUserId, reason: 'other',
      subject_owner_id: '00000000-0000-0000-0000-000000000001',
    },
  });
  check('a report with a forged subject is accepted...', spoof.status < 400, `status ${spoof.status}`);
  const spoofed = await sql(
    `select subject_owner_id from public.content_reports
       where profile_id = '${testUserId}' order by created_at desc limit 1;`,
  );
  check('...but the trigger OVERWRITES the forged subject, so strikes cannot be hung on anyone',
    spoofed[0]?.subject_owner_id === testUserId, JSON.stringify(spoofed));

  console.log('\nStep 11: admin actions refuse a non-admin');
  for (const [fn, args] of [
    ['admin_remove_binder', { p_binder_id: b1.id }],
    ['admin_restore_binder', { p_binder_id: b1.id }],
    ['admin_clear_profile', { p_profile_id: testUserId }],
  ]) {
    const r = await api(`/rest/v1/rpc/${fn}`, { method: 'POST', token: jwt, body: args });
    check(`${fn} refuses a non-admin`, r.status >= 400, `status ${r.status}`);
  }
  const strikes = await api('/rest/v1/rpc/admin_copyright_strikes', { method: 'POST', token: jwt, body: {} });
  check('admin_copyright_strikes leaks nothing to a non-admin',
    r_empty(strikes), `status ${strikes.status} ${strikes.text.slice(0, 80)}`);

  console.log('\nStep 12: the bio cap is enforced server-side');
  const longBio = await api(`/rest/v1/profiles?id=eq.${testUserId}`, {
    method: 'PATCH', token: jwt, body: { bio: 'x'.repeat(281) },
  });
  check('281 characters is refused', longBio.status >= 400, `status ${longBio.status}`);
  const goodBio = await api(`/rest/v1/profiles?id=eq.${testUserId}`, {
    method: 'PATCH', token: jwt, body: { bio: 'x'.repeat(280) },
  });
  check('280 characters is accepted', goodBio.status < 400, `status ${goodBio.status}`);
}

function r_empty(res) {
  if (res.status >= 400) return true;
  return Array.isArray(res.json) && res.json.length === 0;
}

try {
  await main();
} catch (e) {
  bad('harness crashed', e.stack ?? e.message);
} finally {
  await cleanup();
  console.log(failures === 0 ? '\nALL CHECKS PASSED.' : `\n${failures} CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

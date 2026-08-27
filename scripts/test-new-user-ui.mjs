/**
 * The NEW USER flow as a person actually meets it: does the rights prompt appear, does it stop
 * appearing, does accepting it do what the copy promises.
 *
 * Companion to test-new-user-flow.mjs, which proves the server rules. This one proves the thing
 * the user asked about that no API test can: that a new account is not NAGGED. It drives a real
 * browser against the deployed site with a throwaway account.
 *
 * NO PASSWORD IS EVER TYPED INTO THE SITE. The account is created through the Auth admin API and
 * its session is injected into localStorage the way supabase-js stores it, so the browser starts
 * signed in. The account is deleted at the end, including on failure.
 *
 * Requires playwright-core + Microsoft Edge (same as scripts/screenshots.mjs).
 * Run through test-new-user-ui.ps1.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';

import { purgeTestAccounts, reportPurge } from './_purge-test-accounts.mjs';

const SITE = process.argv[2] ?? 'https://michi-maker.com';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
const ENV = 'C:/Users/Brian/source/repos/tcgscan/michi-maker/.env';
const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan/8b947985-8f9a-44b9-b7bf-85fa237ab426/scratchpad/ui-flow';
const EMAIL_PREFIX = 'michi-uitest-';

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
const REF = URL_BASE.match(/https:\/\/([^.]+)\./)[1];

let failures = 0;
const ok = (n) => console.log(`  PASS  ${n}`);
const bad = (n, d) => { failures++; console.log(`  FAIL  ${n}`); if (d) console.log(`        ${String(d).slice(0, 240)}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

async function api(path, { method = 'GET', token, body, key = ANON, headers = {} } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: res.status, ok: res.ok, json, text };
}
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : [];
}
// Deletes AND verifies. This used to call GoTrue's admin endpoint and ignore the answer, which
// left two public test binders on the live site the day that endpoint started returning 500.
async function cleanup() {
  console.log('');
  const swept = await purgeTestAccounts({
    sql, urlBase: URL_BASE, serviceKey: SERVICE, emailPrefixes: [EMAIL_PREFIX],
  });
  if (!reportPurge(swept)) failures++;
}

mkdirSync(OUT, { recursive: true });
let browser;
try {
  await cleanup();

  // --- account + session, no forms involved ---------------------------------
  const email = `${EMAIL_PREFIX}${Date.now()}@example.com`;
  const password = `t_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const made = await api('/auth/v1/admin/users', {
    method: 'POST', key: SERVICE, body: { email, password, email_confirm: true },
  });
  if (!made.ok) throw new Error(`create account: ${made.text.slice(0, 200)}`);
  const uid = made.json.id;
  const signIn = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (!signIn.ok) throw new Error(`sign in: ${signIn.text.slice(0, 200)}`);
  const session = signIn.json;
  console.log(`Test account ${uid.slice(0, 8)} ready on ${SITE}`);

  const profile = async () => (await sql(
    `select rights_attested_at, rights_prompt_at from public.profiles where id='${uid}';`))[0];
  const binderPublic = async (id) => (await sql(
    `select is_public from public.binders where id='${id}';`))[0]?.is_public;

  // Two private binders, made the way an un-attested account's client would make them: a binder
  // AND its first page. The editor reads pages[0], so a pageless binder row will not open.
  const mk = async (title) => {
    const b = (await api('/rest/v1/binders', {
      method: 'POST', token: session.access_token,
      headers: { Prefer: 'return=representation' },
      body: { title, layout_style: 'freeform', is_public: false },
    })).json[0];
    const p = await api('/rest/v1/binder_pages', {
      method: 'POST', token: session.access_token,
      body: { binder_id: b.id, position: 0, rows: 3, cols: 3, is_public: true },
    });
    if (p.status >= 400) throw new Error(`page insert: ${p.text.slice(0, 200)}`);
    return b;
  };
  const b1 = await mk('uitest one');
  const b2 = await mk('uitest two');

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const shot = async (n) => { try { await page.screenshot({ path: `${OUT}/${n}.png`, animations: 'disabled', timeout: 60000 }); } catch { /* */ } };

  // Seed the session the way supabase-js reads it, before any app code runs.
  await page.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value);
  }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

  const text = () => page.evaluate(() => document.body?.innerText ?? '');
  /** Navigate and wait for the app to actually paint, not just for the document to exist. */
  const open = async (path) => {
    await page.goto(`${SITE}${path}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    try {
      await page.waitForFunction(
        () => (document.body?.innerText ?? '').trim().length > 40,
        { timeout: 120000 },
      );
    } catch {
      console.log('        (page never painted; console:', errors.slice(-3).join(' | ') || 'silent', ')');
    }
    // The prompt opens from an effect that waits on the profile and the binder list, so give the
    // stores a beat after first paint rather than racing them.
    await page.waitForTimeout(6000);
  };
  const seesPrompt = async () => {
    const body = await text();
    return /Turn on sharing/i.test(body) && /rights to the art/i.test(body);
  };

  // --- 0. the username gate comes first --------------------------------------
  console.log('\nStep 0: a brand new account is asked for a name before anything else');
  await open(`/binder/${b1.id}`);
  await shot('00-username-gate');
  const cold = await text();
  check('the app painted', cold.trim().length > 40, `body: ${JSON.stringify(cold.slice(0, 120))}`);
  check('the injected session signs the browser in',
    cold.trim().length > 40 && !/^\s*Sign in\s*$/im.test(cold) && !/Continue as guest/i.test(cold),
    `body: ${JSON.stringify(cold.slice(0, 160))}`);
  check('the USERNAME GATE is up', /username/i.test(cold));
  check('NOT asked to turn on sharing before having a name', !(await seesPrompt()));
  check('...and nothing recorded a sharing prompt that never showed',
    (await profile())?.rights_prompt_at === null);

  const handle = `t${Date.now().toString(36)}`.slice(0, 20);
  await api(`/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH', token: session.access_token, body: { username: handle },
  });

  // --- 1. the prompt on the first binder ------------------------------------
  console.log('\nStep 1: with a name claimed, opening the first binder');
  await open(`/binder/${b1.id}`);
  await shot('01-first-binder');
  check('the username gate is gone', !/Claim|choose a username/i.test(await text()));
  check('THE RIGHTS PROMPT APPEARS on the first binder', await seesPrompt());
  check('...and it records that it was shown', !!(await profile())?.rights_prompt_at);

  // --- 2. declining ----------------------------------------------------------
  console.log('\nStep 2: declining with "Not now"');
  await page.getByText('Not now', { exact: false }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2000);
  await shot('02-declined');
  check('the prompt closes', !(await seesPrompt()));
  check('declining does NOT attest', (await profile())?.rights_attested_at === null);
  check('the binder stays private after declining', (await binderPublic(b1.id)) === false);

  // --- 3. the anti-spam property --------------------------------------------
  console.log('\nStep 3: the anti-spam property (the point of the cadence)');
  await open(`/binder/${b1.id}`);
  await shot('03-reopened-same-binder');
  check('NOT prompted again on reopening the same binder', !(await seesPrompt()));
  await open(`/binder/${b2.id}`);
  await shot('04-second-binder');
  check('NOT prompted again on a DIFFERENT binder', !(await seesPrompt()));
  await open('/my-binders');
  await open(`/binder/${b1.id}`);
  check('NOT prompted after navigating away and back', !(await seesPrompt()));

  // --- 4. seven days later ---------------------------------------------------
  console.log('\nStep 4: seven days later');
  await sql(`update public.profiles set rights_prompt_at = now() - interval '8 days' where id='${uid}';`);
  await open(`/binder/${b1.id}`);
  await shot('05-after-seven-days');
  check('the prompt RETURNS after the 7 day gap', await seesPrompt());

  // --- 5. accepting ----------------------------------------------------------
  console.log('\nStep 5: accepting');
  await page.getByText('I own, created, or have the rights', { exact: false }).first().click({ timeout: 15000 });
  await page.waitForTimeout(600);
  await shot('06-checkbox-ticked');
  await page.getByText('Turn on sharing', { exact: false }).first().click({ timeout: 15000 });
  await page.waitForTimeout(3500);
  await shot('07-accepted');
  check('the prompt closes on accept', !(await seesPrompt()));
  const after = await profile();
  check('ACCEPTING PERSISTS on the account', !!after?.rights_attested_at);
  check('the binder in hand becomes public, as the copy promises', (await binderPublic(b1.id)) === true);
  check('the OTHER existing binder is NOT retroactively published', (await binderPublic(b2.id)) === false);

  // --- 6. never again --------------------------------------------------------
  console.log('\nStep 6: never asked again');
  await open(`/binder/${b2.id}`);
  await shot('08-never-again');
  check('NOT prompted again once accepted', !(await seesPrompt()));
  await sql(`update public.profiles set rights_prompt_at = now() - interval '400 days' where id='${uid}';`);
  await open(`/binder/${b1.id}`);
  check('...not even with a 400 day old prompt stamp', !(await seesPrompt()));

  console.log(`\nScreenshots: ${OUT}`);
} catch (e) {
  bad('harness crashed', e.stack ?? e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  await cleanup();
  console.log(failures === 0 ? '\nALL UI CHECKS PASSED.' : `\n${failures} UI CHECK(S) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

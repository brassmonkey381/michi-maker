/**
 * The avatar consent offer, driven in a real browser.
 *
 * WHAT IT HAS TO PROVE. On 2026-08-26 twelve accounts had a Google photo withdrawn from public
 * view because nobody had asked them about it. This is the ask. It is worth testing end to end
 * rather than by unit test alone, because the parts that can silently fail are all outside the
 * pure rules: the browser has to be able to FETCH the provider's bytes at all (cross-origin), the
 * re-host has to satisfy the profiles_avatar_is_hosted CHECK, and the dialog has to not collide
 * with the two other prompts that open by themselves.
 *
 * FOUR THROWAWAY ACCOUNTS, one per behaviour:
 *   photo     a real photograph is offered, accepting re-hosts it into our bucket, and the offer
 *             never comes back
 *   decline   "No thanks" is remembered for good, not for seven days
 *   monogram  the provider's generated initial-in-a-circle is never offered at all
 *   none      an account that never had a provider photo is never asked
 * plus a fifth check on the `photo` account: with the rights attestation ALSO due, only one
 * dialog is on screen.
 *
 * NO PASSWORD IS TYPED INTO THE SITE. Accounts are created through the Auth admin API and their
 * session is injected into localStorage the way supabase-js stores it. Every account is deleted
 * at the end, including on failure, and so are the fixture images.
 *
 * Requires playwright-core + Microsoft Edge. Run through test-avatar-consent-ui.ps1.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = process.argv[2] ?? 'https://michi-maker.com';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
const ENV = 'C:/Users/Brian/source/repos/tcgscan/michi-maker/.env';
const OUT = 'C:/Users/Brian/AppData/Local/Temp/claude/C--Users-Brian-source-repos-tcgscan/8b947985-8f9a-44b9-b7bf-85fa237ab426/scratchpad/avatar-ui';
const EMAIL_PREFIX = 'michi-avtest-';
// Resolved from this file, not the working directory: the .ps1 wrapper runs node from the
// workspace root, where 'assets/images' does not exist.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Where the fake "provider" images live for the duration of the run. */
const FIXTURE_DIR = '_consent-test-fixtures';

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
const bad = (n, d) => { failures++; console.log(`  FAIL  ${n}`); if (d) console.log(`        ${String(d).slice(0, 300)}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));

async function api(path, { method = 'GET', token, body, key = ANON, headers = {} } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, ok: res.ok, json, text };
}
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : [];
}

/** Upload one fixture image into the public avatars bucket and return its URL. */
async function putFixture(name, localPath) {
  const bytes = readFileSync(localPath);
  const res = await fetch(`${URL_BASE}/storage/v1/object/avatars/${FIXTURE_DIR}/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`fixture ${name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return `${URL_BASE}/storage/v1/object/public/avatars/${FIXTURE_DIR}/${name}`;
}

async function cleanup() {
  try {
    const rows = await sql(`select id from auth.users where email like '${EMAIL_PREFIX}%';`);
    for (const r of rows) await api(`/auth/v1/admin/users/${r.id}`, { method: 'DELETE', key: SERVICE });
    if (rows.length) console.log(`Cleaned up ${rows.length} test account(s).`);
  } catch (e) { console.log('Cleanup warning (accounts):', String(e.message).slice(0, 160)); }
  try {
    const list = await fetch(`${URL_BASE}/storage/v1/object/list/avatars`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: FIXTURE_DIR, limit: 100 }),
    });
    const files = list.ok ? await list.json() : [];
    if (files.length) {
      await fetch(`${URL_BASE}/storage/v1/object/avatars`, {
        method: 'DELETE',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: files.map((f) => `${FIXTURE_DIR}/${f.name}`) }),
      });
      console.log(`Cleaned up ${files.length} fixture image(s).`);
    }
  } catch (e) { console.log('Cleanup warning (fixtures):', String(e.message).slice(0, 160)); }
}

/** A signed-in throwaway account, optionally arriving with a provider photo, and named. */
async function makeAccount(label, providerPhoto) {
  const email = `${EMAIL_PREFIX}${label}-${Date.now()}@example.com`;
  const password = `t_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const made = await api('/auth/v1/admin/users', {
    method: 'POST', key: SERVICE,
    // user_metadata is where an OAuth provider's photo lands, and where the offer reads it from.
    body: { email, password, email_confirm: true, user_metadata: providerPhoto ? { avatar_url: providerPhoto } : {} },
  });
  if (!made.ok) throw new Error(`create ${label}: ${made.text.slice(0, 200)}`);
  const uid = made.json.id;
  const signIn = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (!signIn.ok) throw new Error(`sign in ${label}: ${signIn.text.slice(0, 200)}`);
  const handle = `a${Date.now().toString(36)}${label.slice(0, 3)}`.slice(0, 20);
  const named = await api(`/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH', token: signIn.json.access_token, body: { username: handle },
  });
  if (named.status >= 400) throw new Error(`username ${label}: ${named.text.slice(0, 200)}`);
  return { uid, session: signIn.json, handle };
}

const profileOf = async (uid) => (await sql(
  `select avatar_url, avatar_consented_at, avatar_prompt_at, preferences,
          rights_prompt_at, rights_attested_at
     from public.profiles where id = '${uid}';`))[0];

mkdirSync(OUT, { recursive: true });
let browser;
try {
  await cleanup();

  console.log('Uploading the fixture images the fake providers will serve...');
  // 6341 bytes: a photograph as far as the rules are concerned.
  const PHOTO = await putFixture(`photo-${Date.now()}.png`, join(REPO, 'assets/images/react-logo.png'));
  // 1346 bytes: the size and type of Google's generated initial-in-a-circle.
  const MONOGRAM = await putFixture(`monogram-${Date.now()}.png`, join(REPO, 'assets/images/favicon.png'));
  // The browser has to be able to read these cross-origin, exactly as it must read lh3's.
  const cors = await fetch(PHOTO);
  check('the provider image is readable cross-origin (ACAO)',
    cors.headers.get('access-control-allow-origin') === '*',
    `ACAO ${cors.headers.get('access-control-allow-origin')}`);

  const photoAcct = await makeAccount('photo', PHOTO);
  const declineAcct = await makeAccount('decline', PHOTO);
  const monoAcct = await makeAccount('mono', MONOGRAM);
  const noneAcct = await makeAccount('none', null);
  console.log(`Four accounts ready on ${SITE}`);

  // The photo account also has an unattested rights state and a binder to open, so the two
  // uninvited dialogs are due at the same moment on the same screen.
  const binder = (await api('/rest/v1/binders', {
    method: 'POST', token: photoAcct.session.access_token,
    headers: { Prefer: 'return=representation' },
    body: { title: 'avtest binder', layout_style: 'freeform', is_public: false },
  })).json[0];
  await api('/rest/v1/binder_pages', {
    method: 'POST', token: photoAcct.session.access_token,
    body: { binder_id: binder.id, position: 0, rows: 3, cols: 3, is_public: true },
  });

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];

  /** A fresh browser context signed in as one account. */
  const contextFor = async (acct) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(([key, value]) => {
      window.localStorage.setItem(key, value);
    }, [`sb-${REF}-auth-token`, JSON.stringify(acct.session)]);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    return { ctx, page };
  };
  const open = async (page, path) => {
    await page.goto(`${SITE}${path}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    try {
      await page.waitForFunction(() => (document.body?.innerText ?? '').trim().length > 40, { timeout: 120000 });
    } catch {
      console.log('        (page never painted; console:', errors.slice(-3).join(' | ') || 'silent', ')');
    }
    // The offer opens from an effect that waits on the profile AND on a cross-origin image fetch.
    await page.waitForTimeout(8000);
  };
  const bodyText = (page) => page.evaluate(() => document.body?.innerText ?? '');
  const seesOffer = async (page) => /Your profile photo/i.test(await bodyText(page))
    && /Use this photo/i.test(await bodyText(page));
  const seesRights = async (page) => /Turn on sharing/i.test(await bodyText(page));
  const shot = async (page, n) => { try { await page.screenshot({ path: `${OUT}/${n}.png`, animations: 'disabled', timeout: 60000 }); } catch { /* */ } };

  // --- 1. the offer appears, and does not stack on the rights prompt ---------
  console.log('\nStep 1: an affected account signs in and lands on a binder');
  {
    const { ctx, page } = await contextFor(photoAcct);
    await open(page, `/binder/${binder.id}`);
    await shot(page, '01-offer');
    const both = (await seesOffer(page)) && (await seesRights(page));
    check('THE PHOTO OFFER APPEARS', await seesOffer(page), `body: ${(await bodyText(page)).slice(0, 200)}`);
    check('it does NOT stack with the rights prompt (one uninvited dialog at a time)', !both);
    const p = await profileOf(photoAcct.uid);
    check('showing the offer is recorded', !!p?.avatar_prompt_at);
    check('...and the rights prompt, which lost the turn, is NOT recorded as shown',
      p?.rights_prompt_at === null, `rights_prompt_at ${p?.rights_prompt_at}`);

    // --- 2. accepting re-hosts the bytes ------------------------------------
    console.log('\nStep 2: accepting the offer');
    await page.getByText('Use this photo', { exact: false }).first().click({ timeout: 15000 });
    await page.waitForTimeout(8000);
    await shot(page, '02-accepted');
    const after = await profileOf(photoAcct.uid);
    check('the dialog closes', !(await seesOffer(page)));
    // The first version of the turn-taking only stopped the two dialogs OVERLAPPING, which let
    // the sharing question open the instant the photo question was answered. Two of these back
    // to back on one screen is the nagging the cadences exist to prevent.
    check('answering it does NOT summon the rights prompt in its place',
      !(await seesRights(page)), `body: ${(await bodyText(page)).slice(0, 200)}`);
    check('...and the rights prompt still has not been recorded as shown',
      after?.rights_prompt_at === null, `rights_prompt_at ${after?.rights_prompt_at}`);
    check('consent is recorded', !!after?.avatar_consented_at);
    check('an avatar is now set', !!after?.avatar_url, `avatar_url ${after?.avatar_url}`);
    check('THE BYTES ARE OURS, not a hotlink to the provider',
      typeof after?.avatar_url === 'string'
        && after.avatar_url.includes('/storage/v1/object/public/avatars/')
        && after.avatar_url.includes(photoAcct.uid),
      `avatar_url ${after?.avatar_url}`);
    if (after?.avatar_url) {
      const served = await fetch(after.avatar_url);
      check('...and the uploaded file actually serves', served.ok, `status ${served.status}`);
    }

    // --- 3. it never comes back ---------------------------------------------
    console.log('\nStep 3: the offer is not made twice, and the turn passes on');
    await open(page, '/my-binders');
    check('NOT offered again after accepting', !(await seesOffer(page)));
    // The rights prompt lost the turn in step 1 and recorded nothing, so it is still due. This
    // is the half of the turn-taking a 'did not stack' check cannot see on its own: the loser
    // is deferred, not suppressed.
    await open(page, `/binder/${binder.id}`);
    await shot(page, '02b-rights-gets-its-turn');
    check('THE RIGHTS PROMPT GETS ITS TURN once the offer is answered', await seesRights(page),
      `body: ${(await bodyText(page)).slice(0, 200)}`);
    await ctx.close();
  }

  // --- 4. "No thanks" is permanent ------------------------------------------
  console.log('\nStep 4: declining the offer');
  {
    const { ctx, page } = await contextFor(declineAcct);
    await open(page, '/my-binders');
    check('the offer appears for the second affected account', await seesOffer(page));
    await page.getByText('No thanks', { exact: false }).first().click({ timeout: 15000 });
    await page.waitForTimeout(6000);
    await shot(page, '03-declined');
    const p = await profileOf(declineAcct.uid);
    check('the dialog closes', !(await seesOffer(page)));
    check('declining does NOT set an avatar', p?.avatar_url === null, `avatar_url ${p?.avatar_url}`);
    check('declining does NOT record consent', p?.avatar_consented_at === null);
    check('THE DECLINE IS REMEMBERED', !!p?.preferences?.avatarOfferDeclined,
      `preferences ${JSON.stringify(p?.preferences)}`);
    await open(page, '/discover');
    check('NOT asked again in the same session', !(await seesOffer(page)));
    await ctx.close();

    // A completely fresh browser: the decline has to live on the account, not in a tab.
    const second = await contextFor(declineAcct);
    await open(second.page, '/my-binders');
    check('NOT asked again in a brand new browser session', !(await seesOffer(second.page)));
    await second.ctx.close();
  }

  // --- 5. a generated monogram is never offered ------------------------------
  console.log('\nStep 5: an account whose "photo" is the provider\'s generated initial');
  {
    const { ctx, page } = await contextFor(monoAcct);
    await open(page, '/my-binders');
    await shot(page, '04-monogram');
    check('NOT offered a generated monogram', !(await seesOffer(page)));
    const p = await profileOf(monoAcct.uid);
    check('...and nothing is recorded, since no dialog was shown',
      p?.avatar_prompt_at === null, `avatar_prompt_at ${p?.avatar_prompt_at}`);
    await ctx.close();
  }

  // --- 6. an account with no provider photo ---------------------------------
  console.log('\nStep 6: an account that never had a provider photo');
  {
    const { ctx, page } = await contextFor(noneAcct);
    await open(page, '/my-binders');
    check('never asked about a photo it does not have', !(await seesOffer(page)));
    check('nothing recorded', (await profileOf(noneAcct.uid))?.avatar_prompt_at === null);
    await ctx.close();
  }

  const noisy = errors.filter((e) => !/favicon|manifest|third-party|Failed to load resource/i.test(e));
  check('no uncaught page errors', noisy.length === 0, noisy.slice(0, 3).join(' | '));
} catch (e) {
  bad('harness', e.stack ?? e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  await cleanup();
  console.log(`\nScreenshots: ${OUT}`);
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\nFAILED: ${failures} check(s)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

/**
 * Apply supabase/migrations/20260828130000_scan_images_owner_select.sql: the owner-select policy
 * that makes an upsert into scan-images legal.
 *
 * THIS ONE PROVES ITSELF WITH A REAL UPLOAD. The previous applier verified that policies existed
 * and called it done, and every real upload then failed with "new row violates row-level security
 * policy" — because existence was never the question, and no check here ever exercised the thing
 * the app actually does. So step 3 creates a throwaway account, signs in as that account through
 * the public API (no service key, exactly the app's own posture), uploads a JPEG with the same
 * `upsert: true` the client uses, reads it back over the public URL, and deletes the account and
 * its object afterwards. If that passes, the app's uploads work.
 *
 * Safe to re-run: idempotent DDL, and the probe cleans up after itself.
 *
 * Run through apply-scan-images-select.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here, '..', 'supabase', 'migrations', '20260828130000_scan_images_owner_select.sql',
);

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
const secrets = loadKV(join(here, '..', '..', 'tcgscan.secrets'));
const env = loadKV(join(here, '..', '.env'));
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = secrets.APP_SECRET_KEY;
const MGMT = process.env.SUPABASE_ACCESS_TOKEN ?? secrets.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'piikwvntldytjejxmcla';

function fail(msg) {
  console.log(`FAILED: ${msg}`);
  process.exitCode = 2;
  throw new Error(msg);
}
if (!MGMT) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');
if (!URL_BASE || !ANON) fail('EXPO_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY missing from michi-maker/.env');
if (!SERVICE) fail('APP_SECRET_KEY missing from tcgscan.secrets (needed to make + purge the probe account)');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}
async function api(path, { method = 'GET', token, body, key = ANON, headers = {}, raw } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      ...(raw ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, ok: res.ok, json, text };
}

/** The smallest valid JPEG this can upload (a 1x1 baseline image), as bytes. */
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
  + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
  + 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

let probeUid = null;
let probePath = null;
try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: the four policies scan-images needs...');
  const pols = await sql(`
    select cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and coalesce(qual, with_check) like '%scan-images%';`);
  const cmds = [...new Set(pols.map((p) => p.cmd))].sort();
  for (const want of ['INSERT', 'SELECT', 'UPDATE', 'DELETE']) {
    if (!cmds.includes(want)) fail(`no ${want} policy for scan-images (have: ${cmds.join(', ')})`);
  }
  console.log(`  OK (${cmds.join(', ')})`);

  console.log('Step 3: a real signed-in upload, the way the app does it (upsert)...');
  const email = `scanimg-probe-${Date.now()}@example.com`;
  const password = `t_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const made = await api('/auth/v1/admin/users', {
    method: 'POST', key: SERVICE,
    body: { email, password, email_confirm: true },
  });
  if (!made.ok) fail(`could not create the probe account: ${made.text.slice(0, 200)}`);
  probeUid = made.json.id;
  const signIn = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password },
  });
  if (!signIn.ok) fail(`probe sign-in: ${signIn.text.slice(0, 200)}`);
  const token = signIn.json.access_token;

  probePath = `${probeUid}/${Date.now().toString(36)}-probe.jpg`;
  const up = await api(`/storage/v1/object/scan-images/${probePath}`, {
    method: 'POST',
    token,
    raw: TINY_JPEG,
    // x-upsert mirrors supabase-js's { upsert: true } — the exact flag that needed the select
    // policy. Uploading without it would pass even on the broken configuration, and prove nothing.
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
  });
  if (!up.ok) fail(`upload rejected (${up.status}): ${up.text.slice(0, 200)}`);
  console.log('  OK (upload accepted)');

  console.log('Step 4: the same path uploads AGAIN (a retry must not 4xx)...');
  const again = await api(`/storage/v1/object/scan-images/${probePath}`, {
    method: 'POST',
    token,
    raw: TINY_JPEG,
    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
  });
  if (!again.ok) fail(`re-upload rejected (${again.status}): ${again.text.slice(0, 200)}`);
  console.log('  OK (idempotent, so the queue can retry safely)');

  console.log('Step 5: the public URL serves it (what both apps display)...');
  const pub = await fetch(`${URL_BASE}/storage/v1/object/public/scan-images/${probePath}`);
  if (!pub.ok) fail(`public read failed (${pub.status})`);
  const bytes = (await pub.arrayBuffer()).byteLength;
  if (bytes < 100) fail(`public read returned ${bytes} bytes`);
  console.log(`  OK (${bytes} bytes over the public URL)`);

  console.log('\nDONE. Scan-image uploads work; the app can stop failing RLS.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 2;
  }
} finally {
  // Leave nothing behind: the object first (it outlives the account otherwise), then the account.
  try {
    if (probePath) {
      await api(`/storage/v1/object/scan-images/${probePath}`, { method: 'DELETE', key: SERVICE });
    }
    if (probeUid) {
      await sql(`delete from auth.users where id = '${probeUid}'::uuid;`);
      const [left] = await sql(`select count(*)::int as n from auth.users where id = '${probeUid}'::uuid;`);
      if (left.n) console.log(`CLEANUP WARNING: probe account ${probeUid} still exists`);
      else console.log('Cleanup: probe account and object removed.');
    }
  } catch (e) {
    console.log(`CLEANUP WARNING: ${String(e.message).slice(0, 200)}`);
  }
}

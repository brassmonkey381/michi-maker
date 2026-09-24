/**
 * Copy the puzzle backdrop into our own bucket and point every puzzle page at the copy.
 *
 * WHY. The backdrop was a pixabay.com/get/... address, which is what their API hands out and which
 * carries a signature. It works today. It is not a thing to build a daily habit on: the day it
 * stops resolving, every puzzle page in the account loses its background at once and nothing in the
 * app will say why, because a background that fails to load simply falls back to the colour behind
 * it. The app's own stock-art picker re-hosts for this reason; this does the same thing for a
 * backdrop, which is the one image path that does not go through it.
 *
 * WHERE IT LANDS. `binder-art`, under the uploader's own id, which is what that bucket's policy
 * allows and what every other art upload in the app does (src/lib/uploadArt.ts). Public read by
 * URL, so a scraper with no session can still fetch it for the share image.
 *
 *   node scripts/puzzles/rehost-backdrop.mjs <source-url> [--apply]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
const PROJECT_REF = 'piikwvntldytjejxmcla';
const BUCKET = 'binder-art';
const TITLE_PREFIX = 'Daily Puzzle: ';

const APPLY = process.argv.includes('--apply');
const source = process.argv.slice(2).find((a) => a.startsWith('http'));
const mgmt = process.env.SUPABASE_ACCESS_TOKEN;

const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);
if (!source) fail('usage: node scripts/puzzles/rehost-backdrop.mjs <source-url> [--apply]');
if (!mgmt) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

function readVars(file, names) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (names.includes(k)) out[k] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = readVars(join(ROOT, '.env'), ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
const creds = readVars(SECRETS, ['MICHI_TEST_EMAIL', 'MICHI_TEST_PASSWORD']);
const APP_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const APP_KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!APP_URL || !APP_KEY) fail('EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY missing from .env');
if (!creds.MICHI_TEST_EMAIL) fail('MICHI_TEST_EMAIL / MICHI_TEST_PASSWORD missing from the secrets file');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mgmt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused (${res.status}): ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

step(1, 'fetching the source image');
const res = await fetch(source);
if (!res.ok) fail(`the source answers ${res.status}, so there is nothing to re-host`);
const type = res.headers.get('content-type') ?? '';
if (!type.startsWith('image/')) fail(`the source serves ${type}, not an image`);
const bytes = new Uint8Array(await res.arrayBuffer());
console.log(`  ${type}, ${(bytes.length / 1024).toFixed(0)} KB`);
if (bytes.length < 1024) fail('that is too small to be the picture; it is probably an error page');

step(2, 'signing in to upload as a real user');
const auth = await fetch(`${APP_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: APP_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: creds.MICHI_TEST_EMAIL, password: creds.MICHI_TEST_PASSWORD }),
});
if (!auth.ok) fail(`sign-in refused (${auth.status})`);
const session = await auth.json();
const uid = session.user?.id;
if (!uid || !session.access_token) fail('sign-in returned no session');
console.log(`  signed in as ${uid}`);

/**
 * NAMED BY ITS CONTENT, so re-running is safe without ever deleting or replacing anything.
 *
 * It has to be that way here. The `binder-art` bucket deliberately has NO SELECT policy, so that a
 * client cannot enumerate it (see 20260707082428_binder_art_uploads.sql, which says so). Both
 * `x-upsert` and DELETE must first FIND the row, and finding it is a SELECT, so under RLS the row
 * is invisible and both are refused: upsert answers "new row violates row-level security policy"
 * and a delete quietly removes nothing. Plain INSERT is the only write that works.
 *
 * A content hash turns that from a problem into a non-issue: the same picture always lands on the
 * same path (so a re-run is a no-op), and a different picture lands on a different one (so nothing
 * ever needs replacing).
 */
const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const path = `${uid}/puzzle-backdrop-${digest}.${ext}`;
const publicUrl = `${APP_URL}/storage/v1/object/public/${BUCKET}/${path}`;

if (!APPLY) {
  console.log(`\n  would upload to ${BUCKET}/${path}`);
  console.log(`  would become ${publicUrl}`);
  console.log('\nOK: dry run only. Re-run with --apply.');
} else {
  step(3, 'uploading');
  const up = await fetch(`${APP_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: APP_KEY, 'Content-Type': type },
    body: bytes,
  });
  if (up.status === 409) {
    // Already there, and since the name IS the hash of these bytes, what is there is this picture.
    console.log(`  ${BUCKET}/${path} (already present, same content)`);
  } else if (!up.ok) {
    fail(`upload refused (${up.status}): ${(await up.text()).slice(0, 300)}`);
  } else {
    console.log(`  ${BUCKET}/${path}`);
  }

  step(4, 'checking the copy serves, with no session at all');
  // A scraper has no session. If this needs one, the share image will not render for anybody.
  const check = await fetch(publicUrl);
  const checkType = check.headers.get('content-type') ?? '';
  console.log(`  ${check.status} ${checkType}`);
  if (!check.ok || !checkType.startsWith('image/')) fail('the re-hosted copy does not serve publicly');

  step(5, 'pointing every puzzle page at the copy');
  const updated = await sql(`
    update public.binder_pages p
       set background_color = ${q(publicUrl)}
      from public.binders b
     where p.binder_id = b.id and b.title like ${q(`${TITLE_PREFIX}%`)}
    returning p.id;
  `);
  const [count] = await sql(`
    select count(*)::int as total,
           count(*) filter (where p.background_color = ${q(publicUrl)})::int as pointed
      from public.binder_pages p
      join public.binders b on b.id = p.binder_id
     where b.title like ${q(`${TITLE_PREFIX}%`)};
  `);
  console.log(`  ${updated.length} updated; ${count.pointed} of ${count.total} now carry it`);
  if (count.pointed !== count.total) fail('some pages did not take the re-hosted backdrop');

  console.log(`\n  ${publicUrl}`);
  console.log('\nOK: the backdrop is ours now, and nothing points at a signed address.');
}

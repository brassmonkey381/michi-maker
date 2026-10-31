/**
 * Host the pictures the seeded Reddit arrival puts in pocket 4 (src/data/seedPages.ts) in our own
 * bucket, the way scripts/presets/rehost.mjs hosts the preset backdrops and for the same reason: a
 * Pexels address is theirs to change, and a seed is a picture the app promises will be there.
 *
 *   node scripts/seeds/rehost-seed-pictures.mjs            (downloads, resizes, reports; uploads nothing)
 *   node scripts/seeds/rehost-seed-pictures.mjs --apply    (uploads under the QA account's folder, prints the urls)
 *
 * The owner picked these by number from Pexels contact sheets on 2026-10-30. Paste the printed
 * url and credit into PICTURES in seedPages.ts; the file name carries a content hash, so a rerun
 * is harmless.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT, fail, readVars, step } from '../lib/michi.mjs';

const APPLY = process.argv.includes('--apply');
const BUCKET = 'binder-art';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

/** theme -> the Pexels photo (id from the photo's page url), with the credit the slot carries. */
const PICKS = [
  { theme: 'volcano', pexels: 38842765, artist: 'James Lee', page: 'https://www.pexels.com/photo/erupting-lava-flow-at-hawaii-volcanoes-national-park-38842765/' },
  { theme: 'autumn', pexels: 40283694, artist: 'Ebahir', page: 'https://www.pexels.com/photo/vibrant-autumn-foliage-on-a-rustic-wall-40283694/' },
];

const env = readVars(join(ROOT, '.env'), ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
const creds = readVars(SECRETS, ['MICHI_TEST_EMAIL', 'MICHI_TEST_PASSWORD']);
if (!env.EXPO_PUBLIC_SUPABASE_URL || !env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) fail('.env is missing the Supabase URL or key');
if (!creds.MICHI_TEST_EMAIL || !creds.MICHI_TEST_PASSWORD) fail('the secrets file is missing the QA sign-in');

step(1, 'downloading and resizing');
const files = [];
for (const p of PICKS) {
  // Pexels serves any size from the photo id; 1920 wide is what a three-pocket strip can use.
  const src = await fetch(`https://images.pexels.com/photos/${p.pexels}/pexels-photo-${p.pexels}.jpeg?auto=compress&cs=tinysrgb&w=1920`);
  if (!src.ok) fail(`${p.theme}: Pexels answers ${src.status}`);
  const bytes = Buffer.from(await src.arrayBuffer());
  const full = await sharp(bytes).rotate().resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const meta = await sharp(full).metadata();
  files.push({ ...p, full, width: meta.width, height: meta.height });
  console.log(`  ${p.theme}: ${(bytes.length / 1024).toFixed(0)} KB -> ${(full.length / 1024).toFixed(0)} KB, ${meta.width}x${meta.height}`);
}

step(2, APPLY ? 'signing in and uploading' : 'what would be uploaded');
const APP_URL = env.EXPO_PUBLIC_SUPABASE_URL;
let uid = '<qa-user-id>';
let token = '';
if (APPLY) {
  const auth = await fetch(`${APP_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.MICHI_TEST_EMAIL, password: creds.MICHI_TEST_PASSWORD }),
  });
  if (!auth.ok) fail(`sign-in refused (${auth.status})`);
  const session = await auth.json();
  uid = session.user?.id;
  token = session.access_token;
  if (!uid || !token) fail('sign-in returned no session');
}
for (const f of files) {
  const h = createHash('sha256').update(f.full).digest('hex').slice(0, 12);
  const path = `${uid}/seed-${f.theme}-${h}.jpg`;
  if (APPLY) {
    const up = await fetch(`${APP_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'image/jpeg' },
      body: f.full,
    });
    const text = await up.text();
    if (!up.ok && !/already exists|Duplicate/i.test(text)) fail(`${path}: upload refused (${up.status}) ${text.slice(0, 200)}`);
  }
  console.log(`  ${f.theme}: { url: '${APP_URL}/storage/v1/object/public/${BUCKET}/${path}', artist: '${f.artist}', sourceName: 'Pexels', sourceUrl: '${f.page}' }`);
}
console.log(APPLY ? 'DONE: paste the lines above into PICTURES in src/data/seedPages.ts' : 'dry run; add --apply to upload');

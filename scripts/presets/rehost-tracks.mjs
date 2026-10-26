/**
 * Host the preset soundtracks in our own bucket and write the manifest.
 *
 *   node scripts/presets/rehost-tracks.mjs            (downloads, measures, reports; uploads nothing)
 *   node scripts/presets/rehost-tracks.mjs --apply    (uploads, then writes src/data/presetTracks.ts)
 *
 * THE TRACKS (owner, 2026-10-14: "a track picker on a carousel, like sleeves and backgrounds").
 * Kevin MacLeod's library at incompetech.com, licensed CC BY 4.0: a credit is all it asks, and the
 * credit travels in the track name the pill shows. Hosted rather than hotlinked for the same reason
 * the preset pictures are (rehost.mjs): a preset is a promise the app makes. Files land in the QA
 * account's folder of the binder-audio bucket, named by content hash so a re-run is harmless.
 *
 * Every pick is under the bucket's 8 MB limit, which the script checks, and the duration shown on
 * the tile is read from the MP3's first frame header (these files are constant bitrate).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, fail, readVars, step } from '../lib/michi.mjs';

const APPLY = process.argv.includes('--apply');
const BUCKET = 'binder-audio';
const MAX_BYTES = 8 * 1024 * 1024;
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
// The credit (Kevin MacLeod, incompetech.com, CC BY 4.0) lives in src/data/presetTracks.ts.

/** id, the title as incompetech names the file, the mood word on the tile. */
const PICKS = [
  ['gymnopedie', 'Gymnopedie No 1', 'Calm'],
  ['carefree', 'Carefree', 'Cheerful'],
  ['fluffing', 'Fluffing a Duck', 'Playful'],
  ['monkeys', 'Monkeys Spinning Monkeys', 'Silly'],
  ['jaunty', 'Jaunty Gumption', 'Upbeat'],
  ['lobby', 'Lobby Time', 'Jazzy'],
  ['easylemon', 'Easy Lemon', 'Mellow'],
  ['dreamy', 'Dreamy Flashback', 'Dreamy'],
  ['bittersweet', 'Bittersweet', 'Wistful'],
  ['deliberate', 'Deliberate Thought', 'Thoughtful'],
  ['frost', 'Frost Waltz', 'Wintry'],
  ['elevator', 'Local Forecast - Elevator', 'Lounge'],
  ['sneaky', 'Sneaky Snitch', 'Sly'],
  ['pamgaea', 'Pamgaea', 'Adventure'],
  ['comeplay', 'Come Play with Me', 'Spooky'],
  ['ghostpocalypse', 'Ghostpocalypse - 6 Crossing the Threshold', 'Eerie'],
  ['melodrama', 'Evening Melodrama', 'Dramatic'],
];
const srcUrl = (title) => `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(title)}.mp3`;

const env = readVars(join(ROOT, '.env'), ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
const creds = readVars(SECRETS, ['MICHI_TEST_EMAIL', 'MICHI_TEST_PASSWORD']);
if (!env.EXPO_PUBLIC_SUPABASE_URL || !env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) fail('.env is missing the Supabase URL or key');
if (!creds.MICHI_TEST_EMAIL || !creds.MICHI_TEST_PASSWORD) fail('the secrets file is missing the QA sign-in');

/** Seconds from the first MPEG frame header, constant bitrate assumed. Null when no header is found. */
function mp3Seconds(buf) {
  let i = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  const V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  for (; i < buf.length - 4; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3;
    if (version === 1 || layer !== 1) continue; // layer III only
    const br = (version === 3 ? V1 : V2)[buf[i + 2] >> 4];
    const sr = RATES[version]?.[(buf[i + 2] >> 2) & 3];
    if (!br || !sr) continue;
    return Math.round(((buf.length - i) * 8) / (br * 1000));
  }
  return null;
}

step(1, 'downloading and measuring');
const files = [];
for (const [id, title, mood] of PICKS) {
  const res = await fetch(srcUrl(title));
  if (!res.ok) fail(`${title}: source answers ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) fail(`${title}: ${(bytes.length / 1048576).toFixed(1)} MB is over the bucket limit`);
  const seconds = mp3Seconds(bytes);
  if (!seconds) fail(`${title}: no MP3 frame header found`);
  files.push({ id, title, mood, bytes, seconds });
  console.log(`  ${id.padEnd(15)} ${(bytes.length / 1048576).toFixed(1)} MB  ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}  ${title}`);
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
const entries = [];
for (const f of files) {
  const h = createHash('sha256').update(f.bytes).digest('hex').slice(0, 12);
  const path = `${uid}/preset-${f.id}-${h}.mp3`;
  if (APPLY) {
    const up = await fetch(`${APP_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'audio/mpeg' },
      body: f.bytes,
    });
    const text = await up.text();
    if (!up.ok && !/already exists|Duplicate/i.test(text)) fail(`${path}: upload refused (${up.status}) ${text.slice(0, 200)}`);
  }
  entries.push({ ...f, url: `${APP_URL}/storage/v1/object/public/${BUCKET}/${path}` });
  console.log(`  ${APPLY ? 'uploaded' : 'would upload'} ${path}`);
}

if (APPLY) {
  step(3, 'reading one back');
  const check = await fetch(entries[0].url, { method: 'HEAD' });
  if (!check.ok) fail(`${entries[0].url} answers ${check.status}`);
}

step(APPLY ? 4 : 3, APPLY ? 'writing the manifest' : 'manifest preview (not written)');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = entries.map((e) =>
  `  { id: '${e.id}', label: '${esc(e.title)}', mood: '${esc(e.mood)}', url: '${e.url}', bytes: ${e.bytes.length}, seconds: ${e.seconds} },`);
// THE SHEET IS THE LIST (2026-10-26): entries go into src/data/presets.json, which the owner edits
// with tools/presets-sheet.html. Same id replaces in place; a new one is appended, offered.
const PRESETS = join(ROOT, 'src', 'data', 'presets.json');
const mergeInto = (list, next) => {
  const out = list.slice();
  for (const e of next) {
    const i = out.findIndex((x) => x.id === e.id);
    if (i >= 0) out[i] = { ...out[i], ...e };
    else out.push({ ...e, offered: true });
  }
  return out;
};
if (APPLY) {
  const sheet = JSON.parse(readFileSync(PRESETS, 'utf8'));
  sheet.tracks = mergeInto(sheet.tracks, entries);
  writeFileSync(PRESETS, JSON.stringify(sheet, null, 2) + '\n', 'utf8');
  console.log('  src/data/presets.json (tracks) written');
} else {
  console.log(lines.join('\n'));
}
console.log(`\nOK: ${entries.length} track(s)${APPLY ? '' : ' (dry run)'}`);

/**
 * Host the owner's picks from gather-candidates.mjs in our own bucket and write the manifest.
 *
 *   node scripts/presets/rehost.mjs                 (downloads, resizes, reports; uploads nothing)
 *   node scripts/presets/rehost.mjs --apply         (uploads, then writes src/data/presetBackdrops.ts)
 *
 * WHY HOSTED AND NOT HOTLINKED (owner, 2026-10-13, offered both). Pixabay's terms forbid hotlinking
 * their files, and a Pexels address is theirs to change. A preset is a picture the app promises
 * will be there, in every sleeve and share image that chose it, for as long as the binder exists;
 * that promise cannot rest on another site's URL scheme. scripts/puzzles/rehost-backdrop.mjs
 * exists because one such address already broke.
 *
 * TWO FILES PER PICTURE: the picture itself, resized to what a sleeve or a 1200x630 share image
 * can use, and a small thumbnail for the picker grid, so opening the picker does not pull thirty
 * full pictures. Both are named by content hash under the QA account's folder, the same way the
 * puzzle backdrop is (that bucket allows a user to INSERT into its own folder and nothing else;
 * see rehost-backdrop.mjs for why that is the only write that works and why a hash makes it safe
 * to re-run).
 *
 * The credit for every picture goes into the manifest. Neither licence requires it; the picker
 * shows it anyway, as the stock-art search does, because it costs nothing and it is true.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { ROOT, fail, readVars, step } from '../lib/michi.mjs';

const APPLY = process.argv.includes('--apply');
const BUCKET = 'binder-art';
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

/** The owner's picks, 2026-10-13, as `slug-n` from the candidate sheet. */
const PICKS = `rainbow-3 gold-2 silver-1 marble-1 wood-4 leather-6 carbon-4 glitter-1 rosegold-4 linen-3
water-7 fire-7 earth-1 light-2 dark-4 city-4 forest-8 ocean-1 sky-6 mountain-3 snow-8 desert-3 space-8
sunset-3 flowers-8 neon-1 autumn-3 storm-8 beach-4 blossom-7`.split(/\s+/);

const LABELS = {
  rainbow: 'Rainbow', gold: 'Gold', silver: 'Silver', marble: 'Marble', wood: 'Wood', leather: 'Leather',
  carbon: 'Carbon', glitter: 'Glitter', rosegold: 'Rose gold', linen: 'Linen',
  water: 'Water', fire: 'Fire', earth: 'Earth', light: 'Light', dark: 'Dark', city: 'City', forest: 'Forest',
  ocean: 'Ocean', sky: 'Sky', mountain: 'Mountain', snow: 'Snow', desert: 'Desert', space: 'Space',
  sunset: 'Sunset', flowers: 'Flowers', neon: 'Neon', autumn: 'Autumn', storm: 'Storm', beach: 'Beach',
  blossom: 'Blossom',
};

const env = readVars(join(ROOT, '.env'), ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
const creds = readVars(SECRETS, ['MICHI_TEST_EMAIL', 'MICHI_TEST_PASSWORD']);
if (!env.EXPO_PUBLIC_SUPABASE_URL || !env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) fail('.env is missing the Supabase URL or key');
if (!creds.MICHI_TEST_EMAIL || !creds.MICHI_TEST_PASSWORD) fail('the secrets file is missing the QA sign-in');

step(1, 'the picks');
const groups = JSON.parse(readFileSync(join(ROOT, 'state', 'out', 'preset-candidates.json'), 'utf8'));
const picked = PICKS.map((p) => {
  const m = /^([a-z]+)-(\d+)$/.exec(p);
  if (!m) fail(`bad pick ${p}`);
  const g = groups.find((x) => x.slug === m[1]);
  const h = g?.hits.find((x) => x.n === Number(m[2]));
  if (!g || !h) fail(`no candidate ${p}`);
  if (!LABELS[g.slug]) fail(`no label for ${g.slug}`);
  return { ...g, hit: h };
});
console.log(`  ${picked.length} picture(s)`);

step(2, 'downloading and resizing');
const files = [];
for (const p of picked) {
  const res = await fetch(p.hit.download);
  if (!res.ok) fail(`${p.slug}: source answers ${res.status}`);
  const src = Buffer.from(await res.arrayBuffer());
  // A theme fills a 1200x630 share image, so 1920 wide leaves room for a 2x crop. A texture fills
  // a pocket at most a few hundred pixels wide on screen; 1200 is plenty and keeps a page of
  // sleeves light.
  const maxW = p.kind === 'theme' ? 1920 : 1200;
  const full = await sharp(src).rotate().resize({ width: maxW, withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  const thumb = await sharp(src).rotate().resize({ width: 360, height: 240, fit: 'cover' }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  const meta = await sharp(full).metadata();
  files.push({ ...p, full, thumb, width: meta.width, height: meta.height });
  console.log(`  ${p.kind}/${p.slug}: ${(src.length / 1024).toFixed(0)} KB -> ${(full.length / 1024).toFixed(0)} KB full, ${(thumb.length / 1024).toFixed(0)} KB thumb, ${meta.width}x${meta.height}`);
}

step(3, APPLY ? 'signing in and uploading' : 'what would be uploaded');
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

async function upload(path, bytes) {
  const url = `${APP_URL}/storage/v1/object/${BUCKET}/${path}`;
  if (!APPLY) return;
  const up = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  const text = await up.text();
  // Same content, same path: a re-run finds it already there, which is the point of the hash.
  if (!up.ok && !/already exists|Duplicate/i.test(text)) fail(`${path}: upload refused (${up.status}) ${text.slice(0, 200)}`);
}

const entries = [];
for (const f of files) {
  const h = createHash('sha256').update(f.full).digest('hex').slice(0, 12);
  const fullPath = `${uid}/preset-${f.slug}-${h}.jpg`;
  const thumbPath = `${uid}/preset-${f.slug}-thumb-${h}.jpg`;
  await upload(fullPath, f.full);
  await upload(thumbPath, f.thumb);
  const pub = (p) => `${APP_URL}/storage/v1/object/public/${BUCKET}/${p}`;
  entries.push({
    id: f.slug, kind: f.kind, label: LABELS[f.slug], url: pub(fullPath), thumb: pub(thumbPath),
    width: f.width, height: f.height, provider: f.hit.provider, author: f.hit.author, page: f.hit.page,
  });
  console.log(`  ${APPLY ? 'uploaded' : 'would upload'} ${fullPath}`);
}

if (APPLY) {
  step(4, 'reading one back');
  const check = await fetch(entries[0].thumb);
  if (!check.ok) fail(`${entries[0].thumb} answers ${check.status}`);
}

step(APPLY ? 5 : 4, APPLY ? 'writing the manifest' : 'manifest preview (not written)');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = entries.map((e) =>
  `  { id: '${e.id}', kind: '${e.kind}', label: '${esc(e.label)}', url: '${e.url}', thumb: '${e.thumb}', `
  + `width: ${e.width}, height: ${e.height}, provider: '${e.provider}', author: '${esc(e.author)}', page: '${e.page}' },`);
const manifest = `/**
 * THE PRESET PICTURE LIBRARY: textures for sleeves and art backings, themes for the picture behind
 * the share image. Picked by the owner on 2026-10-13 from Pexels and Pixabay candidates
 * (scripts/presets/gather-candidates.mjs) and hosted in our own bucket (scripts/presets/rehost.mjs),
 * because a preset is a promise the app makes and a hotlink is a promise someone else keeps.
 *
 * GENERATED by rehost.mjs. To change a picture, change the pick there and re-run with --apply;
 * do not edit the addresses by hand. A \`url\` is what a sleeve, backing or share backdrop stores,
 * so it is an ordinary picture address to everything downstream (isImageRef); nothing reads this
 * list except the picker that offers it.
 *
 * Neither licence requires a credit. \`author\` and \`page\` are kept and shown because they are true.
 */

export type PresetKind = 'texture' | 'theme';

export interface PresetPicture {
  id: string;
  kind: PresetKind;
  label: string;
  /** The hosted picture, the address a surface stores. */
  url: string;
  /** 360x240 for the picker grid. */
  thumb: string;
  width: number;
  height: number;
  provider: 'pexels' | 'pixabay';
  author: string;
  /** The picture's page at the provider. */
  page: string;
}

export const PRESET_PICTURES: readonly PresetPicture[] = [
${lines.join('\n')}
];

export function presetsOf(kind: PresetKind): PresetPicture[] {
  return PRESET_PICTURES.filter((p) => p.kind === kind);
}

/** The preset a stored address came from, if any; a pasted link is not one. */
export function presetFor(url: string | undefined | null): PresetPicture | null {
  return url ? PRESET_PICTURES.find((p) => p.url === url) ?? null : null;
}
`;
if (APPLY) {
  writeFileSync(join(ROOT, 'src', 'data', 'presetBackdrops.ts'), manifest, 'utf8');
  console.log('  src/data/presetBackdrops.ts');
  console.log(`\nOK: ${entries.length} preset(s) hosted and listed.`);
} else {
  console.log(lines.slice(0, 2).join('\n'));
  console.log('\nOK: dry run. Re-run with --apply.');
}

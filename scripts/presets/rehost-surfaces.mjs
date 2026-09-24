/**
 * Re-host a preset set of sleeve / art-backing textures, and write the module the picker reads.
 *
 * WHY THESE ARE OURS AND NOT HOTLINKS. A sleeve or an art backing takes a colour or an image URL
 * (src/data/pageStyle.ts, isImageRef), and so far the image ones have been addresses typed in by
 * hand. That is fine for one person experimenting and wrong for a preset list: a preset that points
 * at somebody else's server breaks for every binder at once the day they move it, and a page whose
 * backing fails to load says nothing, it just shows the colour behind it.
 *
 * NAMED BY CONTENT HASH, for the reason spelled out in scripts/puzzles/rehost-backdrop.mjs: the
 * `binder-art` bucket has no SELECT policy by design, so neither upsert nor delete can find a row
 * to act on, and a plain INSERT is the only write that works. A content-addressed name makes a
 * re-run a no-op instead of an error.
 *
 *   node scripts/presets/rehost-surfaces.mjs              resolve and build a contact sheet
 *   node scripts/presets/rehost-surfaces.mjs --apply      upload and write src/data/surfacePresets.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const SECRETS = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';
const BUCKET = 'binder-art';

const APPLY = process.argv.includes('--apply');
const fail = (msg) => {
  console.log(`FAILED: ${msg}`);
  process.exit(2);
};
const step = (n, what) => console.log(`Step ${n}: ${what}`);

/**
 * The set, chosen to cover what a pocket or a backing actually wants: a couple of foils because
 * that is what people reach for first, then plain materials that sit UNDER artwork without arguing
 * with it. `illustration` is asked for where a photograph of the thing would carry a subject,
 * lighting and a focal point, none of which a backing should have.
 */
const SURFACES = [
  { id: 'holo-rainbow', label: 'Rainbow holo', q: 'iridescent holographic rainbow background', kind: 'photo' },
  { id: 'gold-foil', label: 'Gold foil', q: 'gold foil texture', kind: 'photo' },
  { id: 'silver-foil', label: 'Silver foil', q: 'silver metal foil texture', kind: 'photo' },
  { id: 'carbon-black', label: 'Carbon black', q: 'black carbon fibre texture', kind: 'photo' },
  { id: 'marble-white', label: 'White marble', q: 'white marble stone slab surface', kind: 'photo' },
  { id: 'velvet-dark', label: 'Dark velvet', q: 'dark fabric texture background', kind: 'photo' },
  { id: 'linen-cream', label: 'Cream linen', q: 'cream linen fabric texture', kind: 'photo' },
  { id: 'kraft-paper', label: 'Kraft paper', q: 'kraft paper texture', kind: 'photo' },
  { id: 'galaxy-deep', label: 'Deep galaxy', q: 'galaxy nebula stars background', kind: 'photo' },
  // 'pastel' on Pixabay is overwhelmingly flowers on pink card. Three phrasings all returned a
  // subject, so this asks for the thing it actually wants and is named after what came back.
  { id: 'dew-violet', label: 'Violet dew', q: 'water drops gradient background', kind: 'photo' },
];

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
const env = readVars(join(ROOT, '.env'), [
  'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_PIXABAY_KEY',
]);
const creds = readVars(SECRETS, ['MICHI_TEST_EMAIL', 'MICHI_TEST_PASSWORD']);
if (!env.EXPO_PUBLIC_PIXABAY_KEY) fail('EXPO_PUBLIC_PIXABAY_KEY is missing from .env');
if (!creds.MICHI_TEST_EMAIL) fail('MICHI_TEST_EMAIL / MICHI_TEST_PASSWORD missing from the secrets file');

step(1, `resolving ${SURFACES.length} textures on Pixabay`);
// DEDUPED BY PIXABAY ID. "silver metal foil texture" and "holographic rainbow foil texture" both
// returned the SAME crumpled aluminium photograph on the first pass, so the set shipped a duplicate
// under two names. Searching a few deep and skipping ids already taken costs nothing and makes that
// impossible rather than something to notice in a contact sheet.
const seen = new Set();
const picked = [];
for (const s of SURFACES) {
  const url = `https://pixabay.com/api/?key=${env.EXPO_PUBLIC_PIXABAY_KEY}`
    + `&q=${encodeURIComponent(s.q)}&image_type=${s.kind}&orientation=horizontal`
    + '&safesearch=true&per_page=12&order=popular';
  const res = await fetch(url);
  if (!res.ok) fail(`pixabay ${res.status} for "${s.q}"`);
  const hits = (await res.json()).hits ?? [];
  const hit = hits.find((h) => !seen.has(h.id));
  if (!hit) {
    console.log(`  MISSING  ${s.id.padEnd(14)} nothing unused for "${s.q}"`);
    continue;
  }
  seen.add(hit.id);
  picked.push({ ...s, src: hit.largeImageURL ?? hit.webformatURL, credit: hit.user, page: hit.pageURL });
  console.log(`  ${s.id.padEnd(14)} ${String(hit.user).padEnd(18)} ${hit.pageURL}`);
}
if (picked.length !== SURFACES.length) console.log(`  ${SURFACES.length - picked.length} not found`);

step(2, 'downloading');
for (const p of picked) {
  const r = await fetch(p.src);
  if (!r.ok) fail(`${p.id}: source answers ${r.status}`);
  const type = r.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) fail(`${p.id}: source serves ${type}`);
  p.bytes = new Uint8Array(await r.arrayBuffer());
  p.type = type;
  p.ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  p.hash = createHash('sha256').update(p.bytes).digest('hex').slice(0, 16);
  if (p.bytes.length < 2048) fail(`${p.id}: too small to be the picture`);
  console.log(`  ${p.id.padEnd(14)} ${(p.bytes.length / 1024).toFixed(0)} KB  ${p.type}`);
}

step(3, 'contact sheet, so these get looked at before anyone is offered them');
const CELL = 320;
const COLS = 5;
const tiles = [];
for (const p of picked) {
  tiles.push(await sharp(p.bytes).resize(CELL, CELL, { fit: 'cover' }).toBuffer());
}
const sheetDir = join(ROOT, 'state', 'presets');
mkdirSync(sheetDir, { recursive: true });
const sheet = join(sheetDir, 'surfaces.png');
await sharp({
  create: {
    width: COLS * CELL, height: Math.ceil(tiles.length / COLS) * CELL, channels: 3, background: '#101214',
  },
})
  .composite(tiles.map((input, i) => ({ input, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL })))
  .png()
  .toFile(sheet);
console.log(`  ${sheet}`);
console.log(`  order: ${picked.map((p) => p.id).join(', ')}`);

if (!APPLY) {
  console.log('\nOK: nothing uploaded. Look at the sheet, then re-run with --apply.');
} else {
  step(4, 'signing in and uploading');
  const auth = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.MICHI_TEST_EMAIL, password: creds.MICHI_TEST_PASSWORD }),
  });
  if (!auth.ok) fail(`sign-in refused (${auth.status})`);
  const session = await auth.json();
  const uid = session.user?.id;
  if (!uid) fail('sign-in returned no session');

  for (const p of picked) {
    p.path = `${uid}/surface-${p.id}-${p.hash}.${p.ext}`;
    p.url = `${env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p.path}`;
    const up = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${p.path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': p.type,
      },
      body: p.bytes,
    });
    if (up.status !== 409 && !up.ok) fail(`${p.id}: upload refused (${up.status}) ${(await up.text()).slice(0, 200)}`);
    console.log(`  ${p.id.padEnd(14)} ${up.status === 409 ? 'already there' : 'uploaded'}`);
  }

  step(5, 'checking every one serves with no session');
  for (const p of picked) {
    const c = await fetch(p.url);
    const t = c.headers.get('content-type') ?? '';
    if (!c.ok || !t.startsWith('image/')) fail(`${p.id}: the copy does not serve publicly (${c.status} ${t})`);
  }
  console.log(`  all ${picked.length} serve`);

  step(6, 'writing src/data/surfacePresets.ts');
  const body = `/**
 * THE PRESET SLEEVES AND ART BACKINGS, re-hosted by us.
 *
 * A sleeve or a backing is stored in the same text column as a colour and told apart by shape: an
 * http(s) URL is a picture, #rrggbb is a colour (src/data/pageStyle.ts, isImageRef). These are the
 * pictures on offer, so that choosing a texture is a tap rather than finding an address and pasting
 * it, and so that a preset cannot break because somebody else's server moved.
 *
 * EVERY URL IS IN OUR OWN BUCKET and content-addressed, so it is stable forever and a re-run of the
 * script that made it changes nothing. Generated by scripts/presets/rehost-surfaces.mjs; the
 * credits are kept because these came from Pixabay photographers, whose licence does not require
 * attribution but whose work is still theirs.
 */

export interface SurfacePreset {
  id: string;
  label: string;
  url: string;
  /** Who made the picture, and where it came from. Shown wherever there is room for it. */
  credit: { author: string; source: 'Pixabay'; sourceUrl: string };
}

export const SURFACE_PRESETS: readonly SurfacePreset[] = [
${picked
  .map(
    (p) => `  {
    id: '${p.id}',
    label: '${p.label}',
    url: '${p.url}',
    credit: { author: '${String(p.credit).replace(/'/g, "\'")}', source: 'Pixabay', sourceUrl: '${p.page}' },
  },`,
  )
  .join('\n')}
];

/** A preset by id, or undefined. Ids are stable; the URL behind one may be re-hosted. */
export function surfacePreset(id: string): SurfacePreset | undefined {
  return SURFACE_PRESETS.find((p) => p.id === id);
}

/** The preset a stored value corresponds to, when it is one of ours rather than a typed address. */
export function presetForUrl(url: string | null | undefined): SurfacePreset | undefined {
  return url ? SURFACE_PRESETS.find((p) => p.url === url) : undefined;
}
`;
  writeFileSync(join(ROOT, 'src', 'data', 'surfacePresets.ts'), body);
  console.log(`  ${picked.length} presets written`);

  console.log('\nOK: the textures are ours, and the picker has a list to read.');
}

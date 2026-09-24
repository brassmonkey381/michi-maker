/**
 * Fill card_image_urls on puzzles published before the column existed.
 *
 * WHY A SCRIPT AND NOT A MIGRATION. The addresses live in a 5.2 MB JSON manifest in storage, keyed
 * by content hash. Postgres cannot read it, and Studio only resolves them at publish time, so a
 * puzzle published before that change has none and falls back to making every visitor fetch the
 * manifest. That is precisely the cost the column exists to avoid, so the ones already out there
 * are worth filling rather than leaving on the slow path until someone re-publishes them.
 *
 * IT RESOLVES THE SAME WAY THE APP DOES, reading the same manifest with the same field names
 * (tcgscan-browse/src/images.ts, urlIn), including the schema-2 shape where each card entry leads
 * with its language and the per-field base is nested under it. Getting that wrong would write
 * plausible-looking addresses that 404, which is worse than the null it replaces.
 *
 *   node scripts/puzzles/backfill-card-images.mjs            (reports, writes nothing)
 *   node scripts/puzzles/backfill-card-images.mjs --apply
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const PROJECT_REF = 'piikwvntldytjejxmcla';
/** The 640 tier, which is what the puzzle grid draws. */
const FIELD = 'image_medium';

const APPLY = process.argv.includes('--apply');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const fail = (m) => {
  console.log(`FAILED: ${m}`);
  process.exit(2);
};
const step = (n, w) => console.log(`Step ${n}: ${w}`);
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

function envVar(name) {
  const f = join(ROOT, '.env');
  if (!existsSync(f)) return '';
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === name) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query refused: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

step(1, 'puzzles with no stored pictures');
const rows = await sql(`
  select id, publish_on, card_ids from public.daily_puzzles
   where card_image_urls is null order by publish_on;
`);
if (!rows.length) {
  console.log('  none, every puzzle already carries its own');
  process.exit(0);
}
for (const r of rows) console.log(`  ${r.publish_on}  ${r.card_ids.length} cards`);

step(2, 'fetching the image manifest');
const browseUrl = envVar('EXPO_PUBLIC_CATALOG_BROWSE_URL');
if (!browseUrl) fail('EXPO_PUBLIC_CATALOG_BROWSE_URL is missing from .env');
const res = await fetch(`${browseUrl}/images.json`);
if (!res.ok) fail(`the manifest answers ${res.status}`);
const manifest = JSON.parse(await res.text());
console.log(`  schema ${manifest.schema}, ${Object.keys(manifest.cards ?? {}).length.toLocaleString()} cards`);

/** urlIn, from tcgscan-browse/src/images.ts, for one field. */
function resolve(id) {
  const i = (manifest.fields ?? []).indexOf(FIELD);
  if (i < 0) return undefined;
  const entry = manifest.cards?.[String(id)];
  if (!entry) return undefined;
  if (manifest.schema === 2) {
    const lang = entry[0];
    const key = entry[i + 1];
    const base = manifest.base?.[lang]?.[FIELD];
    return key && base ? `${base}/${key}` : undefined;
  }
  const key = entry[i];
  const base = manifest.base?.[FIELD];
  return key && base ? `${base}/${key}` : undefined;
}

step(3, 'resolving');
const ready = [];
for (const r of rows) {
  const urls = r.card_ids.map((id) => resolve(id));
  const missing = urls.filter((u) => !u).length;
  console.log(`  ${r.publish_on}: ${urls.length - missing}/${urls.length} resolved`);
  // ALL OR NOTHING, the same rule the server enforces: a partial array draws some pockets and
  // leaves the rest blank with nothing to explain it.
  if (missing === 0) ready.push({ ...r, urls });
  else console.log(`    left alone, ${missing} could not be resolved`);
}
if (ready.length) {
  const [sample] = ready;
  console.log(`  first address: ${sample.urls[0]}`);
  const check = await fetch(sample.urls[0], { method: 'HEAD' });
  console.log(`  it serves: ${check.status} ${check.headers.get('content-type') ?? ''}`);
  if (!check.ok) fail('the resolved address does not serve, so the manifest was read wrongly');
}

if (!APPLY) {
  console.log(`\nOK: ${ready.length} puzzle(s) ready. Nothing written. Re-run with --apply.`);
} else {
  step(4, 'writing');
  for (const r of ready) {
    const arr = `array[${r.urls.map(q).join(',')}]::text[]`;
    await sql(`update public.daily_puzzles set card_image_urls = ${arr} where id = ${q(r.id)};`);
    const [back] = await sql(`select cardinality(card_image_urls) as n from public.daily_puzzles where id = ${q(r.id)};`);
    console.log(`  ${r.publish_on}: ${back.n} stored`);
    if (Number(back.n) !== r.urls.length) fail('what landed does not match what was sent');
  }
  console.log('\nOK: those puzzles draw without the manifest now.');
}

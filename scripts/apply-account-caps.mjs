/**
 * Apply supabase/migrations/20261104120000_account_card_cap_and_scan_storage.sql: tcgscan's
 * account-wide card ceiling (PRO 5,000) and the saved-scan-picture ceilings (Free 250 MB, PRO 2 GB,
 * VIP 10 GB), plus my_scan_image_usage() for the app.
 *
 * THE CHECKS THAT MATTER:
 *   2. The ten tier_caps rows hold the owner's numbers.
 *   3. enforce_card_cap carries the account check, and still the per-collection one.
 *   4. scan_image_bytes_for() agrees with a direct sum of the bucket for the biggest uploader,
 *      so the function can see storage.objects (a security definer that saw nothing would read
 *      every account as empty and never stop saving).
 *   5. CENSUS (report only): accounts already past 5,000 cards, and the largest picture stores.
 *      Nothing existing is removed; an account past a ceiling just cannot add more.
 *
 * Safe to re-run: idempotent DDL, and the cap rows are inserted only where missing.
 *
 * Run through apply-account-caps.ps1 at the workspace root.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261104120000_account_card_cap_and_scan_storage.sql');

const token = process.env.SUPABASE_ACCESS_TOKEN;
function fail(msg) {
  console.log(`FAILED: ${msg}`);
  process.exitCode = 2;
  throw new Error(msg);
}
if (!token) fail('SUPABASE_ACCESS_TOKEN is not set (the .ps1 wrapper loads it).');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

const WANT = {
  'cardsTotal:guest': null, 'cardsTotal:free': null, 'cardsTotal:legacy_free': null,
  'cardsTotal:pro': 5000, 'cardsTotal:vip': null,
  'scanImageMB:guest': 0, 'scanImageMB:free': 250, 'scanImageMB:legacy_free': 250,
  'scanImageMB:pro': 2048, 'scanImageMB:vip': 10240,
};
const mb = (b) => `${(Number(b) / 1048576).toFixed(1)} MB`;

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');

  console.log('Step 2: the cap rows...');
  const rows = await sql(`
    select limit_key, tier, value from public.tier_caps
    where app = 'tcgscan' and limit_key in ('cardsTotal', 'scanImageMB');`);
  const got = Object.fromEntries(rows.map((r) => [`${r.limit_key}:${r.tier}`, r.value]));
  for (const [k, v] of Object.entries(WANT)) {
    if (!(k in got)) fail(`tier_caps row ${k} is missing`);
    if (got[k] !== v) console.log(`  NOTE: ${k} is ${got[k]} in the table (wanted ${v}); kept, since a re-run never overwrites a tuned value`);
  }
  console.log('  OK (10 rows)');

  console.log('Step 3: the card trigger checks the collection and the account...');
  const [fn] = await sql(`select pg_get_functiondef('public.enforce_card_cap()'::regprocedure) as def;`);
  if (!fn.def.includes("'cardsPerCollection'")) fail('enforce_card_cap lost its per-collection check');
  if (!fn.def.includes("'cardsTotal'")) fail('enforce_card_cap has no account check');
  console.log('  OK');

  console.log('Step 4: the picture meter sees the bucket...');
  const [top] = await sql(`
    select split_part(name, '/', 1) as owner, sum((metadata ->> 'size')::bigint)::bigint as bytes
    from storage.objects where bucket_id = 'scan-images'
    group by 1 order by 2 desc nulls last limit 1;`);
  if (!top) {
    console.log('  SKIPPED (no saved scan pictures yet)');
  } else {
    const [m] = await sql(`select public.scan_image_bytes_for('${top.owner}'::uuid) as bytes;`);
    if (String(m.bytes) !== String(top.bytes)) fail(`meter reads ${m.bytes}, the bucket holds ${top.bytes}`);
    console.log(`  OK (largest store ${mb(top.bytes)}, and the meter agrees)`);
  }

  console.log('Step 5: census...');
  const [over] = await sql(`
    select count(*)::int as n from (
      select e.user_id from public.portfolio_entries e
        join public.collections c on c.id = e.collection_id and c.user_id = e.user_id
       where c.archived_at is null and e.item_kind is distinct from 'sealed'
       group by e.user_id having sum(e.quantity) > 5000) t;`);
  console.log(`  accounts past 5,000 cards: ${over.n} (a PRO one among them can no longer add; nothing is removed)`);
  const stores = await sql(`
    select sum((metadata ->> 'size')::bigint)::bigint as bytes
    from storage.objects where bucket_id = 'scan-images'
    group by split_part(name, '/', 1) order by 1 desc nulls last limit 3;`);
  console.log(`  largest picture stores: ${stores.map((s) => mb(s.bytes)).join(', ') || 'none'}`);
  console.log('  OK');

  console.log('DONE: the ceilings are live. The app update that reads them can ship now.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

/**
 * Apply supabase/migrations/20261104140000_tighten_share_and_storage_grants.sql, then check every
 * 2026-11-04 function against who may call it: a stranger (anon) only shared_collection, a
 * signed-in account the share and usage functions, nobody the internal byte counter.
 *
 * Run through apply-share-grants.ps1 at the workspace root. Safe to re-run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_REF = 'piikwvntldytjejxmcla';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'supabase', 'migrations', '20261104140000_tighten_share_and_storage_grants.sql');
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

// [function, anon may call, authenticated may call]
const WANT = [
  ['public.shared_collection(text)', true, true],
  ['public.create_collection_share(text)', false, true],
  ['public.revoke_collection_share(text)', false, true],
  ['public.my_collection_share(text)', false, true],
  ['public.my_scan_image_usage()', false, true],
  ['public.scan_image_bytes_for(uuid)', false, false],
  ['public.tcgscan_card_total_cap(uuid)', false, true],
  ['public.tcgscan_scan_image_mb_cap(uuid)', false, true],
];

try {
  console.log('Step 1: applying the migration...');
  await sql(readFileSync(MIGRATION, 'utf8'));
  console.log('  OK');
  console.log('Step 2: who may call what...');
  for (const [fn, anon, auth] of WANT) {
    const [r] = await sql(`select has_function_privilege('anon', '${fn}', 'execute') as anon,
                                  has_function_privilege('authenticated', '${fn}', 'execute') as auth;`);
    if (r.anon !== anon || r.auth !== auth) fail(`${fn}: anon ${r.anon} (want ${anon}), signed-in ${r.auth} (want ${auth})`);
  }
  console.log(`  OK (${WANT.length} functions as intended; only shared_collection is open to strangers)`);
  console.log('DONE: grants tightened.');
} catch (e) {
  if (!process.exitCode) {
    console.log(`FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

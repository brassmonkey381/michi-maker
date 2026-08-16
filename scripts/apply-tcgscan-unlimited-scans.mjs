/**
 * Apply migration 20260815120000_tcgscan_unlimited_scans to the LIVE shared app backend:
 * NULL out tier_caps (app='tcgscan', limit_key='cardScansPerMonth') for all four tiers, making
 * scanning unlimited on every tier, then read the rows back and verify.
 *
 * Node, not psql/PowerShell, because tier_caps writes are service-role only and Windows
 * PowerShell 5.1 mangles sb_secret_ keys into 401s. PostgREST honors the PATCH directly.
 *
 *   APP_SECRET_KEY=sb_secret_... node scripts/apply-tcgscan-unlimited-scans.mjs
 *
 * Env: APP_SECRET_KEY (required, service role); APP_URL (optional, defaults to the shared
 * project). Exits 0 on success, 1 on any failure. Idempotent — re-running is harmless.
 */
const APP_URL = process.env.APP_URL || 'https://piikwvntldytjejxmcla.supabase.co';
const KEY = process.env.APP_SECRET_KEY;

if (!KEY) {
  console.error('FAILED: set APP_SECRET_KEY (service role, sb_secret_...).');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};
const FILTER = 'app=eq.tcgscan&limit_key=eq.cardScansPerMonth';

console.log('Step 1/2: PATCH tier_caps -> value NULL (unlimited) for tcgscan cardScansPerMonth...');
const patch = await fetch(`${APP_URL}/rest/v1/tier_caps?${FILTER}`, {
  method: 'PATCH',
  headers: { ...headers, Prefer: 'return=representation' },
  body: JSON.stringify({ value: null, updated_at: new Date().toISOString() }),
});
if (!patch.ok) {
  console.error(`FAILED: PATCH ${patch.status} ${await patch.text()}`);
  process.exit(1);
}
const rows = await patch.json();
for (const r of rows) console.log(`  ${r.tier}: value=${r.value === null ? 'NULL (unlimited)' : r.value}`);

console.log('Step 2/2: verifying all four tiers read back NULL...');
const check = await fetch(`${APP_URL}/rest/v1/tier_caps?${FILTER}&select=tier,value`, { headers });
if (!check.ok) {
  console.error(`FAILED: verify GET ${check.status} ${await check.text()}`);
  process.exit(1);
}
const verify = await check.json();
const bad = verify.filter((r) => r.value !== null);
const tiers = new Set(verify.map((r) => r.tier));
const missing = ['guest', 'free', 'pro', 'vip'].filter((t) => !tiers.has(t));
if (bad.length || missing.length) {
  if (bad.length) console.error(`FAILED: still capped: ${bad.map((r) => `${r.tier}=${r.value}`).join(', ')}`);
  if (missing.length) console.error(`FAILED: rows missing for tiers: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('OK: tcgscan scanning is unlimited on all four tiers, effective immediately.');
console.log('Next: node scripts/check-tier-caps.mjs in tcgscan-app should pass (client mirror ships Infinity).');

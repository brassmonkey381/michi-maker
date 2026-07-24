/**
 * Drift guard: assert this app's TIER_LIMITS mirror matches the live `tier_caps` table, which is
 * the single source of truth the database enforces against (see
 * supabase/migrations/20260724050000_tier_caps_single_source.sql).
 *
 * The client keeps a hardcoded TIER_LIMITS for instant/offline UX, but a cap is enforced from the
 * table server-side. If the two disagree, a user sees one number and hits another — this script
 * catches that before it ships. `tier_caps` is public-readable, so the anon publishable key is
 * enough; no service role, no secrets.
 *
 *   node scripts/check-tier-caps.mjs        # exits non-zero on any mismatch
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY from the environment
 * (loads .env / .env.local if present).
 */
import { readFileSync } from 'node:fs';

import { TIER_LIMITS } from '../src/data/tiers.ts';
import { PRINTS_PER_MONTH } from '../src/data/proration.ts';

const APP = 'michi';
// The michi TierLimits fields that are NUMERIC caps mirrored in tier_caps. fullPrint (boolean) and
// composerPagesPerMonth (a retired, always-unlimited field) are intentionally not table-backed.
const KEYS = ['binders', 'pagesPerBinder', 'artUploads', 'includedPrintsPerMonth'];
const TIERS = ['guest', 'free', 'pro', 'vip'];
const UNCAPPED = 1_000_000; // matches public.uncapped()

function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {
      /* file optional */
    }
  }
}

/** The table stores NULL for unlimited; TIER_LIMITS uses Infinity. Normalise both to UNCAPPED. */
const norm = (v) => (v == null || v === Infinity ? UNCAPPED : v);

async function main() {
  loadEnv();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
    process.exit(2);
  }

  const res = await fetch(
    `${url}/rest/v1/tier_caps?app=eq.${APP}&select=limit_key,tier,value`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    console.error(`tier_caps fetch failed: ${res.status} ${await res.text()}`);
    process.exit(2);
  }
  const rows = await res.json();
  const server = new Map(rows.map((r) => [`${r.limit_key}:${r.tier}`, norm(r.value)]));

  const mismatches = [];
  for (const key of KEYS) {
    for (const tier of TIERS) {
      const local = norm(TIER_LIMITS[tier]?.[key]);
      const remote = server.get(`${key}:${tier}`);
      if (remote === undefined) mismatches.push(`${key}/${tier}: missing from tier_caps`);
      else if (local !== remote)
        mismatches.push(`${key}/${tier}: client ${local} ≠ server ${remote}`);
    }
  }

  // The webhook + proration maths use data/proration.ts's own PRINTS_PER_MONTH (dependency-free
  // for Deno), keyed by PRODUCT rather than tier — pin it to the same includedPrintsPerMonth rows.
  for (const [product, tier] of [
    ['tier_pro', 'pro'],
    ['tier_vip', 'vip'],
  ]) {
    const local = norm(PRINTS_PER_MONTH[product]);
    const remote = server.get(`includedPrintsPerMonth:${tier}`);
    if (local !== remote)
      mismatches.push(`proration PRINTS_PER_MONTH[${product}]: ${local} ≠ server ${remote}`);
  }

  if (mismatches.length) {
    console.error(`TIER_LIMITS drift from tier_caps (${APP}):`);
    for (const m of mismatches) console.error(`  - ${m}`);
    console.error('\nFix: UPDATE public.tier_caps (live source) or src/data/tiers.ts (the mirror).');
    process.exit(1);
  }
  console.log(`✓ TIER_LIMITS matches tier_caps for ${KEYS.length * TIERS.length} ${APP} caps.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

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

import { TIER_LIMITS, LEGACY_FREE_LIMITS } from '../src/data/tiers.ts';
import { PRINTS_PER_MONTH } from '../src/data/proration.ts';

const APP = 'michi';
// The michi TierLimits fields that are NUMERIC caps mirrored in tier_caps. fullPrint (boolean) and
// composerPagesPerMonth (a retired, always-unlimited field) are intentionally not table-backed.
const KEYS = ['binders', 'pagesPerBinder', 'artUploads', 'includedPrintsPerMonth'];

/**
 * EVERY TIER THE TABLE HOLDS, INCLUDING THE ONE MOST FREE ACCOUNTS ACTUALLY READ.
 *
 * `legacy_free` was added by the 2026-09 rework to grandfather every account that existed before
 * the cutover, and this guard did not check it — so the cap set the majority of the live free
 * population is held to was the one cap set nothing verified. The mirror for it is a separate
 * object (LEGACY_FREE_LIMITS), which is exactly the shape of thing that drifts unwatched.
 *
 * `vip` stays even though VIP is retired from sale: the table still carries its rows and one
 * subscription still renews against it, so a disagreement there is still a real disagreement.
 */
const TIER_MIRROR = {
  guest: TIER_LIMITS.guest,
  free: TIER_LIMITS.free,
  legacy_free: LEGACY_FREE_LIMITS,
  pro: TIER_LIMITS.pro,
  vip: TIER_LIMITS.vip,
};
const TIERS = Object.keys(TIER_MIRROR);
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
    process.exitCode = 2;
    return;
  }

  const res = await fetch(
    `${url}/rest/v1/tier_caps?app=eq.${APP}&select=limit_key,tier,value`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    console.error(`tier_caps fetch failed: ${res.status} ${await res.text()}`);
    process.exitCode = 2;
    return;
  }
  const rows = await res.json();
  const server = new Map(rows.map((r) => [`${r.limit_key}:${r.tier}`, norm(r.value)]));

  const mismatches = [];
  for (const key of KEYS) {
    for (const tier of TIERS) {
      const local = norm(TIER_MIRROR[tier]?.[key]);
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
    process.exitCode = 1;
    return;
  }
  console.log(`✓ TIER_LIMITS matches tier_caps for ${KEYS.length * TIERS.length} ${APP} caps.`);
}

// NOT process.exit(). On Node 24 / Windows, exiting while a fetch socket is still open trips
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` in libuv, which aborts the process and
// replaces the exit code this guard just computed. Setting exitCode lets the loop drain first, and
// the code is what a caller actually receives — which matters the moment anything runs this
// automatically rather than a human reading the output.
main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});

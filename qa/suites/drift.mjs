/**
 * AREA: drift. Does the shipped app agree with the live database about what a plan buys?
 *
 * WHY THIS AREA EXISTS. On 2026-09-21 the rig's first clean run found that michi's tier rework had
 * shipped in halves: the app half was deployed to michi-maker.com and the database half was never
 * applied. `my_cap_tier` and `tier_cutover` did not exist in production, and `tier_caps` still held
 * the pre-rework numbers. The visible consequence was a PRO account being shown "Unlimited" by a
 * client that believed it, while the server's insert trigger refused the 13th binder from a table
 * that still said 12.
 *
 * NEITHER SIDE COULD SEE IT ALONE. `npm test` passes: the client is self-consistent. The database is
 * self-consistent too. Only a check that reads the DEPLOYED bundle and the LIVE table together can
 * catch a half-applied release, which is why this is measured from production rather than from the
 * repo. michi already ships `scripts/check-tier-caps.mjs`, but it compares the WORKING TREE to the
 * live table, so it goes green on a machine whose repo is ahead of what is deployed.
 */
import { SUPABASE_URL } from '../lib/targets.mjs';
import { read as readSecrets } from '../lib/secrets.mjs';

const UNCAPPED = 1_000_000;
const KEYS = ['binders', 'pagesPerBinder', 'artUploads', 'includedPrintsPerMonth'];

/**
 * Schema the DEPLOYED app depends on, each function listed with the arguments it really takes.
 *
 * Keep this list short and load-bearing. It is not an inventory of the database; it is the handful
 * of things whose absence is silent, because the client swallows the error and carries on with a
 * default. A function that fails loudly does not need to be here.
 */
const SCHEMA_EXPECTED = {
  tables: ['tier_caps', 'tier_cutover', 'pro_trials', 'entitlements'],
  functions: {
    // The rework's cap-set decision. On failure use-tier silently reads 'legacy_free'.
    my_cap_tier: { p_tier: 'free' },
    // Existed since July; included as the control, so a broken probe shows up as a broken probe.
    binder_like_count: { p_binder_id: '00000000-0000-0000-0000-000000000000' },
  },
};

/** The table stores NULL for unlimited; the client uses Infinity. Normalise both. */
const norm = (v) => (v == null || v === Infinity || v === null ? UNCAPPED : Number(v));

async function liveCaps(fetchFn) {
  const key = readSecrets().APP_PUBLISHABLE_KEY;
  if (!key) return null;
  const res = await fetchFn(`${SUPABASE_URL}/rest/v1/tier_caps?app=eq.michi&select=limit_key,tier,value`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return new Map(rows.map((r) => [`${r.limit_key}:${r.tier}`, norm(r.value)]));
}

/** Pull TIER_LIMITS out of the bundle the public actually loads. */
async function deployedCaps(fetchFn, base) {
  const html = await (await fetchFn(base)).text();
  const src = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1])[0];
  if (!src) return null;
  const url = src.startsWith('http') ? src : base + src;
  const bundle = await (await fetchFn(url)).text();

  const out = {};
  for (const tier of ['guest', 'free', 'pro', 'vip']) {
    const m = new RegExp(`${tier}:\\{binders:([^,]+),pagesPerBinder:([^,]+),composerPagesPerMonth:[^,]+,artUploads:([^,]+)`).exec(bundle);
    if (!m) continue;
    const num = (s) => (s === '1/0' ? UNCAPPED : Number(s));
    out[tier] = { binders: num(m[1]), pagesPerBinder: num(m[2]), artUploads: num(m[3]) };
  }
  return { caps: out, bundle };
}

export default {
  area: 'drift',
  label: 'Shipped app versus live database',
  blurb: 'Catches a release that shipped in halves: the deployed cap numbers against the live tier_caps table, and the RPCs the deployed bundle calls against the RPCs that exist.',
  checks: [
    {
      id: 'michi.drift.deployed-caps-match-table',
      title: 'The deployed cap numbers match the live tier_caps table',
      proves: 'The client is an affordance and the database is the boundary. When they disagree, a user is shown one number and hits another, and the worse direction is a paying account being promised Unlimited by a UI while an insert trigger refuses the next row. Found live on 2026-09-21: PRO shipped as unlimited while the table still said 12 binders, 40 pages, 1000 artworks.',
      source: ['michi-maker/src/data/tiers.ts:229', 'michi-maker/supabase/migrations/20260920130000_tier_rework_caps.sql', 'michi-maker/scripts/check-tier-caps.mjs'],
      app: 'michi',
      area: 'drift',
      group: 'Shipped app agrees with the live database',
      surface: 'deployed bundle and public.tier_caps',
      danger: 'read-only',
      personas: ['guest'],
      severity: 'blocker',
      targets: ['prod'],
      expect: { '*': 'every tier and every numeric cap agrees between the bundle the public loads and the table the triggers enforce from' },
      observe: ['network', 'rest'],
      browser: false,
      async run(ctx) {
        const live = await liveCaps(ctx.fetch);
        if (!live) throw new ctx.Unmeasurable('could not read public.tier_caps');
        const dep = await deployedCaps(ctx.fetch, 'https://michi-maker.com');
        if (!dep?.caps || !Object.keys(dep.caps).length) throw new ctx.Unmeasurable('could not read TIER_LIMITS out of the deployed bundle');

        const drift = [];
        for (const [tier, caps] of Object.entries(dep.caps)) {
          for (const key of KEYS) {
            if (!(key in caps)) continue;
            const server = live.get(`${key}:${tier}`);
            if (server === undefined) {
              drift.push(`${key}/${tier}: missing from tier_caps`);
              continue;
            }
            if (norm(caps[key]) !== server) drift.push(`${key}/${tier}: deployed ${norm(caps[key])} vs table ${server}`);
          }
        }
        ctx.assert(drift.length === 0, drift.length ? `the shipped app and the live table disagree: ${drift.join('; ')}` : 'in agreement');
      },
    },
    {
      id: 'michi.drift.schema-the-app-depends-on',
      title: 'The tables and functions the deployed app depends on exist',
      proves: 'A migration that is committed but never applied leaves the app calling something that is not there. The failure is silent by design here: use-tier catches the error and falls back to the generous legacy caps, so nothing looks broken while the entire point of a caps release quietly does not happen.',
      source: ['michi-maker/src/hooks/use-tier.ts:193', 'michi-maker/supabase/migrations/20260920130000_tier_rework_caps.sql:97'],
      app: 'michi',
      area: 'drift',
      group: 'Shipped app agrees with the live database',
      surface: 'deployed bundle and PostgREST schema cache',
      danger: 'read-only',
      // MUST run signed in. Most of these are security-definer functions revoked from `public` and
      // granted to `authenticated`, so an anonymous probe gets PGRST202 for a function that exists
      // perfectly well. Asked as anon, this check reported six missing RPCs and only one was real.
      personas: ['free'],
      severity: 'blocker',
      targets: ['prod'],
      expect: { free: 'every table and function in SCHEMA_EXPECTED resolves in the live schema cache' },
      observe: ['rest'],
      browser: false,
      async run(ctx) {
        const key = readSecrets().APP_PUBLISHABLE_KEY;
        if (!key) throw new ctx.Unmeasurable('no publishable key');
        if (!ctx.token) throw new ctx.Unmeasurable('this check must run as a signed-in persona; anon cannot see a function granted only to authenticated');

        const auth = { apikey: key, Authorization: `Bearer ${ctx.token}` };
        const missing = [];

        // TABLES. PGRST205 on a select is definitive: the relation is not in the schema cache.
        for (const table of SCHEMA_EXPECTED.tables) {
          const res = await ctx.fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers: auth });
          if (res.status === 404 && (await res.text()).includes('PGRST205')) missing.push(`table ${table}`);
        }

        // FUNCTIONS, each called with its REAL arguments. PGRST202 also fires on a wrong arity, so
        // probing with an empty body reports every function that takes a parameter as missing. That
        // exact mistake made this check cry wolf about five functions that had existed since July.
        for (const [name, args] of Object.entries(SCHEMA_EXPECTED.functions)) {
          const res = await ctx.fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
            method: 'POST',
            headers: { ...auth, 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
          });
          if (res.status === 404 && (await res.text()).includes('PGRST202')) missing.push(`function ${name}`);
        }

        ctx.assert(
          missing.length === 0,
          missing.length
            ? `the deployed app depends on schema that is not in the live database: ${missing.join(', ')}. A migration is committed but not applied.`
            : `all ${SCHEMA_EXPECTED.tables.length} tables and ${Object.keys(SCHEMA_EXPECTED.functions).length} functions present`,
        );
      },
    },
  ],
};

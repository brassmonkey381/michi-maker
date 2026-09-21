/**
 * Personas: the account states a suite runs as. Three of them, and all three work.
 *
 *   guest      never signed in. Both apps mint an anonymous Supabase session, so a guest HAS a
 *              session; the discriminator is is_anonymous in the JWT, not the absence of a token.
 *   free       a fresh permanent account with no entitlement.
 *   pro-trial  the same, with both apps' 3-day PRO trials started on it.
 *
 * ONE LADDER, WALKED FRESH EACH RUN. free and pro-trial are the same lineage one step apart, which
 * is what makes the pair meaningful: the only difference between those two runs is the trial, so a
 * behaviour that differs between them is caused by the trial and nothing else.
 *
 * WHY NOT A SHARED FIXTURE. It used to be one, and on 2026-09-21 a trial got started on it, after
 * which it was a PRO account forever and every free-tier assertion had to be skipped. State carries
 * between runs; a fresh account has none.
 *
 * WHY NO `pro` OR `vip`. Owner call, 2026-09-21: the trial is close enough. A real paid tier cannot
 * be reached without either a live Stripe charge or an entitlements INSERT, and `entitlements` has
 * no client write policy, so the second needs the management token this rig deliberately cannot
 * read. The trial grants the same products (`tier_pro`, `tcgscan_pro`) that a paid PRO grants, so
 * every PRO feature gate resolves identically. What a trial does NOT cover, and what therefore goes
 * untested until someone decides otherwise: `interval`, `period_start` and `term_print_allocation`
 * are null on a trial, the bundle discount deliberately refuses a trial (source 'trial' earns no
 * cross-app discount), and VIP-only features (`unlimitedCardScans`, predictive insights) have no
 * persona at all.
 *
 * THE PERSONA IS ALWAYS VERIFIED. `resolve` reads the account's real entitlement rows and reports
 * the tier it actually found. A persona that came back wrong skips its checks rather than making a
 * claim from the wrong account.
 */
import { AUTH_STORAGE_KEY } from './targets.mjs';
import { createAccount, startTrials, readEntitlements } from './accounts.mjs';

export const PERSONAS = {
  guest: {
    id: 'guest',
    label: 'Guest',
    blurb: 'Never signed in. The app mints its own anonymous session; nothing is seeded.',
    writes: 'one anonymous auth row per fresh browser context',
    danger: 'writes-local',
    available: true,
  },
  free: {
    id: 'free',
    label: 'Free (signed in)',
    blurb: 'A brand new account, created for this run, holding no entitlement.',
    writes: 'one permanent auth row, prefixed qa-rig-',
    danger: 'writes-user-data',
    available: true,
  },
  'pro-trial': {
    id: 'pro-trial',
    label: 'PRO trial',
    blurb: 'A brand new account with both apps 3-day PRO trials started. Grants tier_pro and tcgscan_pro, the same products a paid PRO holds.',
    writes: 'one permanent auth row plus two trial rows and two entitlement rows',
    danger: 'writes-ledger',
    available: true,
  },
};

export const AVAILABLE = Object.values(PERSONAS).filter((p) => p.available).map((p) => p.id);

/** Every persona id the schema may mention, including ones no engine builds. */
export const KNOWN_PERSONA_IDS = ['guest', 'free', 'pro-trial'];

/** What tier each persona's entitlements SHOULD resolve to, for the verification step. */
const EXPECTED_TIER = { guest: 'guest', free: 'free', 'pro-trial': 'pro' };

function tierFromProducts(products) {
  if (products.includes('tier_vip') || products.includes('tcgscan_vip')) return 'vip';
  if (products.includes('tier_pro') || products.includes('tcgscan_pro')) return 'pro';
  return 'free';
}

/**
 * Build a persona. Returns `{ kind, session, tier, note }`.
 *
 * `fetchFn` is the guarded fetch, so even account creation and the trial calls pass through the
 * airlock. That is not ceremony: the hole that burned a trial on 2026-09-21 was node-side fetch
 * skipping the guard entirely.
 */
export async function resolve(personaId, { fetchFn = fetch, runId = 'adhoc' } = {}) {
  const persona = PERSONAS[personaId];
  if (!persona) throw new Error(`unknown persona ${personaId}`);

  if (personaId === 'guest') {
    return { kind: 'guest', session: null, tier: 'guest', note: 'no seeded session; the app makes its own anonymous one' };
  }

  let created;
  try {
    created = await createAccount(fetchFn, personaId === 'pro-trial' ? 'trial' : 'free', runId);
  } catch (e) {
    return { kind: 'unavailable', tier: null, note: `could not create an account: ${e.message}` };
  }

  let trials = null;
  if (personaId === 'pro-trial') {
    try {
      trials = await startTrials(fetchFn, created.session);
    } catch (e) {
      return { kind: 'unavailable', tier: null, note: `account created but the trial failed: ${e.message}` };
    }
  }

  const rows = await readEntitlements(fetchFn, created.session);
  const products = rows.map((r) => r.product);
  const tier = personaId === 'free' && !products.length ? 'free' : tierFromProducts(products);
  const want = EXPECTED_TIER[personaId];

  if (tier !== want) {
    return {
      kind: 'unavailable',
      tier,
      products,
      note: `the account resolved to ${tier} but this persona needs ${want}${trials ? ` (trials: ${JSON.stringify(trials)})` : ''}`,
    };
  }

  return {
    kind: 'signed-in',
    session: created.session,
    email: created.email,
    tier,
    products,
    trials,
    note: personaId === 'pro-trial'
      ? `fresh account, trials started, holds ${products.join(' and ')}`
      : 'fresh account, no entitlement, as this persona requires',
  };
}

/** The localStorage value supabase-js expects, for seeding before first paint. */
export function sessionSeed(session) {
  return {
    key: AUTH_STORAGE_KEY,
    value: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
      expires_in: session.expires_in ?? 3600,
      token_type: 'bearer',
      user: session.user,
    }),
  };
}

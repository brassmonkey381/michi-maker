/**
 * Disposable accounts. The rig mints its own rather than sharing one fixture.
 *
 * WHY MINTING BEATS SHARING, learned the hard way on 2026-09-21: a single shared test account
 * carries state between runs. Start a trial on it and it is a PRO account forever after, so every
 * later free-tier assertion is either wrong or skipped. A fresh account per run has no history, and
 * the guest -> free -> pro-trial ladder is exactly what a fresh account walks up.
 *
 * NO SERVICE ROLE NEEDED, which is the part that keeps the secrets allowlist tight. The project has
 * `disable_signup: false` and `mailer_autoconfirm: true`, so POST /auth/v1/signup with the ordinary
 * publishable key returns a usable session immediately. The rig never holds a key that can bypass
 * RLS.
 *
 * WHAT THE RIG CANNOT DO IS DELETE. Removing an auth row needs the management token, which this rig
 * deliberately cannot read. Every account it creates is appended to qa/state/accounts.jsonl and
 * swept separately by michi's existing purge, which already takes an email prefix:
 *
 *   node qa/rig.mjs accounts        # what this machine has created, and the sweep command
 *
 * The `qa-rig-` prefix is the contract between the two. Do not shorten it and do not reuse it for
 * anything a human owns.
 */
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPABASE_URL } from './targets.mjs';
import { read as readSecrets } from './secrets.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = join(HERE, '..', 'state');
const LEDGER = join(STATE, 'accounts.jsonl');

/** The prefix michi's purge sweeps on. Every account the rig makes carries it. */
export const RIG_PREFIX = 'qa-rig-';

/** example.com is reserved by RFC 2606 and cannot receive mail, which is the point. */
const DOMAIN = 'example.com';

function credentials(tag) {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `${RIG_PREFIX}${tag}-${unique}@${DOMAIN}`,
    // Long and mixed, to clear any password policy without ever being memorable or reused.
    password: `Qa!${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}A9`,
  };
}

function record(row) {
  mkdirSync(STATE, { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
}

/**
 * Create a fresh signed-in account. Returns a session shaped like the password grant's, so every
 * caller downstream treats it identically.
 */
export async function createAccount(fetchFn, tag, runId) {
  const anon = readSecrets().APP_PUBLISHABLE_KEY;
  if (!anon) throw new Error('no APP_PUBLISHABLE_KEY, so no account can be created');

  const { email, password } = credentials(tag);
  const res = await fetchFn(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`signup returned ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const session = await res.json();
  if (!session.access_token) {
    throw new Error('signup returned no session, so email confirmation must now be required; the persona engine needs a different path');
  }

  record({ at: new Date().toISOString(), runId, tag, email, uid: session.user?.id ?? null });
  return { session, email };
}

/**
 * Start both apps' PRO trials on an account. Three days each, one per account forever.
 *
 * BOTH, deliberately: michi's grants `tier_pro` and tcgscan's grants `tcgscan_pro`, and a persona
 * that holds only one of them exercises PRO on one site and Free on the other, which is a confusing
 * half-state to write checks against.
 */
export async function startTrials(fetchFn, session) {
  const anon = readSecrets().APP_PUBLISHABLE_KEY;
  const headers = { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  const out = {};

  for (const [app, rpc] of [['michi', 'start_pro_trial'], ['tcgscan', 'start_tcgscan_pro_trial']]) {
    const res = await fetchFn(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_surface: 'qa-rig' }),
    });
    out[app] = res.ok ? String(await res.json()) : `failed ${res.status}: ${(await res.text()).slice(0, 160)}`;
  }
  return out;
}

/** The account's live entitlement rows, read as the account. Used to VERIFY rather than assume. */
export async function readEntitlements(fetchFn, session) {
  const anon = readSecrets().APP_PUBLISHABLE_KEY;
  const res = await fetchFn(`${SUPABASE_URL}/rest/v1/entitlements?select=product,expires_at,source,interval`, {
    headers: { apikey: anon, Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) return [];
  const rows = await res.json();
  const now = Date.now();
  return rows.filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
}

/** Every account this machine has created, newest last. */
export function created() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * THE ALLOWLIST PARSER. The rig reads tcgscan.secrets through this module and no other.
 *
 * `ALLOWED` is the whole security model for credentials: there is no code path here that returns
 * STRIPE_SECRET_KEY, APP_SECRET_KEY (the service role), SUPABASE_ACCESS_TOKEN (management SQL, which
 * bypasses RLS) or UNSUBSCRIBE_SECRET. A suite that wants one cannot get one by asking differently,
 * because `read()` filters on the way OUT of the file parse, not at the call site.
 *
 * Three keys are enough for every read-only suite: the publishable key to talk to PostgREST as an
 * ordinary client, and the test account's credentials to mint a signed-in session.
 *
 * Values are never printed, never logged, never returned from an HTTP route, and `assertNotLeaked`
 * is the runtime check that they never reach a browser context either.
 */
import { readFileSync } from 'node:fs';

const SECRETS_PATH = 'C:/Users/Brian/source/repos/tcgscan/tcgscan.secrets';

/**
 * The only key names this rig may ever hold.
 *
 * DO NOT ADD A KEY HERE to unblock a suite. A suite that needs the service role or the management
 * token is a suite that writes to the one shared production project, and that belongs behind the
 * persona engine and its write budget, not behind a one-line edit to this array.
 */
const ALLOWED = Object.freeze(['APP_PUBLISHABLE_KEY', 'MICHI_TEST_EMAIL', 'MICHI_TEST_PASSWORD']);

/** Key names that exist in the file and must never be loaded, named so the refusal is explicit. */
const REFUSED = Object.freeze(['STRIPE_SECRET_KEY', 'APP_SECRET_KEY', 'SUPABASE_ACCESS_TOKEN', 'UNSUBSCRIBE_SECRET']);

let cache = null;

/** The allowlisted secrets, or `{}` if the file is missing. Never throws on a missing key. */
export function read() {
  if (cache) return cache;
  let raw = '';
  try {
    raw = readFileSync(SECRETS_PATH, 'utf8');
  } catch {
    cache = {};
    return cache;
  }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!ALLOWED.includes(key)) continue;
    out[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  cache = Object.freeze(out);
  return cache;
}

/** Which allowlisted keys are present, for `rig doctor`. Names only, never values. */
export function status() {
  const have = read();
  return {
    path: SECRETS_PATH,
    allowed: ALLOWED.map((k) => ({ key: k, present: Boolean(have[k]) })),
    refused: REFUSED.slice(),
  };
}

/**
 * Refuse to let a secret value reach a browser. Called by guard.mjs on every init-script payload,
 * every localStorage seed and every URL before navigation.
 *
 * A short value is ignored: MICHI_TEST_EMAIL is an ordinary string that legitimately appears in a
 * signed-in DOM, so scanning for it would fire on every page. Only credential-shaped values count.
 */
export function assertNotLeaked(text, where) {
  if (typeof text !== 'string' || !text) return;
  for (const [key, value] of Object.entries(read())) {
    if (key === 'MICHI_TEST_EMAIL') continue;
    if (value && value.length >= 16 && text.includes(value)) {
      throw new Error(`SECRET LEAK: ${key} would have reached ${where}. Aborting the run.`);
    }
  }
}

export const ALLOWED_KEYS = ALLOWED;

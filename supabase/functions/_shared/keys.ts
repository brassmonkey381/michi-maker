/**
 * Supabase API keys for edge functions, preferring the NEW key system over the legacy injected ones.
 *
 * WHY THIS EXISTS. Every function here reads `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`,
 * which the platform injects automatically. Those are *legacy* keys: JWTs signed with the project's
 * legacy JWT secret. Revoking that secret — the whole point of rotating it — stops them validating,
 * and every function that uses one starts failing. The functions themselves are fine: none verifies
 * a JWT by hand (they call `auth.getUser(token)`, which validates server-side and is indifferent to
 * the signing algorithm). It is only these two injected VALUES that die.
 *
 * The replacements are the new-style API keys, which are not JWTs and are therefore unaffected by
 * signing-key rotation:
 *   secret key       sb_secret_...       replaces service_role  (bypasses RLS — never client-side)
 *   publishable key  sb_publishable_...  replaces anon
 *
 * MIGRATION ORDER, which is why these are fallbacks rather than a swap. Deploying this changes
 * nothing on its own: with no new secrets set, each getter returns exactly the legacy value it
 * returns today. Set `SUPABASE_SECRET_KEY` / `SUPABASE_PUBLISHABLE_KEY` and the functions switch
 * over on the next invocation. Only once that is verified is it safe to revoke the legacy key. A
 * hard swap would have required the secrets to be in place first, turning a reversible step into a
 * flag day.
 */

/** Service-role-equivalent key. Bypasses RLS — server-side only, never returned to a caller. */
export function secretKey(): string {
  const k = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!k) throw new Error('no secret key: set SUPABASE_SECRET_KEY (sb_secret_...)');
  return k;
}

/** Anon-equivalent key, for the RLS-respecting client used to resolve a caller from their token. */
export function publishableKey(): string {
  const k = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!k) throw new Error('no publishable key: set SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)');
  return k;
}

/** True once this deployment is off the legacy keys entirely — handy for a health check. */
export function usingNewKeys(): boolean {
  return !!Deno.env.get('SUPABASE_SECRET_KEY') && !!Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
}

/**
 * The sharing-default rules: when the rights prompt is due, and whether a new binder starts
 * public. Pure data logic (no React, no Supabase) so `npm test` pins the cadence and the
 * default, and the component and the store cannot drift from each other.
 *
 * THE MODEL (owner decision, 2026-08-26): binders default PUBLIC for signed-in accounts that
 * have accepted the one-time, account-level rights attestation (profiles.rights_attested_at).
 * Guests never default public and are never prompted; declining keeps binders private-by-default
 * until the user accepts, which they can do from Settings at any time. The prompt itself is
 * offered on the first binder and then at most every PROMPT_GAP_MS, with the last showing
 * persisted (profiles.rights_prompt_at) so devices share one cadence.
 *
 * AND A NAME COMES FIRST. Both rules also require a claimed @username. A new account meets the
 * UsernameGate and the rights prompt in the same breath, and the gate is a modal that another
 * modal can sit on top of, so without this an account could turn on sharing before it had any
 * public identity. Every feed names the author from profiles.username, so what that produced was
 * a public binder credited to nobody, whose owner is also unfindable in people search (the
 * search RPC excludes username-less profiles). Nothing in the wild had hit it, because sharing
 * used to be opt-in and a name is claimed at first sign-in; default-public is what makes the
 * order matter.
 */

/** Re-offer the attestation at most this often. "Every 7 days or so", owner-specified. */
export const PROMPT_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export interface RightsFields {
  username?: string | null;
  rights_attested_at?: string | null;
  rights_prompt_at?: string | null;
}

/** Should the attestation prompt open for this profile right now? */
export function rightsPromptDue(profile: RightsFields | null | undefined, now = Date.now()): boolean {
  if (!profile) return false;
  // Not before they have a name to share under: the UsernameGate is the prompt that comes first.
  if (!profile.username) return false;
  if (profile.rights_attested_at) return false;
  if (!profile.rights_prompt_at) return true; // never shown: this is the first-binder moment
  const last = Date.parse(profile.rights_prompt_at);
  return Number.isNaN(last) || now - last >= PROMPT_GAP_MS;
}

/** Does a NEW binder start public for this account? (Copies never do; cloneBinder owns that.) */
export function defaultBinderPublic(opts: {
  attestedAt: string | null | undefined;
  /** auth.users.is_anonymous: guests never default public. */
  isAnonymous: boolean;
  /** profiles.username. A binder credited to nobody is not a binder worth publishing. */
  username?: string | null;
  isDemo?: boolean;
  isExample?: boolean;
}): boolean {
  return (
    !!opts.attestedAt
    && !opts.isAnonymous
    && !!opts.username
    && !opts.isDemo
    && !opts.isExample
  );
}

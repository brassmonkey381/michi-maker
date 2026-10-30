/**
 * IS THIS SIGN-IN A NEW ACCOUNT? Decided on the RETURN from a provider, from what the session
 * says, never at the tap (analytics-studio, 2026-10-29: account.created used to fire when a Google
 * sign-in STARTED, so every abandoned hop counted as a signup; all three "Reddit accounts" that day
 * were anonymous users with no identity).
 *
 * A provider identity minted within the last few minutes is a new sign-up or a guest upgrade; an
 * older one is a returning user, who gets auth.login instead. The password path records itself
 * at signUp and is ignored here (provider 'email'). Pure, so `node --test` reaches it.
 */
export interface IdentityLike {
  provider?: string | null;
  created_at?: string | null;
}

export interface UserLike {
  id: string;
  created_at?: string | null;
  is_anonymous?: boolean | null;
  identities?: IdentityLike[] | null;
}

/** How long after an identity is minted the return still counts as its creation. */
export const FRESH_WINDOW_MS = 10 * 60 * 1000;

export interface FreshIdentity {
  via: 'oauth' | 'guest_upgrade';
  provider: string;
}

export function freshIdentity(user: UserLike, now = Date.now()): FreshIdentity | null {
  if (!user || user.is_anonymous) return null;
  const minted = (user.identities ?? [])
    .filter((i) => i.provider && i.provider !== 'email' && i.created_at)
    .map((i) => ({ provider: String(i.provider), at: Date.parse(String(i.created_at)) }))
    .filter((i) => Number.isFinite(i.at) && now - i.at >= 0 && now - i.at < FRESH_WINDOW_MS)
    .sort((a, b) => b.at - a.at)[0];
  if (!minted) return null;
  // The user row itself is as new as the identity on a plain sign-up; a guest upgrade links the
  // identity onto an older anonymous row.
  const userAt = Date.parse(String(user.created_at ?? ''));
  const userIsNew = Number.isFinite(userAt) && now - userAt < FRESH_WINDOW_MS;
  return { via: userIsNew ? 'oauth' : 'guest_upgrade', provider: minted.provider };
}

/**
 * Cross-app SSO handoff (michi ⇄ tcgscan) — client side of the `auth-handoff` edge function.
 * Both apps share one Supabase project, but browsers isolate sessions per origin, so a signed-in
 * michi member landing on tcgscan.ai is signed out there. The handoff carries the session across:
 *
 *  1. `mintHandoffHash()` asks auth-handoff for a ONE-TIME magic-link token hash for the
 *     caller's own account (JWT-verified server-side; guests and email-less accounts refused).
 *  2. The caller appends it to the sibling URL as a #fragment (`#th=<hash>`) — fragments never
 *     reach servers, logs, or referrer headers.
 *  3. The sibling app redeems it on load — see `redeemHandoffHashFromLocation()`, used by BOTH
 *     apps' /plans pages (the reverse direction works identically).
 *
 * Everything degrades gracefully: minting fails → callers navigate to the plain URL and the
 * visitor signs in by hand (the plans-page banner has a sign-in button for exactly that).
 */
import { Platform } from 'react-native';

import { requireSupabase } from '@/lib/supabase';

/** Mint a one-time handoff token hash for the current signed-in (non-guest) session.
 *  Returns null — never throws — when the session can't mint one (guest, signed out, error):
 *  the bundle flow falls back to the plain link. */
export async function mintHandoffHash(): Promise<string | null> {
  try {
    const supabase = requireSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session || session.user.is_anonymous) return null;
    const { data, error } = await supabase.functions.invoke('auth-handoff', {
      body: {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) return null;
    return (data as { tokenHash?: string })?.tokenHash ?? null;
  } catch {
    return null;
  }
}

/** Append a minted hash to a sibling-app URL (no-op passthrough for a null hash). */
export function withHandoffHash(url: string, tokenHash: string | null): string {
  return tokenHash ? `${url}#th=${encodeURIComponent(tokenHash)}` : url;
}

/**
 * Redeem an inbound `#th=` fragment (web only): verify the OTP hash into a real session, then
 * scrub the fragment from the URL/history so it can't be re-read or shared onward. Call once on
 * mount of the arrival page. Returns true when a session was established.
 *
 * Already signed in → the fragment is scrubbed but NOT redeemed (never silently switch an
 * active session; the visitor can sign out and use the banner's button if they meant to).
 */
export async function redeemHandoffHashFromLocation(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const match = /[#&]th=([^&]+)/.exec(window.location.hash);
  if (!match) return false;
  // Scrub first: whatever happens next, the single-use hash must not linger in the URL bar
  // or history where a copied link would carry it onward.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    const supabase = requireSupabase();
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session && !sessionData.session.user.is_anonymous) return false;
    const { error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash: decodeURIComponent(match[1]),
    });
    return !error;
  } catch {
    return false;
  }
}

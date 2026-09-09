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

/**
 * Whether THIS page load arrived carrying a handoff. Read once, at module load, before anything
 * has scrubbed the fragment: the auth store needs the answer synchronously (see below) and the
 * root layout's scrub runs in an effect, which may come first or second depending on tree order.
 */
const ARRIVED_WITH_HANDOFF =
  Platform.OS === 'web' && typeof window !== 'undefined' && /[#&]th=/.test(window.location.hash);

export function handoffPending(): boolean {
  return ARRIVED_WITH_HANDOFF;
}

/** Append a minted hash to a sibling-app URL (no-op passthrough for a null hash). */
export function withHandoffHash(url: string, tokenHash: string | null): string {
  return tokenHash ? `${url}#th=${encodeURIComponent(tokenHash)}` : url;
}

/**
 * Redeem an inbound `#th=` fragment (web only): verify the OTP hash into a real session, then
 * scrub the fragment from the URL/history so it can't be re-read or shared onward. Called once on
 * load from the root layout (every arrival page) and again by /plans for its tier refresh; the
 * synchronous scrub makes the second call a no-op. Returns true when a session was established.
 *
 * Already signed in → the fragment is scrubbed but NOT redeemed (never silently switch an
 * active session; the visitor can sign out and use the banner's button if they meant to).
 */
export function redeemHandoffHashFromLocation(): Promise<boolean> {
  // SINGLE-FLIGHT. The auth store's bootstrap and the root layout both ask, in an order React
  // does not promise; whichever asks second joins the first rather than finding a scrubbed URL
  // and answering "no handoff here" while the real redeem is still in flight.
  if (!redeeming) redeeming = redeemOnce();
  return redeeming;
}
let redeeming: Promise<boolean> | null = null;

async function redeemOnce(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const match = /[#&]th=([^&]+)/.exec(window.location.hash);
  if (!match) return false;
  // Scrub first: whatever happens next, the single-use hash must not linger in the URL bar
  // or history where a copied link would carry it onward. Expo Router writes its own idea of
  // the location back to the URL as it settles on first load, which put the fragment straight
  // back (seen on every arrival page, /plans included), so the scrub is repeated after it has.
  const scrub = () => {
    if (/[#&]th=/.test(window.location.hash)) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };
  scrub();
  for (const ms of [250, 1000, 3000]) setTimeout(scrub, ms);
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

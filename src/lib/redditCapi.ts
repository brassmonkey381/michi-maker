/**
 * REDDIT CONVERSIONS API, the client half (owner, 2026-10-30, via analytics-studio). The pixel
 * (lib/redditPixel) sends SignUp from the browser and loses about one in six to blockers; the
 * reddit-capi edge function sends the same SignUp from the server with the same conversion_id (the
 * uid), and Reddit dedupes the pair. This asks it to.
 *
 * LIBERAL HERE, STRICT THERE. The function keeps a once-per-account row and refuses guests, so this
 * may be called on every fresh non-anonymous sign-in without counting anything twice: a guest
 * upgrade (same uid), an OAuth return, a password account's first sign-in after confirming its
 * email (which the client cannot tell from a later sign-in within the window, and does not need
 * to). One call per uid per page load, fire and forget, never awaited by anything that matters.
 *
 * Carries the click id Reddit put on the landing URL (rdt_cid, kept with the campaign params in
 * lib/analytics and across the OAuth hop) so the conversion attributes to the ad click.
 */
import { landingCampaignParams } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

/** A plain sign-up, or an older account seen signing in for the first time after confirming. */
export const RECENT_ACCOUNT_MS = 7 * 24 * 3600 * 1000;

const asked = new Set<string>();

/** Is this user's row young enough that a sign-in may be its first? */
export function recentlyCreated(user: { created_at?: string | null }, now = Date.now()): boolean {
  const at = Date.parse(String(user.created_at ?? ''));
  return Number.isFinite(at) && now - at >= 0 && now - at < RECENT_ACCOUNT_MS;
}

export function sendRedditSignUp(uid: string): void {
  if (!supabase || asked.has(uid)) return;
  asked.add(uid);
  const clickId = landingCampaignParams()?.rdt_cid;
  void supabase.functions
    .invoke('reddit-capi', { body: { ...(clickId ? { click_id: clickId } : {}), event_at: new Date().toISOString() } })
    .catch(() => {
      // A Reddit outage, a missing function, a blocked request: nothing here matters to the user.
    });
}

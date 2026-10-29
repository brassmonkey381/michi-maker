import { Platform } from 'react-native';

import { landingCampaignParams } from '@/lib/analytics';

/**
 * First-visit landing gate.
 *
 * `/` sends brand-new WEB visitors to the marketing page at `/welcome` exactly until they
 * click through into the app. We gate on "has ever entered the app" rather than auth state
 * because the silent guest sign-in (see store/auth) means even a first-time visitor holds an
 * anonymous session within a second of load — auth state can't distinguish a newcomer from a
 * regular. Native installs never see the landing page: the store listing already sold them.
 */
const LANDING_SEEN_KEY = 'michi.landing.seen';

export function shouldShowLanding(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return !window.localStorage.getItem(LANDING_SEEN_KEY);
  } catch {
    // Storage unavailable (privacy mode) — never trap the visitor on the landing page.
    return false;
  }
}

/**
 * Paid/social arrivals skip the marketing page. Someone who clicked an ad has already seen the
 * pitch; the first Reddit ad day (2026-10-29) put 243 tagged visitors on /welcome for a median
 * 12 seconds, and about 15 of them reached a second page. Keyed on utm_source, never on the
 * creative `code`, so a new ad under the same source is covered without a release.
 */
const SKIP_LANDING_SOURCES = new Set(['reddit']);

/**
 * Where a skipped arrival goes: My Binders with `open=new`, which presses "+ New binder" for them
 * (my-binders.tsx) - a fresh binder, straight into the editor. Owner, 2026-10-29: "maximize the
 * chances of them building something". Every such visitor is a brand-new guest, so this creates
 * one empty guest binder per ad click; binder.add { isDemo } fires for it like any other.
 */
export const LANDING_SKIP_TARGET = '/my-binders?open=new';

/**
 * The route a FIRST-TIME tagged visitor should land on instead of /welcome, or null to show the
 * landing page as usual. Null on native, for untagged visitors, and for anyone who has already
 * entered the app (shouldShowLanding). The caller marks the landing seen and records landing.skip.
 */
export function landingSkipTarget(): typeof LANDING_SKIP_TARGET | null {
  if (!shouldShowLanding()) return null;
  const source = landingCampaignParams()?.utm_source?.toLowerCase();
  return source && SKIP_LANDING_SOURCES.has(source) ? LANDING_SKIP_TARGET : null;
}

/** Call from any landing CTA that enters the app, BEFORE navigating. */
export function markLandingSeen(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANDING_SEEN_KEY, '1');
  } catch {
    // Ignore — shouldShowLanding() fails open the same way.
  }
}

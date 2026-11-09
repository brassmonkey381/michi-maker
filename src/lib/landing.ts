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
 * NO LONGER THE DEFAULT since 2026-11-09 (MIC-027): see WIZARD_FOR below. Kept for the flag and for
 * links that carry `open=seeded` themselves.
 *
 * Where a skipped arrival goes: My Binders with `open=seeded`, which presses "+ New binder" for
 * them (my-binders.tsx) and lands them in the editor on a page that already holds three themed
 * cards picked by the ad's creative code (data/seedPages), with the walkthrough pointing at
 * Complete. Owner, 2026-10-29: "maximize the chances of them building something"; 2026-10-30:
 * start with three themed cards, because nine empty pockets lost 387 of 435 arrivals. Every such
 * visitor is a brand-new guest; binder.add { seeded: true, theme } fires for the binder.
 * `open=new` (an empty binder) still works for links that carry it.
 */
export const LANDING_SKIP_TARGET = '/my-binders?open=seeded';

/**
 * (History: the wizard ARM, 2026-11-07, sent only campaign michi_wizard_2026_11 here; since
 * MIC-027 every Reddit arrival comes.)
 * THE WIZARD ARM (analytics-studio work order, owner-approved, 2026-11-07): the Reddit ad group
 * `michi_wizard_2026_11` is an A/B read of the seeded binder against the /new-binder wizard on the
 * same phone audience, so arrivals tagged with it go to the wizard instead. Keyed on utm_campaign
 * (exact, case-insensitive) under the same utm_source gate; every other reddit campaign keeps the
 * seeded binder. No viewport special-casing: the ad group is phone-only, a desktop click is rare
 * and takes the same path. landing.skip fires here too, with `to` naming the route.
 */
export const LANDING_WIZARD_TARGET = '/new-binder';

/**
 * WHICH REDDIT ARRIVALS GET THE WIZARD (MIC-027, 2026-11-09). Owner: "I want to go all wizard from
 * here on out"; analytics-studio then flagged that desktop is the one converting channel, on the
 * seeded binder, and the wizard was never tested on desktop ads. So it is ONE switch:
 *   'all'   every first-time Reddit arrival, any campaign, any device, goes to the wizard;
 *   'phone' phones go to the wizard, desktops keep the seeded binder;
 *   'none'  everyone keeps the seeded binder (the old default).
 * utm_* stay in the address and in landingCampaignParams either way, so attribution is unchanged.
 */
export const WIZARD_FOR: 'all' | 'phone' | 'none' = 'phone'; // owner 2026-11-09: "wizard phone only for now"

/** A phone, as the landing sees it: a narrow window or a mobile browser. */
function isPhoneVisit(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return window.innerWidth < 768 || /Mobi|Android|iPhone|iPod/i.test(ua);
}

/**
 * The route a FIRST-TIME tagged visitor should land on instead of /welcome, or null to show the
 * landing page as usual. Null on native, for untagged visitors, and for anyone who has already
 * entered the app (shouldShowLanding). The caller marks the landing seen and records landing.skip.
 */
export function landingSkipTarget(): typeof LANDING_SKIP_TARGET | typeof LANDING_WIZARD_TARGET | null {
  if (!shouldShowLanding()) return null;
  const params = landingCampaignParams();
  const source = params?.utm_source?.toLowerCase();
  if (!source || !SKIP_LANDING_SOURCES.has(source)) return null;
  const campaign = params?.utm_campaign?.toLowerCase();
  void campaign; // every campaign takes the same path since MIC-027; attribution rides utm_*
  const wizard = WIZARD_FOR === 'all' || (WIZARD_FOR === 'phone' && isPhoneVisit());
  return wizard ? LANDING_WIZARD_TARGET : LANDING_SKIP_TARGET;
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

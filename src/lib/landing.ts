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
 * THE WIZARD ARM (analytics-studio work order, owner-approved, 2026-11-07): the Reddit ad group
 * `michi_wizard_2026_11` is an A/B read of the seeded binder against the /new-binder wizard on the
 * same phone audience, so arrivals tagged with it go to the wizard instead. Keyed on utm_campaign
 * (exact, case-insensitive) under the same utm_source gate; every other reddit campaign keeps the
 * seeded binder. No viewport special-casing: the ad group is phone-only, a desktop click is rare
 * and takes the same path. landing.skip fires here too, with `to` naming the route.
 */
const WIZARD_CAMPAIGNS = new Set(['michi_wizard_2026_11']);
export const LANDING_WIZARD_TARGET = '/new-binder';

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
  return campaign && WIZARD_CAMPAIGNS.has(campaign) ? LANDING_WIZARD_TARGET : LANDING_SKIP_TARGET;
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

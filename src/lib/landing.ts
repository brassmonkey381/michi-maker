import { Platform } from 'react-native';

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

/** Call from any landing CTA that enters the app, BEFORE navigating. */
export function markLandingSeen(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANDING_SEEN_KEY, '1');
  } catch {
    // Ignore — shouldShowLanding() fails open the same way.
  }
}

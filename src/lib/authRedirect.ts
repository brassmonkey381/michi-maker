/**
 * The redirect URL Supabase sends the user back to after an OAuth or email-link flow.
 *
 * - Native (iOS/Android): a deep link into the app via the `pokemichi://` scheme
 *   (see app.json `scheme`). expo-web-browser hands this URL back to us directly.
 * - Web: the current site origin, so the browser returns to the running app.
 *
 * THIS IS ORIGIN-SENSITIVE, and the failure is silent. The URL built here must be in the
 * project's allow-list (Supabase → Authentication → URL Configuration → Redirect URLs, see
 * docs/DATA-SERVER.md). An unlisted value is not rejected with an error — Supabase quietly
 * discards it and sends the user to the project's SITE URL instead. That is how signing in from
 * www.michi-maker.com landed people on http://localhost:3000/?code=…: `www` was a second live
 * origin, only the apex host was allow-listed, and Site URL was still the local default.
 *
 * So every origin the app is served from needs an entry — apex, preview.michi-maker.com, and the
 * local dev port. `www` no longer does: vercel.json now 308s it to the apex host before the app
 * loads, which is also what og:url and the canonical tag have always claimed.
 */
import * as Linking from 'expo-linking';

/** Path the auth providers redirect back to. Handled in-app, not a router route. */
export const AUTH_CALLBACK_PATH = 'auth-callback';

export function authRedirectUrl(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

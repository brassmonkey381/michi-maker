/**
 * The redirect URL Supabase sends the user back to after an OAuth or email-link flow.
 *
 * - Native (iOS/Android): a deep link into the app via the `pokemichi://` scheme
 *   (see app.json `scheme`). expo-web-browser hands this URL back to us directly.
 * - Web: the current site origin, so the browser returns to the running app.
 *
 * The matching URL must be added to the project's allow-list in
 * Supabase → Authentication → URL Configuration → Redirect URLs (see docs/DATA-SERVER.md).
 */
import * as Linking from 'expo-linking';

/** Path the auth providers redirect back to. Handled in-app, not a router route. */
export const AUTH_CALLBACK_PATH = 'auth-callback';

export function authRedirectUrl(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

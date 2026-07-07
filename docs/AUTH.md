# Auth & user accounts

poke-michi / tcgscan-app authenticate against the app's own Supabase project,
**tcgscan-michi-maker** (org "TCGScan", ref `piikwvntldytjejxmcla`) — separate from the
read-only `tcgscan-data` catalogue server. All user data (profiles + saved binders) lives here
under Row Level Security.

## The pieces (in the app)

| Concern | Where |
|---|---|
| Session lifecycle + every sign-in method | `src/store/auth.tsx` (`AuthProvider`, `useAuth()`) |
| Auth UI (sign in / create / upgrade / profile) | `src/components/auth/AuthSheet.tsx` |
| Header entry point (avatar / "Sign in") | `src/components/auth/AccountButton.tsx` |
| Redirect URL for OAuth / email links | `src/lib/authRedirect.ts` (deep link `pokemichi://auth-callback`) |
| Client (PKCE flow, AsyncStorage session) | `src/lib/supabase.ts` |
| Per-user binder load/persist | `src/store/binders.tsx` → `src/data/binderRepo.ts` |

Supported methods: **email + password**, a **6-digit email code** (passwordless OTP), and
**Google / Apple OAuth**. Plus an anonymous **guest** mode.

### Guest mode & upgrade

On first launch (when enabled) the app signs in **anonymously** so binders save immediately. A
guest can later *upgrade* to a real account — via email+password (`auth.updateUser`) or by linking
Google/Apple (`auth.linkIdentity`). Both keep the **same `user.id`**, so the guest's binders carry
over with no migration. (Email-code upgrade is intentionally not offered to guests, because
verifying a code switches to a different user and would orphan their binders.)

If anonymous sign-ins are disabled, the app still runs — it just starts signed-out and users sign
in for real. The store degrades gracefully (`anonymousUnavailable`).

## Required dashboard configuration

The database schema is applied and verified. These are the **console-only** steps (no code)
needed to light up each method — do them in the
[Supabase dashboard](https://supabase.com/dashboard/project/piikwvntldytjejxmcla):

### 1. Redirect URLs — Authentication → URL Configuration → Redirect URLs
Add every URL the providers may return to:
- `pokemichi://auth-callback` — native (iOS/Android) deep link
- `http://localhost:8081/auth-callback` — local web dev
- `https://michi-maker.com/auth-callback` (and any other deployed web origins)

### 2. Anonymous guest mode — Authentication → Sign In / Providers → Anonymous
Toggle **ON** to enable the guest flow. *(Currently OFF — verified 2026-07-07.)* Leave OFF to
require sign-in.

### 3. Email — Authentication → Providers → Email
Enabled by default. Decide whether to keep **"Confirm email"** on (users must click a link before
first sign-in — the app surfaces "check your email" in that case). The 6-digit code path uses the
same email OTP; customise the template under **Authentication → Email Templates** if desired.

### 4. Google — Authentication → Providers → Google
Create an OAuth client in the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
add `https://piikwvntldytjejxmcla.supabase.co/auth/v1/callback` as an authorized redirect URI, then
paste the client ID + secret into the Supabase Google provider and enable it.

### 5. Apple — Authentication → Providers → Apple
Requires an Apple Developer account: a Services ID + key, with the same
`…/auth/v1/callback` return URL. (Apple Sign-In is required by App Store review if you ship other
social logins on iOS.) Enable the provider and paste the credentials.

> The app code needs no changes for any of the above — providers are configured server-side and the
> client discovers them at sign-in time. OAuth buttons simply error until their provider is enabled.

## Security notes

- Only the **publishable** key ships in the client (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). The
  secret / service-role key is never referenced from app code.
- Every `public` table has RLS; writes are owner-scoped via `(select auth.uid()) = owner_id` (child
  tables check ownership through their parent binder). See `supabase/migrations` and `supabase/README.md`.
- `raw_user_meta_data` (e.g. `display_name`) is user-editable and is used only to prefill the
  profile row — never for authorization.

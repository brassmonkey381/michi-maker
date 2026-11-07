/**
 * `/auth-callback` — the web return target for OAuth / email-link sign-in.
 *
 * On web the provider does a full-page redirect back to `<origin>/auth-callback?code=…`. The
 * Supabase client (`detectSessionInUrl: true`, PKCE) exchanges that code for a session on load and
 * strips the query — but the PATH stays `/auth-callback`, which used to hit Expo Router's
 * "Unmatched Route" screen: a dead end with the session silently established behind it. This route
 * gives that path a real home: finalize the session (belt-and-suspenders exchange in case the code
 * survives to mount), then replace to `/`. A safety timeout guarantees we never strand the user.
 *
 * Native never lands here — its providers return to the `pokemichi://auth-callback` deep link,
 * handled by the listener in `store/auth.tsx`. If somehow reached on native, this just goes home.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSize, Palette, Radius, Spacing, Weight } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { consumeAuthReturn } from '@/lib/authReturn';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';

/**
 * The provider's refusal, when there is one, from the query or the hash. A guest who taps "Continue
 * with Google" is LINKED onto their anonymous account (keeps the binder, keeps the uid); when that
 * Google account already belongs to a michi account, GoTrue refuses the link and sends the browser
 * back with error_code=identity_already_exists and no session change. That person wanted in, and
 * they have an account: sign them into it (one more hop, which Google remembers) instead of
 * leaving them a guest on the shelf with no word of what happened.
 */
function callbackError(): { code: string; description: string } | null {
  if (typeof window === 'undefined') return null;
  const read = (s: string) => new URLSearchParams(s.replace(/^[?#]/, ''));
  for (const p of [read(window.location.search), read(window.location.hash)]) {
    const code = p.get('error_code') ?? p.get('error');
    if (code) return { code, description: p.get('error_description') ?? '' };
  }
  return null;
}
const RETRY_KEY = 'michi.auth.callbackRetried';

/**
 * WHAT WENT WRONG, SAID OUT LOUD (owner, 2026-11-07: "I still cant log in from a guest account").
 * A return that ended without an account used to go home in silence, the guest looking as if
 * nothing had been tried, and nothing recorded why. `stage` names the step for the studio:
 *   refused   the provider's return carried an error, on the retry or on any other code
 *   exchange  the code came back and could not be swapped for a session
 *   no_session  nothing failed out loud and there is still no account
 */
type CallbackFailure = { stage: 'refused' | 'exchange' | 'no_session'; code: string; message: string };

export default function AuthCallback() {
  const router = useRouter();
  const auth = useAuth();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [failed, setFailed] = useState<CallbackFailure | null>(null);
  const leave = useRef<() => void>(() => {});
  const failed0 = useRef(false);

  useEffect(() => {
    let done = false;
    // Back to where the sign-in started when a note says so (lib/authReturn: the binder a guest
    // was building, with the sheet that asked for the account), else home as before.
    const goHome = () => {
      if (done && !failed0.current) return;
      done = true;
      failed0.current = false;
      const back = consumeAuthReturn();
      // `resume=1` tells the binder route this is a return, so a binder that is gone (a sign-in to
      // a different account leaves a guest's binders behind) falls back to the shelf, not to 404.
      router.replace((back ? `${back}${back.includes('?') ? '&' : '?'}resume=1` : '/') as Href);
    };
    leave.current = goHome;
    let failure: CallbackFailure | null = null;
    (async () => {
      try {
        const refused = callbackError();
        if (refused?.code === 'identity_already_exists' && supabase) {
          let retried = false;
          try {
            retried = sessionStorage.getItem(RETRY_KEY) === '1';
            sessionStorage.setItem(RETRY_KEY, '1');
          } catch {
            // no storage: still try once; a loop needs the flag to be missing twice in a row
          }
          if (!retried) {
            track('auth.link_exists', { provider: 'google' });
            const r = await auth.signInWithOAuth('google');
            if (!r.error) {
              done = true; // the page is leaving for the provider again
              return;
            }
          }
        }
        if (refused) failure = { stage: 'refused', code: refused.code, message: refused.description };
        try {
          sessionStorage.removeItem(RETRY_KEY);
        } catch {
          // ignore
        }
        // `detectSessionInUrl` usually already consumed the code by mount; if it survived here,
        // exchange it ourselves. A used/absent code just rejects — harmless, we still go home.
        if (supabase && typeof code === 'string' && code) {
          // The client's own exchange reports here; a second try after it worked only says the
          // code is used, so the first error is the one worth keeping.
          const first = (await supabase.auth.initialize()).error;
          const second = await supabase.auth
            .exchangeCodeForSession(code)
            .then((r) => r.error)
            .catch((e: unknown) => e as Error);
          const user = (await supabase.auth.getSession()).data.session?.user;
          if (!user || user.is_anonymous) {
            const e = first ?? second;
            failure = e
              ? { stage: 'exchange', code: (e as { code?: string }).code ?? e.name, message: e.message }
              : { stage: 'no_session', code: 'none', message: '' };
          }
        }
      } catch (e) {
        failure = { stage: 'exchange', code: 'threw', message: e instanceof Error ? e.message : String(e) };
      } finally {
        if (failure && !done) {
          done = true;
          failed0.current = true;
          track('auth.callback_failed', { provider: 'google', stage: failure.stage, code: failure.code, message: failure.message.slice(0, 160) });
          setFailed(failure);
        } else {
          goHome();
        }
      }
    })();
    // Never strand on this screen, unless it has something to say.
    const safety = setTimeout(() => {
      if (!failed0.current) goHome();
    }, 4000);
    return () => clearTimeout(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auth is read once at mount
  }, [code, router]);

  if (failed) {
    return (
      <ThemedView type="background" style={styles.center} testID="auth-callback-failed">
        <ThemedText type="smallBold">That sign-in did not finish</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          You are still in the same session and nothing was lost. Try again, or use Sign in with an email code.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.note} testID="auth-callback-code">
          {`Error: ${failed.stage} / ${failed.code}${failed.message ? ` / ${failed.message}` : ''}`}
        </ThemedText>
        <Pressable
          onPress={() => {
            setFailed(null);
            leave.current();
          }}
          accessibilityRole="button"
          testID="auth-callback-back"
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <ThemedText style={styles.backText}>Back to the site</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="background" style={styles.center}>
      <ActivityIndicator />
      <ThemedText type="small" themeColor="textSecondary">
        Signing you in…
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  note: { textAlign: 'center', maxWidth: 420 },
  back: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Palette.accent },
  backText: { fontSize: FontSize.body, fontWeight: Weight.bold, color: Palette.accentText },
  pressed: { opacity: 0.8 },
});

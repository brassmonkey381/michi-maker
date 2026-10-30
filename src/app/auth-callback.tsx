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
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { consumeAuthReturn } from '@/lib/authReturn';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    let done = false;
    // Back to where the sign-in started when a note says so (lib/authReturn: the binder a guest
    // was building, with the sheet that asked for the account), else home as before.
    const goHome = () => {
      if (done) return;
      done = true;
      router.replace((consumeAuthReturn() ?? '/') as Href);
    };
    (async () => {
      try {
        // `detectSessionInUrl` usually already consumed the code by mount; if it survived here,
        // exchange it ourselves. A used/absent code just rejects — harmless, we still go home.
        if (supabase && typeof code === 'string' && code) {
          await supabase.auth.exchangeCodeForSession(code).catch(() => undefined);
        }
      } finally {
        goHome();
      }
    })();
    const safety = setTimeout(goHome, 4000); // never strand on this screen
    return () => clearTimeout(safety);
  }, [code, router]);

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
});

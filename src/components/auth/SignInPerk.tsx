/**
 * Inline "this is a signed-in feature" note for guests / signed-out visitors — shown wherever
 * guest access differs from a real account (card labels, ✨ auto-fill, anything catalog-backed).
 * A short message plus a Sign in link that opens the auth sheet in place, so upgrading is one
 * tap away from the feature that needed it.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { ThemedText } from '@/components/themed-text';
import { track } from '@/lib/analytics';
import { useAuth } from '@/store/auth';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { forgetAuthReturn, rememberAuthReturn } from '@/lib/authReturn';

export function SignInPerk({
  message,
  returnTo,
  surface = 'unknown',
}: {
  message: string;
  /**
   * Where a web OAuth round trip should land afterwards - this surface, with whatever query
   * reopens it (e.g. the binder with `fill=<slot>`). Pinned on press, dropped if the sheet closes
   * without leaving the page. See lib/authReturn.
   */
  returnTo?: string;
  /** Where this wall stands, for signin.perk_shown and signin.perk_click (analytics-studio, 2026-10-29). */
  surface?: string;
}) {
  // A GUEST IS ASKED TO CREATE AN ACCOUNT, NOT TO SIGN IN (owner, 2026-10-29): a guest has no
  // account to sign in to, and the word sent people looking for a password they never set.
  const auth = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  // Seen once per mount: a guest wall used to leave no trace, so "hit a wall" was invisible.
  useEffect(() => {
    track('signin.perk_shown', { surface, guest: auth.isGuest });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one impression per mount
  }, []);
  const open = () => {
    track('signin.perk_click', { surface, guest: auth.isGuest });
    if (returnTo) rememberAuthReturn(returnTo, true);
    setAuthOpen(true);
  };
  const close = () => {
    if (returnTo) forgetAuthReturn();
    setAuthOpen(false);
  };
  return (
    <>
      <View style={styles.note}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
        <Pressable
          onPress={open}
          hitSlop={6}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.btnText}>
            {auth.isGuest ? 'Create account' : 'Sign in'}
          </ThemedText>
        </Pressable>
      </View>
      <AuthSheet visible={authOpen} onClose={close} />
    </>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
    maxWidth: 460,
  },
  text: { flex: 1, lineHeight: 18 },
  btn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.label },
  pressed: { opacity: 0.7 },
});

/**
 * A calm, non-blocking notice shown on home when cloud is configured but no session could be
 * established (e.g. anonymous sign-in is unavailable). In that state binders can't be saved, so
 * rather than let edits fail silently we say so plainly and offer a one-tap Sign in. Hidden
 * whenever a session exists (guest or account) — then work saves fine — and in local mode.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { isSupabaseConfigured } from '@/lib/env';
import { useAuth } from '@/store/auth';

export function GuestBanner() {
  const { ready, user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  // Only when cloud is on, auth has settled, and there's no session at all (so writes won't save).
  if (!isSupabaseConfigured || !ready || user) return null;

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.textCol}>
          <ThemedText type="smallBold" style={styles.title}>
            Sign in to save your binders
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            You’re not signed in, so binders you make here won’t be kept after you leave.
          </ThemedText>
        </View>
        <Pressable
          onPress={() => setAuthOpen(true)}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.btnText}>
            Sign in
          </ThemedText>
        </Pressable>
      </View>
      <AuthSheet visible={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairlineStrong,
    backgroundColor: Palette.panel,
  },
  textCol: { flex: 1, gap: 2 },
  title: {},
  body: { lineHeight: 18 },
  btn: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    backgroundColor: Palette.accent,
  },
  pressed: { opacity: 0.7 },
  btnText: { color: Palette.accentText, fontSize: FontSize.control },
});

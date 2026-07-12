/**
 * Inline "this is a signed-in feature" note for guests / signed-out visitors — shown wherever
 * guest access differs from a real account (card labels, ✨ auto-fill, anything catalog-backed).
 * A short message plus a Sign in link that opens the auth sheet in place, so upgrading is one
 * tap away from the feature that needed it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthSheet } from '@/components/auth/AuthSheet';
import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';

export function SignInPerk({ message }: { message: string }) {
  const [authOpen, setAuthOpen] = useState(false);
  return (
    <>
      <View style={styles.note}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
        <Pressable
          onPress={() => setAuthOpen(true)}
          hitSlop={6}
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

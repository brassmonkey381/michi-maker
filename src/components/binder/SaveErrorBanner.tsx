/**
 * Says out loud that a save didn't land.
 *
 * Edits are optimistic: the pocket fills the moment you drop a card in, and the write to Supabase
 * goes out behind it. When that write fails, the screen keeps showing the card and the server has
 * nothing — and until now the only trace was a console warning. That silence is what made a lost
 * binder undiagnosable after the fact: by the time anyone reloaded and saw the gap, there was no
 * record of what had been there or when it went.
 *
 * So: one banner, at the moment it happens, offering the honest recovery. "Reload" pulls the
 * server's copy, which is what a refresh would have given anyway — better to see the real state
 * now than to keep editing a screen that is quietly fictional.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { useBinders } from '@/store/binders';

export function SaveErrorBanner() {
  const { saveError, clearSaveError, refreshUserBinders } = useBinders();
  const [reloading, setReloading] = useState(false);

  if (!saveError) return null;

  const reload = () => {
    setReloading(true);
    refreshUserBinders()
      .catch(() => {
        // Still offline, most likely. Leave the banner up — it is still true.
      })
      .then(() => {
        setReloading(false);
        clearSaveError();
      });
  };

  return (
    <View style={styles.banner}>
      <View style={styles.textCol}>
        <ThemedText type="smallBold" style={styles.title}>
          A change didn’t save
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
          What you see here may not match what’s saved. Reload to see the version on the server.
        </ThemedText>
      </View>
      <Pressable
        onPress={reload}
        disabled={reloading}
        accessibilityRole="button"
        style={({ pressed }) => [styles.btn, pressed && styles.pressed, reloading && styles.pressed]}>
        <ThemedText type="smallBold" style={styles.btnText}>
          {reloading ? 'Reloading…' : 'Reload'}
        </ThemedText>
      </Pressable>
      <Pressable onPress={clearSaveError} hitSlop={10} accessibilityLabel="Dismiss">
        <ThemedText type="smallBold" themeColor="textSecondary">
          ✕
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.danger,
    backgroundColor: Palette.dangerBg,
  },
  textCol: { flex: 1, gap: 2 },
  title: { color: Palette.danger },
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

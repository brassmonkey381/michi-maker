/**
 * Inline "this needs a paid plan" note — the upgrade sibling of SignInPerk, shown wherever a
 * limit or paid feature blocks a signed-in (free/guest) user. Same rule as sign-in gating:
 * ALWAYS an inline, honest note, never a silent no-op or dead spinner.
 *
 * Checkout isn't wired yet (provider undecided — see docs/PAYMENTS.md), so the "Upgrade" button
 * can't take money; pressing it reveals an honest "plans are coming soon" line rather than a
 * dead-end purchase flow. When checkout lands, swap the toggle for a launch into hosted checkout
 * (carry the Supabase user id) — the surrounding gate logic doesn't change.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';

export function UpgradePerk({
  message,
  /** Button label — defaults to "Upgrade". */
  cta = 'Upgrade',
}: {
  message: string;
  cta?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <View style={styles.wrap}>
      <View style={styles.note}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
        <Pressable
          onPress={() => setRevealed(true)}
          hitSlop={6}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.btnText}>
            {cta}
          </ThemedText>
        </Pressable>
      </View>
      {revealed ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.soon}>
          Paid plans aren’t open quite yet — check back soon.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two, maxWidth: 460 },
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
  soon: { paddingHorizontal: Spacing.three, lineHeight: 18 },
});

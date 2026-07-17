/**
 * Inline "this needs a paid plan" note — the upgrade sibling of SignInPerk, shown wherever a
 * limit or paid feature blocks a signed-in (free/guest) user. Same rule as sign-in gating:
 * ALWAYS an inline, honest note, never a silent no-op or dead spinner.
 *
 * The button navigates to /subscriptions, which owns the plan story (and, while checkout is
 * closed, the honest "plans are coming soon" line). When checkout lands, /subscriptions' CTAs
 * launch it — this component doesn't change.
 */
import { useRouter } from 'expo-router';
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
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <View style={styles.note}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          {message}
        </ThemedText>
        <Pressable
          onPress={() => router.push('/subscriptions')}
          hitSlop={6}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.btnText}>
            {cta}
          </ThemedText>
        </Pressable>
      </View>
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
});

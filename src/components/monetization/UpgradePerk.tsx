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
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontSize, Palette, Radius, Spacing } from '@/constants/theme';
import { TRIAL_CTA_LABEL } from '@/data/subscriptions';
import { useTrial } from '@/hooks/use-trial';

export function UpgradePerk({
  message,
  /** Button label. Defaults to "Try PRO for FREE" for an account that can still have the free
   *  days at checkout, and "Upgrade to PRO" otherwise (owner, 2026-10-11). */
  cta,
  /** Runs before navigating (e.g. close a covering modal so /plans is actually visible). */
  onBeforePress,
}: {
  message: string;
  cta?: string;
  onBeforePress?: () => void;
}) {
  const router = useRouter();
  const trial = useTrial();
  const label = cta ?? (!trial.loading && trial.state === 'eligible' ? TRIAL_CTA_LABEL : 'Upgrade to PRO');
  // STACKED ON A PHONE (owner, 2026-10-29, Fill page screenshot): side by side, the sentence
  // became a column two words wide beside the button. Under 500pt the button sits below it.
  const narrow = useWindowDimensions().width < 500;
  return (
    <View style={styles.wrap}>
      <View style={[styles.note, narrow && styles.noteStacked]}>
        <ThemedText type="small" themeColor="textSecondary" style={[styles.text, narrow && styles.textStacked]}>
          {message}
        </ThemedText>
        <Pressable
          onPress={() => {
            onBeforePress?.();
            router.push('/plans');
          }}
          hitSlop={6}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.btnText}>
            {label}
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
  noteStacked: { flexDirection: 'column', alignItems: 'flex-start', gap: Spacing.two },
  textStacked: { flex: 0 },
  btn: {
    backgroundColor: Palette.accent,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  btnText: { color: Palette.accentText, fontSize: FontSize.label },
  pressed: { opacity: 0.7 },
});
